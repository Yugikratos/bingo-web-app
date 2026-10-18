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
  Award,
  Heart,
  Flame,
  RotateCcw,
  Star,
  Swords
} from 'lucide-react';
import { generateBoard, evaluateBoard, getBestBotMove } from './utils/bingoEngine';
import {
  playTapSound,
  playOpponentTapSound,
  playLineCompleteSound,
  playWinFanfare,
  playShuffleSound,
  playRomanticChime,
  toggleSoundMuted,
  getSoundMuted
} from './utils/sound';

const PEER_PREFIX = 'bingo25-live-room-';
const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

// Helper to determine wins needed to clinch a series
function getTargetWins(seriesLength) {
  if (seriesLength === 1) return 1;
  if (seriesLength === 3) return 2;
  if (seriesLength === 5) return 3;
  if (seriesLength === 7) return 4;
  if (seriesLength === 10) return 6;
  return Math.ceil(seriesLength / 2);
}

const DEFAULT_STATS = {
  totalSeriesPlayed: 0,
  localSeriesWon: 0,
  opponentSeriesWon: 0,
  totalRoundsPlayed: 0,
  localRoundsWon: 0,
  opponentRoundsWon: 0,
  currentStreak: 0,
  streakHolder: 'None' // 'local' | 'opponent' | 'None'
};

