import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Peer } from 'peerjs';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Shuffle,
  Share2,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Users,
  Bot,
  RefreshCw,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Award
} from 'lucide-react';
import { generateBoard, evaluateBoard, getBestBotMove } from './utils/bingoEngine';
import {
  playTapSound,
  playOpponentTapSound,
  playLineCompleteSound,
  playWinFanfare,
  playShuffleSound,
  toggleSoundMuted,
  getSoundMuted
} from './utils/sound';

const PEER_PREFIX = 'bingo25-live-room-';
const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

export default function App() {
  // Navigation / Game State Machine: 'lobby' | 'waiting' | 'playing' | 'gameover'
  const [screen, setScreen] = useState('lobby');

  // Player identity
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('bingo_player_name') || `Player #${Math.floor(100 + Math.random() * 900)}`;
  });
  const [opponentName, setOpponentName] = useState('Opponent');

  // Multiplayer Connection State
  const [role, setRole] = useState('host'); // 'host' | 'guest' | 'solo'
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isUrlJoin, setIsUrlJoin] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'connecting' | 'connected' | 'error'
  const [peerError, setPeerError] = useState('');

  // Audio mute state
  const [isMuted, setIsMuted] = useState(getSoundMuted());

  // Game Board & Logic State
  const [board, setBoard] = useState(() => generateBoard());
  const [botBoard, setBotBoard] = useState(() => generateBoard());
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [lastCalled, setLastCalled] = useState(null);
  const [turn, setTurn] = useState('host'); // 'host' | 'guest' | 'player' | 'bot'
  const [firstTurnRole, setFirstTurnRole] = useState('host');

  // Winner State
  const [winnerInfo, setWinnerInfo] = useState(null); // { winner: 'local'|'opponent'|'tie', name: string, reason: string }
  const [rematchStatus, setRematchStatus] = useState('none'); // 'none' | 'requested' | 'received'

  // Progress stats
  const [opponentLinesCount, setOpponentLinesCount] = useState(0);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);

  // WebRTC refs
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // Evaluation of current board
  const { completedLinesCount, winningTileIndices } = evaluateBoard(board, calledNumbers);

  // Trigger floating iOS Toast
  const showToast = useCallback((msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  // Sync player name changes
  const handleNameChange = (newName) => {
    setPlayerName(newName);
    localStorage.setItem('bingo_player_name', newName);
  };

  // Sound toggle handler
  const handleToggleMute = () => {
    const nextMuted = toggleSoundMuted();
    setIsMuted(nextMuted);
    showToast(nextMuted ? 'Sound Muted' : 'Sound Enabled');
  };

  // Inspect URL for auto-join room code on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');
      if (urlRoom && /^\d{4}$/.test(urlRoom)) {
        setInputCode(urlRoom);
        setIsUrlJoin(true);
      }
    } catch (e) {
      // ignore URL parsing error
    }
  }, []);

  // Cleanup WebRTC connections on unmount
  useEffect(() => {
    return () => {
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Track completed lines to play chime
  const prevCompletedLinesRef = useRef(0);
  useEffect(() => {
    if (completedLinesCount > prevCompletedLinesRef.current && screen === 'playing') {
      playLineCompleteSound();
    }
    prevCompletedLinesRef.current = completedLinesCount;
  }, [completedLinesCount, screen]);

  // Confetti celebration helper
  const fireVictoryConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.65 }
    });
    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.55 },
        colors: ['#FBBF24', '#10B981', '#6366F1', '#EC4899']
      });
    }, 300);
  };

  // Setup Peer message handlers
  const attachDataHandler = (conn) => {
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'HELLO': {
          setOpponentName(data.name || 'Opponent');
          // Host replies with HELLO_ACK
          conn.send({
            type: 'HELLO_ACK',
            name: playerName,
            turn: 'host'
          });
          setScreen('playing');
          setRole('host');
          setTurn('host');
          setFirstTurnRole('host');
          showToast(`${data.name || 'Friend'} joined! Game started!`);
          break;
        }

        case 'HELLO_ACK': {
          setOpponentName(data.name || 'Opponent');
          setScreen('playing');
          setTurn(data.turn || 'host');
          setFirstTurnRole(data.turn || 'host');
          showToast(`Connected with ${data.name || 'Friend'}!`);
          break;
        }

        case 'LINE_UPDATE': {
          if (typeof data.linesCount === 'number') {
            setOpponentLinesCount(data.linesCount);
          }
          break;
        }

        case 'CALL_NUMBER': {
          const calledNum = data.number;
          setLastCalled(calledNum);
          playOpponentTapSound();

          setCalledNumbers((prev) => {
            if (prev.includes(calledNum)) return prev;
            const updated = [...prev, calledNum];

            // Evaluate local board with the new number
            const localEval = evaluateBoard(board, updated);

            // Check for simultaneous win
            if (data.isClaimingWin && localEval.completedLinesCount >= 5) {
              // Both reached 5 lines simultaneously!
              setWinnerInfo({
                winner: 'tie',
                name: 'Both Players',
                reason: 'Simultaneous B-I-N-G-O! It is a Tie!'
              });
              setScreen('gameover');
              playWinFanfare();
              fireVictoryConfetti();
              conn.send({ type: 'CLAIM_TIE' });
              return updated;
            }

            if (data.isClaimingWin) {
              // Opponent won
              setWinnerInfo({
                winner: 'opponent',
                name: data.senderName || opponentName,
                reason: `${data.senderName || opponentName} achieved B-I-N-G-O!`
              });
              setScreen('gameover');
              return updated;
            }

            if (localEval.completedLinesCount >= 5) {
              // Calling this number caused local player to win!
              setWinnerInfo({
                winner: 'local',
                name: playerName,
                reason: 'You achieved B-I-N-G-O!'
              });
              setScreen('gameover');
              playWinFanfare();
              fireVictoryConfetti();
              conn.send({
                type: 'CLAIM_WIN',
                winnerName: playerName,
                senderName: playerName
              });
              return updated;
            }

            return updated;
          });

          if (typeof data.linesCount === 'number') {
            setOpponentLinesCount(data.linesCount);
          }

          setTurn(data.nextTurn);
          break;
        }

        case 'CLAIM_WIN': {
          setWinnerInfo({
            winner: 'opponent',
            name: data.winnerName || opponentName,
            reason: `${data.winnerName || opponentName} achieved 5 lines!`
          });
          setScreen('gameover');
          break;
        }

        case 'CLAIM_TIE': {
          setWinnerInfo({
            winner: 'tie',
            name: 'Both Players',
            reason: 'Simultaneous B-I-N-G-O! It is a Tie!'
          });
          setScreen('gameover');
          playWinFanfare();
          fireVictoryConfetti();
          break;
        }

        case 'REMATCH_REQUEST': {
          setRematchStatus('received');
          showToast(`${opponentName} wants a rematch!`);
          break;
        }

        case 'REMATCH_ACCEPT': {
          startNewRound(data.nextStartingTurn);
          showToast('Rematch started!');
          break;
        }

        case 'LEAVE': {
          showToast(`${opponentName} left the game.`);
          setConnectionStatus('idle');
          setScreen('lobby');
          break;
        }

        default:
          break;
      }
    });

    conn.on('close', () => {
      showToast('Opponent disconnected');
      setConnectionStatus('idle');
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      showToast('Connection error');
    });
  };

  // Helper to start fresh round for rematch
  const startNewRound = (startingTurn) => {
    const freshBoard = generateBoard();
    const freshBotBoard = generateBoard();
    setBoard(freshBoard);
    setBotBoard(freshBotBoard);
    setCalledNumbers([]);
    setLastCalled(null);
    setWinnerInfo(null);
    setRematchStatus('none');
    setOpponentLinesCount(0);
    prevCompletedLinesRef.current = 0;
    setTurn(startingTurn);
    setFirstTurnRole(startingTurn);
    setScreen('playing');
  };

  // 1. Host: Create Room Flow
  const handleCreateRoom = () => {
    if (peerRef.current) peerRef.current.destroy();

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(code);
    setRole('host');
    setPeerError('');
    setConnectionStatus('connecting');
    setScreen('waiting');

    const peer = new Peer(PEER_PREFIX + code, {
      debug: 1
    });
    peerRef.current = peer;

    peer.on('open', () => {
      setConnectionStatus('idle');
    });

    peer.on('connection', (conn) => {
      connRef.current = conn;
      conn.on('open', () => {
        setConnectionStatus('connected');
        attachDataHandler(conn);
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        // Room code taken, retry with new code
        handleCreateRoom();
      } else {
        setPeerError(err.message || 'Unable to connect to matchmaking server.');
        setConnectionStatus('error');
      }
    });
  };

  // 2. Guest: Join Room Flow
  const handleJoinRoom = (targetCode) => {
    const code = (targetCode || inputCode).trim();
    if (!/^\d{4}$/.test(code)) {
      showToast('Please enter a valid 4-digit room code');
      return;
    }

    if (peerRef.current) peerRef.current.destroy();

    setRoomCode(code);
    setRole('guest');
    setPeerError('');
    setConnectionStatus('connecting');

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const hostPeerId = PEER_PREFIX + code;
      const conn = peer.connect(hostPeerId, { reliable: true });
      connRef.current = conn;

      conn.on('open', () => {
        setConnectionStatus('connected');
        attachDataHandler(conn);
        conn.send({
          type: 'HELLO',
          name: playerName
        });
      });

      conn.on('error', (err) => {
        console.error('Guest connection error:', err);
        setPeerError('Could not reach host room. Check code and try again.');
        setConnectionStatus('error');
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setPeerError('Failed to initialize connection. Please try again.');
      setConnectionStatus('error');
    });
  };

  // 3. Solo Practice vs Smart Bot Mode Flow
  const handlePlaySolo = () => {
    if (peerRef.current) peerRef.current.destroy();
    setRole('solo');
    setOpponentName('Smart Bot (AI)');
    setBoard(generateBoard());
    setBotBoard(generateBoard());
    setCalledNumbers([]);
    setLastCalled(null);
    setWinnerInfo(null);
    setRematchStatus('none');
    setOpponentLinesCount(0);
    prevCompletedLinesRef.current = 0;
    setTurn('player');
    setFirstTurnRole('player');
    setScreen('playing');
    showToast('Solo Mode: You go first!');
  };

  // Share Invite Link Helper (iOS Web Share API with Clipboard Fallback)
  const handleShareInvite = async () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Play 1-25 Bingo!',
          text: `Join my 1-25 Bingo game with code ${roomCode}!`,
          url: inviteUrl
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          copyToClipboard(inviteUrl);
        }
      }
    } else {
      copyToClipboard(inviteUrl);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => showToast('Invite Link Copied!'),
      () => showToast('Failed to copy link')
    );
  };

  // Shuffle Board before first move
  const handleShuffleBoard = () => {
    if (calledNumbers.length > 0) return;
    playShuffleSound();
    setBoard(generateBoard());
    showToast('Board reshuffled!');
  };

  // Human Player taps a number tile
  const handleTileClick = (number) => {
    if (screen !== 'playing') return;

    // Check turn
    const isMyTurn = role === 'solo' ? turn === 'player' : turn === role;
    if (!isMyTurn) {
      showToast("Wait for opponent's turn!");
      return;
    }

    if (calledNumbers.includes(number)) return;

    // Process move
    playTapSound();
    const nextCalled = [...calledNumbers, number];
    setCalledNumbers(nextCalled);
    setLastCalled(number);

    // Evaluate local board
    const localEval = evaluateBoard(board, nextCalled);
    const hasWon = localEval.completedLinesCount >= 5;

    if (role === 'solo') {
      // Solo Bot Mode
      if (hasWon) {
        setWinnerInfo({
          winner: 'local',
          name: playerName,
          reason: 'You achieved B-I-N-G-O!'
        });
        setScreen('gameover');
        playWinFanfare();
        fireVictoryConfetti();
        return;
      }

      // Check bot lines count
      const botEval = evaluateBoard(botBoard, nextCalled);
      setOpponentLinesCount(botEval.completedLinesCount);

      if (botEval.completedLinesCount >= 5) {
        setWinnerInfo({
          winner: 'opponent',
          name: 'Smart Bot (AI)',
          reason: 'Smart Bot achieved B-I-N-G-O!'
        });
        setScreen('gameover');
        return;
      }

      // Switch to bot's turn
      setTurn('bot');
    } else {
      // Multiplayer WebRTC Mode
      const nextTurnRole = role === 'host' ? 'guest' : 'host';
      setTurn(nextTurnRole);

      // Send CALL_NUMBER to peer
      if (connRef.current && connRef.current.open) {
        connRef.current.send({
          type: 'CALL_NUMBER',
          number,
          nextTurn: nextTurnRole,
          isClaimingWin: hasWon,
          senderName: playerName,
          linesCount: localEval.completedLinesCount
        });
      }

      if (hasWon) {
        setWinnerInfo({
          winner: 'local',
          name: playerName,
          reason: 'You achieved B-I-N-G-O!'
        });
        setScreen('gameover');
        playWinFanfare();
        fireVictoryConfetti();
      }
    }
  };

  // Bot Turn Automation in Solo Mode (natural 650ms delay)
  useEffect(() => {
    if (role !== 'solo' || screen !== 'playing' || turn !== 'bot') return;

    const timer = setTimeout(() => {
      const chosenNum = getBestBotMove(botBoard, calledNumbers);
      playOpponentTapSound();

      setLastCalled(chosenNum);
      const nextCalled = [...calledNumbers, chosenNum];
      setCalledNumbers(nextCalled);

      // Evaluate both boards with bot's pick
      const playerEval = evaluateBoard(board, nextCalled);
      const botEval = evaluateBoard(botBoard, nextCalled);

      setOpponentLinesCount(botEval.completedLinesCount);

      const botWon = botEval.completedLinesCount >= 5;
      const playerWon = playerEval.completedLinesCount >= 5;

      if (botWon && playerWon) {
        setWinnerInfo({
          winner: 'tie',
          name: 'Both Players',
          reason: 'Simultaneous B-I-N-G-O! It is a Tie!'
        });
        setScreen('gameover');
        playWinFanfare();
        fireVictoryConfetti();
      } else if (botWon) {
        setWinnerInfo({
          winner: 'opponent',
          name: 'Smart Bot (AI)',
          reason: 'Smart Bot achieved 5 lines!'
        });
        setScreen('gameover');
      } else if (playerWon) {
        setWinnerInfo({
          winner: 'local',
          name: playerName,
          reason: 'You achieved B-I-N-G-O!'
        });
        setScreen('gameover');
        playWinFanfare();
        fireVictoryConfetti();
      } else {
        setTurn('player');
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [role, screen, turn, botBoard, calledNumbers, board, playerName]);

  // Handle Rematch Click
  const handleRematch = () => {
    const nextStart = firstTurnRole === 'host' ? 'guest' : 'host';

    if (role === 'solo') {
      const nextSoloStart = firstTurnRole === 'player' ? 'bot' : 'player';
      startNewRound(nextSoloStart);
      showToast(nextSoloStart === 'player' ? 'New game! Your turn.' : 'New game! Bot starts.');
      return;
    }

    if (rematchStatus === 'received') {
      // Accept rematch
      if (connRef.current && connRef.current.open) {
        connRef.current.send({
          type: 'REMATCH_ACCEPT',
          nextStartingTurn: nextStart
        });
      }
      startNewRound(nextStart);
    } else {
      // Request rematch
      setRematchStatus('requested');
      if (connRef.current && connRef.current.open) {
        connRef.current.send({
          type: 'REMATCH_REQUEST'
        });
      }
      showToast('Rematch request sent to opponent');
    }
  };

  // Leave Game / Back to Lobby
  const handleLeaveToLobby = () => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'LEAVE' });
      connRef.current.close();
    }
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    setScreen('lobby');
    setConnectionStatus('idle');
    setWinnerInfo(null);
    setRematchStatus('none');
    setCalledNumbers([]);
    setLastCalled(null);
  };

  // Determine whose turn it is for display
  const isLocalTurn = role === 'solo' ? turn === 'player' : turn === role;
  const currentTurnName = isLocalTurn ? 'Your Turn' : `${opponentName}'s Turn`;

  return (
    <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-[#090A0F] text-[#F8FAFC]">
      {/* Background Ambient Glow Orbs */}
      <div className="ambient-glow-wrapper">
        <div className="glow-orb-top-left" />
        <div className="glow-orb-bottom-right" />
      </div>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full glass-panel shadow-2xl flex items-center gap-2 border border-white/20 text-sm font-semibold text-white tracking-wide"
          >
            <Sparkles size={16} className="text-amber-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* SCREEN 1: LOBBY */}
      {/* ================================================================ */}
      {screen === 'lobby' && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between px-5 py-6 max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-700 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-indigo-500/30">
                25
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                  BINGO <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">PRO</span>
                </h1>
                <p className="text-[11px] font-medium text-slate-400 tracking-wider">ZERO-BACKEND MULTIPLAYER</p>
              </div>
            </div>

            <button
              onClick={handleToggleMute}
              className="w-10 h-10 rounded-full glass-button flex items-center justify-center text-slate-300"
              title="Toggle Sound"
              aria-label="Toggle Sound"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>

          {/* Middle Card: Name Input & Modes */}
          <div className="my-auto space-y-4 py-4">
            {/* Player Name Pill */}
            <div className="glass-card p-4 space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Your Nickname
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={15}
                  value={playerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-slate-900/60 border border-slate-700/60 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-base font-semibold text-white placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            {/* Create Room Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateRoom}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-base shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 border border-indigo-400/30"
            >
              <Users size={20} />
              <span>Create 2-Player Room</span>
            </motion.button>

            {/* Join Room Box */}
            <div className={`glass-card p-4 space-y-3 transition-all ${isUrlJoin ? 'ring-2 ring-indigo-500/80 bg-indigo-950/20' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {isUrlJoin ? "Friend's Invite Link Detected" : "Join Friend's Room"}
                </span>
                {isUrlJoin && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
                    Ready
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.slice(0, 4))}
                  placeholder="4-digit code"
                  className="w-full bg-slate-900/60 border border-slate-700/60 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-white placeholder-slate-500 outline-none transition"
                />
                <button
                  onClick={() => handleJoinRoom()}
                  disabled={connectionStatus === 'connecting' || inputCode.length !== 4}
                  className="px-5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white font-bold text-sm border border-slate-600/50 transition flex items-center justify-center"
                >
                  {connectionStatus === 'connecting' ? 'Joining...' : 'Join'}
                </button>
              </div>

              {peerError && (
                <p className="text-xs text-rose-400 flex items-center gap-1.5 pt-1">
                  <AlertCircle size={14} />
                  <span>{peerError}</span>
                </p>
              )}
            </div>

            {/* Solo Practice vs Smart Bot */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handlePlaySolo}
              className="w-full py-3.5 rounded-2xl glass-button text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-800/80"
            >
              <Bot size={18} className="text-emerald-400" />
              <span>Play Solo vs Smart Bot</span>
            </motion.button>
          </div>

          {/* Footer Info */}
          <div className="text-center pb-2">
            <p className="text-[11px] text-slate-400">
              WebRTC P2P Realtime • Complete 5 lines to Win B-I-N-G-O
            </p>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SCREEN 2: WAITING ROOM (HOST) */}
      {/* ================================================================ */}
      {screen === 'waiting' && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between px-5 py-6 max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleLeaveToLobby}
              className="px-3 py-1.5 rounded-full glass-button text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <ArrowLeft size={14} />
              <span>Cancel</span>
            </button>
            <span className="text-xs font-semibold text-indigo-400 tracking-wider">ROOM HOST</span>
          </div>

          {/* Center Card */}
          <div className="my-auto text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">Room Created!</h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Share this 4-digit code or link with your friend to connect and play.
              </p>
            </div>

            {/* Giant Room Code Display */}
            <div className="glass-card py-6 px-4 max-w-xs mx-auto relative overflow-hidden border border-indigo-500/40 shadow-2xl shadow-indigo-950/50">
              <div className="text-[11px] uppercase font-bold text-slate-400 tracking-widest mb-1">
                Room Code
              </div>
              <div className="text-5xl font-black tracking-widest text-indigo-300 font-mono">
                {roomCode}
              </div>
            </div>

            {/* Share / Copy Buttons */}
            <div className="space-y-2.5 max-w-xs mx-auto">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleShareInvite}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 border border-emerald-400/30"
              >
                <Share2 size={18} />
                <span>Share Invite Link</span>
              </motion.button>

              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
                  copyToClipboard(url);
                }}
                className="w-full py-3 rounded-2xl glass-button text-xs font-semibold text-slate-300 flex items-center justify-center gap-2"
              >
                <Copy size={15} />
                <span>Copy Shareable URL</span>
              </button>
            </div>

            {/* Pulse Waiting Status */}
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 pt-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>Waiting for friend to join...</span>
            </div>
          </div>

          <div className="text-center pb-2">
            <p className="text-[11px] text-slate-400">
              The game will automatically launch when your friend connects.
            </p>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SCREEN 3: GAME ARENA */}
      {/* ================================================================ */}
      {(screen === 'playing' || screen === 'gameover') && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between px-4 py-3 max-w-md mx-auto">
          {/* Top Bar: Opponents & Turn Pill */}
          <div className="w-full flex items-center justify-between pt-1">
            {/* Left: Leave button */}
            <button
              onClick={handleLeaveToLobby}
              className="p-2 rounded-xl glass-button text-slate-400 hover:text-white"
              title="Leave Room"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Center: Turn Status Pill */}
            <motion.div
              animate={isLocalTurn ? { scale: [1, 1.03, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2.2 }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border transition-all ${
                isLocalTurn
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-lg shadow-emerald-500/20'
                  : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isLocalTurn ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'
                }`}
              />
              <span>{currentTurnName}</span>
            </motion.div>

            {/* Right: Sound toggle */}
            <button
              onClick={handleToggleMute}
              className="p-2 rounded-xl glass-button text-slate-400 hover:text-white"
              title="Toggle Sound"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          {/* Players Badge & Opponent Progress */}
          <div className="flex items-center justify-between px-2 py-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-bold text-slate-200">{playerName}</span>
              <span className="text-[10px] text-slate-400">(You)</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400">
                {role === 'solo' ? 'Bot' : opponentName}: {opponentLinesCount}/5
              </span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < opponentLinesCount ? 'bg-amber-400' : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* B-I-N-G-O Header Badges */}
          <div className="flex items-center justify-center gap-2.5 my-1">
            {BINGO_LETTERS.map((letter, index) => {
              const isActive = completedLinesCount > index;
              return (
                <motion.div
                  key={letter}
                  animate={isActive ? { scale: [1, 1.15, 1.06] } : { scale: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`bingo-badge ${isActive ? 'active' : 'inactive'}`}
                >
                  {letter}
                </motion.div>
              );
            })}
          </div>

          {/* 5x5 Tactile Grid */}
          <div className="bingo-grid my-auto">
            {board.map((number, index) => {
              const isCalled = calledNumbers.includes(number);
              const isWinning = winningTileIndices.has(index);
              const isLast = lastCalled === number;

              return (
                <button
                  key={number}
                  disabled={isCalled || screen === 'gameover'}
                  onClick={() => handleTileClick(number)}
                  className={`bingo-tile ${
                    isWinning ? 'winning' : isCalled ? 'called' : 'uncalled'
                  }`}
                >
                  {/* Last Called Pulse Ring */}
                  {isLast && <div className="last-called-ring" />}
                  <span>{number}</span>
                </button>
              );
            })}
          </div>

          {/* Pre-Game Shuffle Pill / Move Status */}
          <div className="flex flex-col items-center justify-center min-h-[44px] my-1">
            {calledNumbers.length === 0 ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleShuffleBoard}
                className="px-5 py-2 rounded-full glass-button text-xs font-bold text-amber-300 border-amber-400/30 flex items-center gap-2 shadow-lg hover:bg-slate-800"
              >
                <Shuffle size={14} />
                <span>Shuffle My Board</span>
              </motion.button>
            ) : (
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
                <span>
                  Moves: <strong className="text-white">{calledNumbers.length}</strong> / 25
                </span>
                <span>•</span>
                <span>
                  Lines: <strong className="text-amber-400">{completedLinesCount}</strong> / 5
                </span>
                {lastCalled && (
                  <>
                    <span>•</span>
                    <span>
                      Last: <strong className="text-indigo-300">#{lastCalled}</strong>
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: VICTORY / DEFEAT / TIE */}
      {/* ================================================================ */}
      <AnimatePresence>
        {screen === 'gameover' && winnerInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className="glass-card w-full max-w-sm p-6 text-center space-y-5 border border-white/20 shadow-2xl"
            >
              {/* Trophy or Badge Icon */}
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/30">
                {winnerInfo.winner === 'local' ? (
                  <Trophy size={42} strokeWidth={2.2} />
                ) : winnerInfo.winner === 'tie' ? (
                  <Award size={42} strokeWidth={2.2} />
                ) : (
                  <Award size={42} strokeWidth={2.2} />
                )}
              </div>

              {/* Title */}
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-white tracking-tight">
                  {winnerInfo.winner === 'local'
                    ? 'B-I-N-G-O! YOU WON!'
                    : winnerInfo.winner === 'tie'
                    ? 'SIMULTANEOUS TIE!'
                    : `${winnerInfo.name} WON!`}
                </h3>
                <p className="text-xs text-slate-300">{winnerInfo.reason}</p>
              </div>

              {/* Stats Box */}
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Your Lines</span>
                  <span className="text-base font-extrabold text-amber-400">{completedLinesCount} / 5</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Calls</span>
                  <span className="text-base font-extrabold text-white">{calledNumbers.length}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleRematch}
                  disabled={rematchStatus === 'requested'}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 border border-indigo-400/30"
                >
                  <RefreshCw size={16} />
                  <span>
                    {rematchStatus === 'requested'
                      ? 'Waiting for Opponent...'
                      : rematchStatus === 'received'
                      ? 'Accept Rematch!'
                      : 'Play Rematch'}
                  </span>
                </motion.button>

                <button
                  onClick={handleLeaveToLobby}
                  className="w-full py-3 rounded-2xl glass-button text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Back to Lobby
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