export default function App() {
  // Navigation / Game State Machine: 'lobby' | 'waiting' | 'playing' | 'round_over' | 'series_over'
  const [screen, setScreen] = useState('lobby');

  // Exclusive "Date Night" Mode (Yugi & Renia)
  const [isDateNight, setIsDateNight] = useState(() => {
    return localStorage.getItem('bingo_date_night') === 'true';
  });

  // Best-of Series Match Engine
  const [seriesLength, setSeriesLength] = useState(3); // 1, 3, 5, 7, 10
  const [currentRound, setCurrentRound] = useState(1);
  const [localScore, setLocalScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);

  // Player identity
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('bingo_player_name') || 'Yugi';
  });
  const [opponentName, setOpponentName] = useState(() => {
    return isDateNight ? 'Renia' : 'Opponent';
  });

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
  const [roundWinnerInfo, setRoundWinnerInfo] = useState(null); // { winner: 'local'|'opponent'|'tie', name: string, reason: string }
  const [seriesWinnerInfo, setSeriesWinnerInfo] = useState(null);
  const [rematchStatus, setRematchStatus] = useState('none'); // 'none' | 'requested' | 'received'

  // Progress stats
  const [opponentLinesCount, setOpponentLinesCount] = useState(0);

  // Persistent Head-to-Head Stats
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem('bingo_h2h_stats_v2');
      return saved ? { ...DEFAULT_STATS, ...JSON.parse(saved) } : DEFAULT_STATS;
    } catch (e) {
      return DEFAULT_STATS;
    }
  });
  const [showStatsModal, setShowStatsModal] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);

  // WebRTC refs
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // Evaluation of current board
  const { completedLinesCount, winningTileIndices } = evaluateBoard(board, calledNumbers);
  const targetWins = getTargetWins(seriesLength);

  // Save stats to localStorage
  const saveStats = useCallback((updatedStats) => {
    setStats(updatedStats);
    try {
      localStorage.setItem('bingo_h2h_stats_v2', JSON.stringify(updatedStats));
    } catch (e) {}
  }, []);

  // Reset persistent stats
  const handleResetStats = () => {
    saveStats(DEFAULT_STATS);
    showToast('Stats reset to zero');
  };

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

  // Date Night Mode toggle handler
  const handleToggleDateNight = () => {
    const nextVal = !isDateNight;
    setIsDateNight(nextVal);
    localStorage.setItem('bingo_date_night', String(nextVal));

    if (nextVal) {
      if (playerName !== 'Yugi' && playerName !== 'Renia') {
        handleNameChange('Yugi');
      }
      setOpponentName(playerName === 'Yugi' ? 'Renia' : 'Yugi');
      playRomanticChime();
      showToast('Date Night Mode Activated! ❤️');
    } else {
      showToast('Classic Mode Activated');
    }
  };

  // Quick switch between Yugi & Renia
  const handleSelectPersona = (persona) => {
    handleNameChange(persona);
    setOpponentName(persona === 'Yugi' ? 'Renia' : 'Yugi');
    playRomanticChime();
    showToast(`Playing as ${persona} 💕`);
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
    } catch (e) {}
  }, []);

  // Cleanup WebRTC connections on unmount
  useEffect(() => {
    return () => {
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Track completed lines to play chime & romantic quotes
  const prevCompletedLinesRef = useRef(0);
  useEffect(() => {
    if (completedLinesCount > prevCompletedLinesRef.current && screen === 'playing') {
      if (isDateNight) {
        playRomanticChime();
        if (completedLinesCount === 4) {
          showToast("4 lines down! ONE AWAY FROM BINGO! Hold your breath! 💓");
        } else {
          const lineQuotes = [
            `${playerName} claimed a line! What a charmer! ❤️`,
            "One line closer to your heart... 💌",
            "That line was pure poetry in motion! ✨",
            `A line for ${playerName}, a smile for us. 🥰`,
            `${playerName} locked in a line! Unstoppable grace! 💕`
          ];
          showToast(lineQuotes[(completedLinesCount - 1) % lineQuotes.length]);
        }
      } else {
        playLineCompleteSound();
      }
    }
    prevCompletedLinesRef.current = completedLinesCount;
  }, [completedLinesCount, screen, isDateNight, playerName, showToast]);

  // Confetti celebrations
  const fireVictoryConfetti = useCallback(() => {
    if (isDateNight) {
      // Romantic Heart & Rose Confetti
      let heartShape = null;
      try {
        if (typeof confetti.shapeFromPath === 'function') {
          heartShape = confetti.shapeFromPath({
            path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          });
        }
      } catch (e) {}

      const shapes = heartShape ? [heartShape, 'circle'] : ['circle'];
      const colors = ['#F43F5E', '#E11D48', '#BE123C', '#FBBF24', '#FDA4AF', '#FFF1F2'];

      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.6 },
        shapes,
        colors,
        scalar: 1.3
      });

      setTimeout(() => {
        confetti({
          particleCount: 110,
          spread: 85,
          origin: { y: 0.5 },
          shapes,
          colors,
          scalar: 1.4
        });
      }, 260);
    } else {
      // Classic Gold & Emerald Confetti
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
    }
  }, [isDateNight]);

  // Record a round win and evaluate series outcome
  const recordRoundResult = useCallback(
    (winnerRole, winnerDisplay) => {
      let nextLocalScore = localScore;
      let nextOpponentScore = opponentScore;

      if (winnerRole === 'local') {
        nextLocalScore += 1;
        setLocalScore(nextLocalScore);
      } else if (winnerRole === 'opponent') {
        nextOpponentScore += 1;
        setOpponentScore(nextOpponentScore);
      }

      // Update rounds in persistent stats
      setStats((prev) => {
        const updated = {
          ...prev,
          totalRoundsPlayed: prev.totalRoundsPlayed + 1,
          localRoundsWon: winnerRole === 'local' ? prev.localRoundsWon + 1 : prev.localRoundsWon,
          opponentRoundsWon: winnerRole === 'opponent' ? prev.opponentRoundsWon + 1 : prev.opponentRoundsWon
        };
        try {
          localStorage.setItem('bingo_h2h_stats_v2', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      // Check for Series Win
      const localClenched = nextLocalScore >= targetWins;
      const opponentClenched = nextOpponentScore >= targetWins;

      if (localClenched || opponentClenched) {
        const seriesWinner = localClenched ? 'local' : 'opponent';
        const seriesWinnerName = localClenched ? playerName : opponentName;

        const seriesVictoryQuotes = [
          `${seriesWinnerName} is the undisputed Date Night Queen! 👑💖`,
          `${seriesWinnerName} takes the crown, but surrenders all hugs! 🥂🌹`,
          `Victory sealed with a kiss! 💋`,
          `${seriesWinnerName} gets forehead kisses on demand for 24 hours! 😘`,
          `All hail the reigning Bingo Monarch! 👸`,
          `Defeated by your cuteness and your 5x5 grid! 🫠`
        ];

        const romanticSeriesReason =
          seriesVictoryQuotes[(nextLocalScore + nextOpponentScore) % seriesVictoryQuotes.length];

        setSeriesWinnerInfo({
          winner: seriesWinner,
          name: seriesWinnerName,
          finalScore: `${nextLocalScore} - ${nextOpponentScore}`,
          reason: isDateNight
            ? romanticSeriesReason
            : `${seriesWinnerName} won the Best of ${seriesLength} Series!`
        });

        // Update series in persistent stats
        setStats((prev) => {
          const isWinnerLocal = seriesWinner === 'local';
          const newStreak =
            prev.streakHolder === seriesWinner ? prev.currentStreak + 1 : 1;
          const updated = {
            ...prev,
            totalSeriesPlayed: prev.totalSeriesPlayed + 1,
            localSeriesWon: isWinnerLocal ? prev.localSeriesWon + 1 : prev.localSeriesWon,
            opponentSeriesWon: !isWinnerLocal ? prev.opponentSeriesWon + 1 : prev.opponentSeriesWon,
            currentStreak: newStreak,
            streakHolder: seriesWinner
          };
          try {
            localStorage.setItem('bingo_h2h_stats_v2', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });

        setScreen('series_over');
        playWinFanfare();
        fireVictoryConfetti();
      } else {
        // Round concluded, series continues
        const tieReasons = [
          "It's a tie! Destined minds think alike. 💫",
          "Simultaneous BINGO! Even our boards are in love. ❤️",
          "A perfect tie — soulmates can’t even beat each other! 🥂",
          "Two boards, one heartbeat. It’s a draw! 🕊️",
          "Neither loses, meaning double the hugs! 🫂",
          "Cosmic synchronization: 100% matched. 🌌"
        ];

        const roundWinQuotes = [
          `${winnerDisplay} claimed a line & took the round! What a charmer! ❤️`,
          `That round was pure poetry in motion! ✨`,
          `A round for ${winnerDisplay}, a smile for us both. 🥰`,
          `${winnerDisplay} locked in 5 lines with unstoppable grace! 💕`
        ];

        let roundReason = `${winnerDisplay} completed 5 lines!`;
        if (isDateNight) {
          if (winnerRole === 'tie') {
            roundReason = tieReasons[currentRound % tieReasons.length];
          } else {
            roundReason = roundWinQuotes[currentRound % roundWinQuotes.length];
          }
        }

        setRoundWinnerInfo({
          winner: winnerRole,
          name: winnerDisplay,
          reason: roundReason,
          localScore: nextLocalScore,
          opponentScore: nextOpponentScore,
          roundNum: currentRound
        });
        setScreen('round_over');
        playWinFanfare();
        fireVictoryConfetti();
      }
    },
    [
      localScore,
      opponentScore,
      targetWins,
      currentRound,
      playerName,
      opponentName,
      isDateNight,
      seriesLength,
      fireVictoryConfetti
    ]
  );

  // Setup Peer message handlers
  const attachDataHandler = (conn) => {
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'HELLO': {
          setOpponentName(data.name || 'Opponent');
          if (data.isDateNight) {
            setIsDateNight(true);
          }
          // Host replies with HELLO_ACK syncing series settings
          conn.send({
            type: 'HELLO_ACK',
            name: playerName,
            turn: 'host',
            seriesLength,
            isDateNight
          });
          setScreen('playing');
          setRole('host');
          setTurn('host');
          setFirstTurnRole('host');
          setLocalScore(0);
          setOpponentScore(0);
          setCurrentRound(1);
          showToast(`${data.name || 'Friend'} joined! Series: Best of ${seriesLength}`);
          break;
        }

        case 'HELLO_ACK': {
          setOpponentName(data.name || 'Opponent');
          if (data.seriesLength) setSeriesLength(data.seriesLength);
          if (typeof data.isDateNight === 'boolean') setIsDateNight(data.isDateNight);
          setScreen('playing');
          setTurn(data.turn || 'host');
          setFirstTurnRole(data.turn || 'host');
          setLocalScore(0);
          setOpponentScore(0);
          setCurrentRound(1);
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
              recordRoundResult('tie', 'Both Players');
              conn.send({ type: 'CLAIM_TIE' });
              return updated;
            }

            if (data.isClaimingWin) {
              // Opponent won the round
              recordRoundResult('opponent', data.senderName || opponentName);
              return updated;
            }

            if (localEval.completedLinesCount >= 5) {
              // Calling this number caused local player to win!
              recordRoundResult('local', playerName);
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
          recordRoundResult('opponent', data.winnerName || opponentName);
          break;
        }

        case 'CLAIM_TIE': {
          recordRoundResult('tie', 'Both Players');
          break;
        }

        case 'NEXT_ROUND': {
          startNextRound(data.nextTurn, data.roundNum);
          showToast(`Round ${data.roundNum} started!`);
          break;
        }

        case 'SERIES_REMATCH_REQUEST': {
          setRematchStatus('received');
          showToast(`${opponentName} wants a new series!`);
          break;
        }

        case 'SERIES_REMATCH_ACCEPT': {
          startNewSeries(data.nextStartingTurn);
          showToast('New series started!');
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

  // Helper to advance to the next round in the series
  const startNextRound = (startingTurn, roundNum) => {
    setBoard(generateBoard());
    setBotBoard(generateBoard());
    setCalledNumbers([]);
    setLastCalled(null);
    setRoundWinnerInfo(null);
    setOpponentLinesCount(0);
    prevCompletedLinesRef.current = 0;
    setTurn(startingTurn);
    setFirstTurnRole(startingTurn);
    setCurrentRound(roundNum || currentRound + 1);
    setScreen('playing');
  };

  // Trigger next round (initiator)
  const handleProceedToNextRound = () => {
    const nextStart = firstTurnRole === 'host' ? 'guest' : 'host';
    const nextRoundNum = currentRound + 1;

    if (role === 'solo') {
      const nextSoloStart = firstTurnRole === 'player' ? 'bot' : 'player';
      startNextRound(nextSoloStart, nextRoundNum);
      showToast(`Round ${nextRoundNum} started!`);
      return;
    }

    if (connRef.current && connRef.current.open) {
      connRef.current.send({
        type: 'NEXT_ROUND',
        nextTurn: nextStart,
        roundNum: nextRoundNum
      });
    }
    startNextRound(nextStart, nextRoundNum);
  };

  // Reset series for rematch
  const startNewSeries = (startingTurn) => {
    setBoard(generateBoard());
    setBotBoard(generateBoard());
    setCalledNumbers([]);
    setLastCalled(null);
    setRoundWinnerInfo(null);
    setSeriesWinnerInfo(null);
    setRematchStatus('none');
    setLocalScore(0);
    setOpponentScore(0);
    setCurrentRound(1);
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
          name: playerName,
          isDateNight
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
    setOpponentName(isDateNight ? 'Renia (AI 💕)' : 'Smart Bot (AI)');
    setBoard(generateBoard());
    setBotBoard(generateBoard());
    setCalledNumbers([]);
    setLastCalled(null);
    setRoundWinnerInfo(null);
    setSeriesWinnerInfo(null);
    setRematchStatus('none');
    setLocalScore(0);
    setOpponentScore(0);
    setCurrentRound(1);
    setOpponentLinesCount(0);
    prevCompletedLinesRef.current = 0;
    setTurn('player');
    setFirstTurnRole('player');
    setScreen('playing');
    showToast(`Solo Series: Best of ${seriesLength}. You go first!`);
  };

  // Share Invite Link Helper
  const handleShareInvite = async () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: isDateNight ? 'Date Night Bingo with Yugi & Renia ❤️' : 'Play 1-25 Bingo!',
          text: `Join my Best-of-${seriesLength} Bingo match with code ${roomCode}!`,
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
      showToast(isDateNight ? "Wait for your darling's turn! 💕" : "Wait for opponent's turn!");
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
        recordRoundResult('local', playerName);
        return;
      }

      // Check bot lines count
      const botEval = evaluateBoard(botBoard, nextCalled);
      setOpponentLinesCount(botEval.completedLinesCount);

      if (botEval.completedLinesCount >= 5) {
        recordRoundResult('opponent', isDateNight ? 'Renia (AI 💕)' : 'Smart Bot (AI)');
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
        recordRoundResult('local', playerName);
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
        recordRoundResult('tie', 'Both Players');
      } else if (botWon) {
        recordRoundResult('opponent', isDateNight ? 'Renia (AI 💕)' : 'Smart Bot (AI)');
      } else if (playerWon) {
        recordRoundResult('local', playerName);
      } else {
        setTurn('player');
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [role, screen, turn, botBoard, calledNumbers, board, playerName, isDateNight, recordRoundResult]);

  // Handle Series Rematch Click
  const handleSeriesRematch = () => {
    const nextStart = firstTurnRole === 'host' ? 'guest' : 'host';

    if (role === 'solo') {
      const nextSoloStart = firstTurnRole === 'player' ? 'bot' : 'player';
      startNewSeries(nextSoloStart);
      showToast(nextSoloStart === 'player' ? 'New series! Your turn.' : 'New series! Bot starts.');
      return;
    }

    if (rematchStatus === 'received') {
      if (connRef.current && connRef.current.open) {
        connRef.current.send({
          type: 'SERIES_REMATCH_ACCEPT',
          nextStartingTurn: nextStart
        });
      }
      startNewSeries(nextStart);
    } else {
      setRematchStatus('requested');
      if (connRef.current && connRef.current.open) {
        connRef.current.send({
          type: 'SERIES_REMATCH_REQUEST'
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
    setRoundWinnerInfo(null);
    setSeriesWinnerInfo(null);
    setRematchStatus('none');
    setCalledNumbers([]);
    setLastCalled(null);
    setLocalScore(0);
    setOpponentScore(0);
  };

  // Status banner text with Date Night customization
  const isLocalTurn = role === 'solo' ? turn === 'player' : turn === role;
  let statusBannerText = isLocalTurn ? 'Your Turn' : `${opponentName}'s Turn`;

  if (isDateNight) {
    const waitingQuotes = [
      `Waiting for ${opponentName}’s sweet move... 💕`,
      `Take your time, beauty... admiring you. 🌹`,
      `${opponentName} is plotting something dangerously cute... 💭`,
      `No pressure, my love, but the crown is waiting! 👑`,
      `Listening to ${opponentName}’s cute thinking sounds... 🎶`,
      `Contemplating love or your next number? 🥰`
    ];

    const turnQuotes = [
      'Your turn, gorgeous! Make it count. ❤️',
      'Show me how a master plays, darling. 🥂',
      'The board is yours, my queen. 👑',
      'Time to show who truly runs this house! 💅',
      'Pick a lucky number for us both! 🍀',
      'Your move, my love! ❤️'
    ];

    if (isLocalTurn) {
      statusBannerText = turnQuotes[calledNumbers.length % turnQuotes.length];
    } else {
      statusBannerText = waitingQuotes[calledNumbers.length % waitingQuotes.length];
    }
  }

  return (
    <div
      className={`relative w-full h-full flex flex-col justify-between overflow-hidden text-[#F8FAFC] transition-colors duration-500 ${
        isDateNight ? 'date-night-mode bg-[#12030C]' : 'bg-[#090A0F]'
      }`}
    >
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
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full glass-panel shadow-2xl flex items-center gap-2 border text-xs sm:text-sm font-semibold tracking-wide ${
              isDateNight
                ? 'border-rose-400/30 text-rose-100 bg-rose-950/80 shadow-rose-950/50'
                : 'border-white/20 text-white'
            }`}
          >
            {isDateNight ? (
              <Heart size={16} className="text-rose-400 fill-rose-400 animate-pulse" />
            ) : (
              <Sparkles size={16} className="text-amber-400" />
            )}
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* SCREEN 1: LOBBY */}
      {/* ================================================================ */}
      {screen === 'lobby' && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between px-4 py-4 max-w-md mx-auto overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg ${
                  isDateNight
                    ? 'bg-gradient-to-tr from-rose-500 to-rose-700 shadow-rose-500/30'
                    : 'bg-gradient-to-tr from-indigo-500 to-indigo-700 shadow-indigo-500/30'
                }`}
              >
                {isDateNight ? '❤️' : '25'}
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                  BINGO{' '}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      isDateNight
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    {isDateNight ? 'DATE NIGHT' : 'SERIES PRO'}
                  </span>
                </h1>
                <p className="text-[10px] font-medium text-slate-400 tracking-wider">
                  {isDateNight ? 'YUGI & RENIA EDITION' : 'ZERO-BACKEND MULTIPLAYER'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowStatsModal(true)}
                className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-amber-300"
                title="View Head-to-Head Stats"
              >
                <Flame size={16} />
              </button>
              <button
                onClick={handleToggleMute}
                className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-slate-300"
                title="Toggle Sound"
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          </div>

          {/* Date Night Mode Toggle Pill */}
          <div className="my-2.5">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleToggleDateNight}
              className={`w-full p-3 rounded-2xl flex items-center justify-between transition-all border shadow-lg ${
                isDateNight
                  ? 'bg-gradient-to-r from-rose-950/80 via-rose-900/40 to-amber-950/30 border-rose-500/40 shadow-rose-950/50'
                  : 'glass-card border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2.5 text-left">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isDateNight ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Heart size={16} className={isDateNight ? 'fill-white' : ''} />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    Date Night Mode (Yugi & Renia)
                    {isDateNight && <span className="text-rose-400 text-xs">✨ Active</span>}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Velvet rose theme, champagne gold & sweet banter
                  </div>
                </div>
              </div>

              <div
                className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ${
                  isDateNight ? 'bg-rose-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <motion.div
                  layout
                  className="bg-white w-4 h-4 rounded-full shadow-md"
                />
              </div>
            </motion.button>
          </div>

          {/* Date Night Persona Quick Switcher */}
          {isDateNight && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-2 p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between"
            >
              <span className="text-[11px] font-semibold text-rose-300">Choose Player:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectPersona('Yugi')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    playerName === 'Yugi'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <span>Yugi</span> 🥂
                </button>
                <button
                  onClick={() => handleSelectPersona('Renia')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    playerName === 'Renia'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <span>Renia</span> 🌹
                </button>
              </div>
            </motion.div>
          )}

          {/* Name Input & Best-of Selector */}
          <div className="space-y-3">
            {/* Player Name Card */}
            <div className="glass-card p-3 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Your Player Name
              </label>
              <input
                type="text"
                maxLength={15}
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter name"
                className="w-full bg-slate-900/60 border border-slate-700/60 focus:border-rose-500 rounded-xl px-3 py-2 text-sm font-semibold text-white placeholder-slate-500 outline-none transition"
              />
            </div>

            {/* Best-of Series Selector */}
            <div className="glass-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Swords size={12} className="text-amber-400" />
                  <span>Series Match Length</span>
                </label>
                <span className="text-[10px] font-bold text-amber-300">
                  First to {targetWins} {targetWins === 1 ? 'Win' : 'Wins'}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { length: 1, label: 'Single', wins: 1 },
                  { length: 3, label: 'Best 3', wins: 2 },
                  { length: 5, label: 'Best 5', wins: 3 },
                  { length: 7, label: 'Best 7', wins: 4 },
                  { length: 10, label: 'Best 10', wins: 6 }
                ].map((item) => {
                  const isSelected = seriesLength === item.length;
                  return (
                    <button
                      key={item.length}
                      onClick={() => setSeriesLength(item.length)}
                      className={`py-2 px-1 rounded-xl text-center transition flex flex-col items-center justify-center border ${
                        isSelected
                          ? isDateNight
                            ? 'bg-rose-500 border-rose-300 text-white font-extrabold shadow-md shadow-rose-500/30'
                            : 'bg-indigo-600 border-indigo-300 text-white font-extrabold shadow-md shadow-indigo-500/30'
                          : 'bg-slate-900/60 border-slate-700/50 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-[11px] leading-none font-bold">{item.label}</span>
                      <span className="text-[9px] opacity-75 mt-0.5">{item.wins}W</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Create Room Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateRoom}
              className={`w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 border ${
                isDateNight
                  ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/25 border-rose-400/30'
                  : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 shadow-indigo-500/25 border-indigo-400/30'
              }`}
            >
              <Users size={18} />
              <span>Create 2-Player Room (Best of {seriesLength})</span>
            </motion.button>

            {/* Join Room Box */}
            <div
              className={`glass-card p-3 space-y-2 transition-all ${
                isUrlJoin ? 'ring-2 ring-indigo-500/80 bg-indigo-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  {isUrlJoin ? "Friend's Invite Link Ready" : "Join Friend's Room"}
                </span>
                {isUrlJoin && (
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
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
                  className="w-full bg-slate-900/60 border border-slate-700/60 focus:border-rose-500 rounded-xl px-3 py-2 text-center text-base font-mono font-bold tracking-widest text-white placeholder-slate-500 outline-none transition"
                />
                <button
                  onClick={() => handleJoinRoom()}
                  disabled={connectionStatus === 'connecting' || inputCode.length !== 4}
                  className="px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-xs border border-slate-600/50 transition flex items-center justify-center"
                >
                  {connectionStatus === 'connecting' ? 'Joining...' : 'Join'}
                </button>
              </div>

              {peerError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1 pt-0.5">
                  <AlertCircle size={12} />
                  <span>{peerError}</span>
                </p>
              )}
            </div>

            {/* Solo Practice vs Smart Bot */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handlePlaySolo}
              className="w-full py-2.5 rounded-2xl glass-button text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-slate-800/80"
            >
              <Bot size={16} className={isDateNight ? 'text-rose-400' : 'text-emerald-400'} />
              <span>
                {isDateNight
                  ? 'Solo Practice vs Renia AI 💕'
                  : `Play Solo vs Smart Bot (Best of ${seriesLength})`}
              </span>
            </motion.button>
          </div>

          {/* Footer Info & Quick Stats Pill */}
          <div className="text-center pt-2">
            <button
              onClick={() => setShowStatsModal(true)}
              className="text-[11px] text-slate-400 hover:text-amber-300 transition flex items-center justify-center gap-1.5 mx-auto"
            >
              <Flame size={12} className="text-amber-400" />
              <span>
                Lifetime Series: <strong>{stats.localSeriesWon}</strong>W -{' '}
                <strong>{stats.opponentSeriesWon}</strong>L • Streak: 🔥{' '}
                <strong>{stats.currentStreak}</strong>
              </span>
            </button>
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
            <span
              className={`text-xs font-bold tracking-wider ${
                isDateNight ? 'text-rose-400' : 'text-indigo-400'
              }`}
            >
              BEST OF {seriesLength}
            </span>
          </div>

          {/* Center Card */}
          <div className="my-auto text-center space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                <span>Room Created!</span>
                {isDateNight && <span>❤️</span>}
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                {isDateNight
                  ? 'Share this code with your sweetheart to start your date night match!'
                  : 'Share this 4-digit code or link with your friend to connect and play.'}
              </p>
            </div>

            {/* Giant Room Code Display */}
            <div
              className={`glass-card py-6 px-4 max-w-xs mx-auto relative overflow-hidden border shadow-2xl ${
                isDateNight
                  ? 'border-rose-500/40 shadow-rose-950/50'
                  : 'border-indigo-500/40 shadow-indigo-950/50'
              }`}
            >
              <div className="text-[11px] uppercase font-bold text-slate-400 tracking-widest mb-1">
                Room Code
              </div>
              <div
                className={`text-5xl font-black tracking-widest font-mono ${
                  isDateNight ? 'text-rose-300' : 'text-indigo-300'
                }`}
              >
                {roomCode}
              </div>
            </div>

            {/* Share / Copy Buttons */}
            <div className="space-y-2.5 max-w-xs mx-auto">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleShareInvite}
                className={`w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 border ${
                  isDateNight
                    ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/20 border-rose-400/30'
                    : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/20 border-emerald-400/30'
                }`}
              >
                <Share2 size={18} />
                <span>Share Invite Link</span>
              </motion.button>

              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
                  copyToClipboard(url);
                }}
                className="w-full py-2.5 rounded-2xl glass-button text-xs font-semibold text-slate-300 flex items-center justify-center gap-2"
              >
                <Copy size={15} />
                <span>Copy Shareable URL</span>
              </button>
            </div>

            {/* Pulse Waiting Status */}
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 pt-1">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isDateNight ? 'bg-rose-400' : 'bg-emerald-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isDateNight ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
              </span>
              <span>
                {isDateNight ? 'Waiting for darling to connect...' : 'Waiting for opponent to connect...'}
              </span>
            </div>
          </div>

          <div className="text-center pb-2">
            <p className="text-[11px] text-slate-400">
              Matches play automatically up to {targetWins} wins!
            </p>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SCREEN 3: GAME ARENA */}
      {/* ================================================================ */}
      {(screen === 'playing' || screen === 'round_over' || screen === 'series_over') && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between px-3.5 py-2.5 max-w-md mx-auto">
          {/* Top Bar: Navigation, Series Indicator, Mute */}
          <div className="w-full flex items-center justify-between pt-1">
            <button
              onClick={handleLeaveToLobby}
              className="p-2 rounded-xl glass-button text-slate-400 hover:text-white"
              title="Leave Room"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Series Indicator & Target */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-panel text-[11px] font-bold border border-white/10">
              <Swords size={12} className="text-amber-400" />
              <span>
                Round {currentRound} • Best of {seriesLength} (First to {targetWins})
              </span>
            </div>

            <button
              onClick={handleToggleMute}
              className="p-2 rounded-xl glass-button text-slate-400 hover:text-white"
              title="Toggle Sound"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          {/* Series Head-to-Head Scoreboard Card */}
          <div
            className={`w-full py-1.5 px-3 rounded-2xl flex items-center justify-between border shadow-md my-0.5 ${
              isDateNight
                ? 'bg-rose-950/40 border-rose-500/30'
                : 'bg-slate-900/60 border-slate-700/50'
            }`}
          >
            {/* Player 1 (Local) */}
            <div className="flex items-center gap-1.5">
              {isDateNight ? (
                <Heart size={14} className="text-rose-400 fill-rose-400" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              )}
              <span className="font-bold text-xs text-white max-w-[90px] truncate">
                {playerName}
              </span>
              <span
                className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                  isDateNight ? 'bg-rose-500/20 text-rose-300' : 'bg-indigo-500/20 text-indigo-300'
                }`}
              >
                {localScore}
              </span>
            </div>

            <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
              VS
            </div>

            {/* Player 2 (Opponent) */}
            <div className="flex items-center gap-1.5">
              <span
                className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                  isDateNight ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {opponentScore}
              </span>
              <span className="font-bold text-xs text-slate-300 max-w-[90px] truncate">
                {opponentName}
              </span>
              {isDateNight ? (
                <Heart size={14} className="text-amber-400 fill-amber-400" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              )}
            </div>
          </div>

          {/* Turn Status Pill Banner */}
          <div className="flex items-center justify-between px-1">
            <motion.div
              animate={isLocalTurn ? { scale: [1, 1.02, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2.2 }}
              className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border transition-all ${
                isLocalTurn
                  ? isDateNight
                    ? 'bg-rose-500/25 text-rose-200 border-rose-400/40 shadow-md shadow-rose-950/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700/40'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isLocalTurn
                    ? isDateNight
                      ? 'bg-rose-400 animate-pulse'
                      : 'bg-emerald-400 animate-pulse'
                    : 'bg-indigo-400'
                }`}
              />
              <span>{statusBannerText}</span>
            </motion.div>

            {/* Opponent Lines Dots */}
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span>Lines:</span>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < opponentLinesCount
                        ? isDateNight
                          ? 'bg-rose-400'
                          : 'bg-amber-400'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* B-I-N-G-O Header Badges */}
          <div className="flex items-center justify-center gap-2 my-0.5">
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
                  disabled={isCalled || screen !== 'playing'}
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
          <div className="flex flex-col items-center justify-center min-h-[40px] my-0.5">
            {calledNumbers.length === 0 ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleShuffleBoard}
                className="px-4 py-1.5 rounded-full glass-button text-xs font-bold text-amber-300 border-amber-400/30 flex items-center gap-1.5 shadow-lg hover:bg-slate-800"
              >
                <Shuffle size={13} />
                <span>Shuffle My Board</span>
              </motion.button>
            ) : (
              <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400">
                <span>
                  Calls: <strong className="text-white">{calledNumbers.length}</strong>/25
                </span>
                <span>•</span>
                <span>
                  Lines: <strong className="text-amber-400">{completedLinesCount}</strong>/5
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
      {/* MODAL 1: ROUND OVER (SERIES CONTINUES) */}
      {/* ================================================================ */}
      <AnimatePresence>
        {screen === 'round_over' && roundWinnerInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.88, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 15 }}
              className={`glass-card w-full max-w-sm p-5 text-center space-y-4 border shadow-2xl ${
                isDateNight ? 'border-rose-500/40' : 'border-white/20'
              }`}
            >
              {/* Round Icon */}
              <div
                className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-white shadow-xl ${
                  isDateNight
                    ? 'bg-gradient-to-tr from-rose-500 to-rose-700 shadow-rose-500/40'
                    : 'bg-gradient-to-tr from-amber-400 to-amber-600 shadow-amber-500/30 text-slate-950'
                }`}
              >
                {isDateNight ? (
                  <Heart size={36} className="fill-white" />
                ) : (
                  <Award size={36} strokeWidth={2.2} />
                )}
              </div>

              {/* Title & Info */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
                  Round {roundWinnerInfo.roundNum} Winner
                </span>
                <h3 className="text-xl font-black text-white tracking-tight">
                  {roundWinnerInfo.name} Secured the Round!
                </h3>
                <p className="text-xs text-slate-300">
                  {isDateNight
                    ? `${roundWinnerInfo.name} completes 5 lines with love! 💕`
                    : `${roundWinnerInfo.name} completed 5 lines!`}
                </p>
              </div>

              {/* Updated Scorecard */}
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-700/60 flex items-center justify-around">
                <div className="text-center">
                  <span className="text-[10px] font-bold text-slate-400 block">{playerName}</span>
                  <span className="text-lg font-black text-white">
                    {roundWinnerInfo.localScore}
                  </span>
                </div>
                <div className="text-xs font-bold text-amber-400">
                  First to {targetWins}
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-bold text-slate-400 block">{opponentName}</span>
                  <span className="text-lg font-black text-white">
                    {roundWinnerInfo.opponentScore}
                  </span>
                </div>
              </div>

              {/* Next Round CTA */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleProceedToNextRound}
                className={`w-full py-3 rounded-2xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 border ${
                  isDateNight
                    ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 shadow-rose-500/30 border-rose-400/30'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 shadow-indigo-500/30 border-indigo-400/30'
                }`}
              >
                <RefreshCw size={16} />
                <span>Start Round {roundWinnerInfo.roundNum + 1}</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* MODAL 2: GRAND SERIES CHAMPION */}
      {/* ================================================================ */}
      <AnimatePresence>
        {screen === 'series_over' && seriesWinnerInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className={`glass-card w-full max-w-sm p-6 text-center space-y-5 border shadow-2xl ${
                isDateNight ? 'border-rose-500/50 shadow-rose-950/60' : 'border-amber-400/30 shadow-amber-950/50'
              }`}
            >
              {/* Grand Trophy Icon */}
              <div
                className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center shadow-xl ${
                  isDateNight
                    ? 'bg-gradient-to-tr from-rose-500 via-rose-600 to-amber-500 text-white shadow-rose-500/40'
                    : 'bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 shadow-amber-500/40'
                }`}
              >
                <Trophy size={42} strokeWidth={2.3} />
              </div>

              {/* Title */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1">
                  <Star size={12} className="fill-amber-400" />
                  <span>SERIES CHAMPION</span>
                  <Star size={12} className="fill-amber-400" />
                </span>
                <h3 className="text-2xl font-black text-white tracking-tight">
                  {seriesWinnerInfo.name} WINS THE SERIES!
                </h3>
                <p className="text-xs text-slate-300">{seriesWinnerInfo.reason}</p>
              </div>

              {/* Final Series Scoreboard */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs space-y-1">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  Final Series Score (Best of {seriesLength})
                </div>
                <div className="text-2xl font-black text-amber-400 font-mono">
                  {seriesWinnerInfo.finalScore}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSeriesRematch}
                  disabled={rematchStatus === 'requested'}
                  className={`w-full py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 border ${
                    isDateNight
                      ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 shadow-rose-500/25 border-rose-400/30'
                      : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 shadow-indigo-500/25 border-indigo-400/30'
                  }`}
                >
                  <RefreshCw size={16} />
                  <span>
                    {rematchStatus === 'requested'
                      ? 'Waiting for Opponent...'
                      : rematchStatus === 'received'
                      ? 'Accept Rematch!'
                      : isDateNight
                      ? 'Play Another Series, Honey? 💕'
                      : 'Play Another Series'}
                  </span>
                </motion.button>

                <button
                  onClick={handleLeaveToLobby}
                  className="w-full py-2.5 rounded-2xl glass-button text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Back to Lobby
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* MODAL 3: HEAD-TO-HEAD STATS & RIVALRY */}
      {/* ================================================================ */}
      <AnimatePresence>
        {showStatsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="glass-card w-full max-w-sm p-5 space-y-4 border border-white/20 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame size={20} className="text-amber-400" />
                  <h3 className="text-base font-black text-white">
                    {isDateNight ? 'Yugi vs Renia Rivalry' : 'Head-to-Head Stats'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowStatsModal(false)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg glass-button"
                >
                  Close
                </button>
              </div>

              {/* Lifetime Series Record */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Series Record
                </span>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-white">{playerName}</span>
                  <span className="text-base font-black text-amber-400">
                    {stats.localSeriesWon} - {stats.opponentSeriesWon}
                  </span>
                  <span className="font-bold text-slate-300">{opponentName}</span>
                </div>
              </div>

              {/* Total Rounds Record */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Total Rounds Won
                  </span>
                  <span className="text-base font-extrabold text-white">
                    {stats.localRoundsWon}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Opponent Rounds
                  </span>
                  <span className="text-base font-extrabold text-slate-300">
                    {stats.opponentRoundsWon}
                  </span>
                </div>
              </div>

              {/* Current Streak */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Current Streak
                  </span>
                  <span className="text-sm font-extrabold text-amber-400 flex items-center gap-1">
                    <Flame size={14} className="text-amber-400" />
                    <span>
                      {stats.streakHolder === 'local'
                        ? `${playerName} (${stats.currentStreak} in a row)`
                        : stats.streakHolder === 'opponent'
                        ? `${opponentName} (${stats.currentStreak} in a row)`
                        : 'No active streak'}
                    </span>
                  </span>
                </div>

                <button
                  onClick={handleResetStats}
                  className="px-2.5 py-1.5 rounded-lg glass-button text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
