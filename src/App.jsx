import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup, useAnimation } from 'framer-motion';
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
  Heart,
  Flame,
  RotateCcw,
  Swords,
  Camera,
  Lock,
  ScrollText,
  Gift
} from 'lucide-react';
import {
  generateBoard,
  evaluateBoard,
  getBestBotMove,
  LINE_NAMES,
  WIN_LINES,
  METEOR_LINE_COORDS,
  getTensionTiles
} from './utils/bingoEngine';
import {
  playTapSound,
  playOpponentTapSound,
  playSweepSound,
  playWinFanfare,
  playShuffleSound,
  playRomanticChime,
  playPlacementNote,
  toggleSoundMuted,
  getSoundMuted
} from './utils/sound';
import SplitText from './components/ui/SplitText';
import RippleButton from './components/ui/RippleButton';
import GlareCard from './components/ui/GlareCard';
import MeteorRay from './components/ui/MeteorRay';
import HeroOrb from './components/ui/HeroOrb';

const PEER_PREFIX = 'bingo25-v4-';

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ],
    iceCandidatePoolSize: 10
  }
};
const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

const WAGER_PRESETS = [
  '15-Min Massage 💆',
  'Chooses Tomorrow’s Dinner 🍕',
  'Breakfast in Bed 🥞',
  'Buys Morning Coffee ☕',
  'Does the Dishes Tonight 🧼',
  'Forehead Kisses on Demand 😘'
];

const EMOTE_LIST = ['❤️', '😘', '👀', '🔥', '🥺'];

// Safe Haptic Touch Feedback helper
const triggerHaptic = (pattern = [15]) => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
};

// Helper to determine wins needed to clinch a series
function getTargetWins(seriesLength) {
  if (seriesLength === 1) return 1;
  if (seriesLength === 3) return 2;
  if (seriesLength === 5) return 3;
  if (seriesLength === 7) return 4;
  if (seriesLength === 10) return 6;
  return Math.ceil(seriesLength / 2);
}
// 20 Floating Champagne Particles for Date Night Mode
const CHAMPAGNE_PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  size: 3 + ((i * 7) % 5), // 3px to 7px
  left: `${((i * 19 + 7) % 92) + 4}%`, // 4% to 96%
  drift: ((i * 11) % 36) - 18, // -18px to +18px
  duration: 10 + ((i * 3.7) % 10), // 10s to 20s
  delay: (i * 0.7) % 12 // staggered delay 0s to 12s
}));

function FloatingParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {CHAMPAGNE_PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-rose-400/20 shadow-[0_0_8px_rgba(251,191,36,0.3)]"
          style={{
            width: p.size,
            height: p.size,
            left: p.left,
            bottom: 0
          }}
          animate={{
            y: ['100vh', '-10vh'],
            x: [0, p.drift, -p.drift, 0],
            opacity: [0, 0.8, 0.9, 0.4, 0]
          }}
          transition={{
            y: {
              duration: p.duration,
              repeat: Infinity,
              ease: 'linear',
              delay: p.delay
            },
            x: {
              duration: p.duration * 0.5,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut'
            },
            opacity: {
              duration: p.duration,
              repeat: Infinity,
              times: [0, 0.15, 0.5, 0.85, 1],
              delay: p.delay
            }
          }}
        />
      ))}
    </div>
  );
}

const DEFAULT_STATS = {
  totalSeriesPlayed: 0,
  yugiSeriesWon: 0,
  reniaSeriesWon: 0,
  totalRoundsPlayed: 0,
  yugiRoundsWon: 0,
  reniaRoundsWon: 0,
  currentStreak: 0,
  streakHolder: 'None'
};

export default function App() {
  // Navigation / Game State Machine: 'lobby' | 'waiting' | 'playing' | 'round_over' | 'series_over'
  const [screen, setScreen] = useState('lobby');

  // Mandatory Love Ledger Wager / Stakes Selection (Task 3)
  const [customWager, setCustomWager] = useState(() => {
    return localStorage.getItem('bingo_date_night_wager') || '15-Min Massage 💆';
  });
  const activeWager = customWager.trim() || '15-Min Massage 💆';

  // Love Ledger / Date Night Wager Debts History
  const [wagerHistory, setWagerHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('bingo_wager_history_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activeStatsTab, setActiveStatsTab] = useState('stats'); // 'stats' | 'ledger'

  // Best-of Series Match Engine
  const [seriesLength, setSeriesLength] = useState(3); // 1, 3, 5, 7, 10
  const [currentRound, setCurrentRound] = useState(1);
  const [localScore, setLocalScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);

  // Multiplayer Connection State
  const [role, setRole] = useState('host'); // 'host' (Yugi) | 'guest' (Renia) | 'solo' (Yugi vs Renia AI)
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isUrlJoin, setIsUrlJoin] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle' | 'connecting' | 'connected' | 'error'
  const [peerError, setPeerError] = useState('');

  // Exclusive Hardcoded Identities (Task 1):
  // Host is always "Yugi", Guest is always "Renia"
  const playerName = role === 'guest' ? 'Renia' : 'Yugi';
  const opponentName = role === 'guest' ? 'Yugi' : 'Renia';

  // Audio mute state
  const [isMuted, setIsMuted] = useState(getSoundMuted());

  // Game Board & Logic State (Pre-game manual on-tap sequential fill by default)
  const [board, setBoard] = useState(() => Array(25).fill(null));
  const [botBoard, setBotBoard] = useState(() => generateBoard());
  const [, setSetupMode] = useState('manual'); // 'manual' | 'auto'
  const [isBoardLocked, setIsBoardLocked] = useState(false);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [lastCalled, setLastCalled] = useState(null);
  const [turn, setTurn] = useState('host'); // 'host' | 'guest' | 'player' | 'bot'
  const [firstTurnRole, setFirstTurnRole] = useState('host');

  // Winner State
  const [roundWinnerInfo, setRoundWinnerInfo] = useState(null);
  const [seriesWinnerInfo, setSeriesWinnerInfo] = useState(null);
  const [rematchStatus, setRematchStatus] = useState('none');

  // In-Game Floating Emotes (Real-Time Reactions)
  const [floatingEmotes, setFloatingEmotes] = useState([]); // [{ id, emoji, x }]

  // Date Night Polaroid Modal
  const [showPolaroidModal, setShowPolaroidModal] = useState(false);

  // Progress stats
  const [opponentLinesCount, setOpponentLinesCount] = useState(0);

  // Prominent Line Alert Banner (shows when either player claims a line and stays for ~5s)
  const [lineAlert, setLineAlert] = useState(null);
  const lineAlertTimeoutRef = useRef(null);

  // Active Meteor Rays & Staggered Domino Wave Tiles
  const [activeMeteors, setActiveMeteors] = useState([]);
  const [dominoTiles, setDominoTiles] = useState({}); // { [tileIndex]: positionInLine }
  const gridContainerRef = useRef(null);
  const shakeControls = useAnimation();

  // Persistent Head-to-Head Stats (Yugi & Renia Exclusive)
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem('bingo_h2h_stats_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_STATS,
          ...parsed,
          reniaSeriesWon: parsed.reniaSeriesWon ?? parsed.raniaSeriesWon ?? 0,
          reniaRoundsWon: parsed.reniaRoundsWon ?? parsed.raniaRoundsWon ?? 0,
          streakHolder: parsed.streakHolder === 'Rania' ? 'Renia' : (parsed.streakHolder || 'None')
        };
      }
      return DEFAULT_STATS;
    } catch (e) {
      return DEFAULT_STATS;
    }
  });
  const [showStatsModal, setShowStatsModal] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);

  // WebRTC & Line History Refs
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const handshakeIntervalRef = useRef(null);
  const joinTimeoutRef = useRef(null);
  const prevCompletedLinesRef = useRef(0);
  const prevCompletedLineIdsRef = useRef([]);
  const prevOpponentLinesCountRef = useRef(0);
  const prevBotCompletedLineIdsRef = useRef([]);

  // Stale-closure prevention refs for WebRTC listeners and timers
  const screenRef = useRef(screen);
  const connectionStatusRef = useRef(connectionStatus);
  const boardRef = useRef(board);
  const botBoardRef = useRef(botBoard);
  const isBoardLockedRef = useRef(isBoardLocked);
  const calledNumbersRef = useRef(calledNumbers);
  const playerNameRef = useRef(playerName);
  const opponentNameRef = useRef(opponentName);
  const localScoreRef = useRef(localScore);
  const opponentScoreRef = useRef(opponentScore);
  const seriesLengthRef = useRef(seriesLength);
  const activeWagerRef = useRef(activeWager);
  const currentRoundRef = useRef(currentRound);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { connectionStatusRef.current = connectionStatus; }, [connectionStatus]);
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { botBoardRef.current = botBoard; }, [botBoard]);
  useEffect(() => { isBoardLockedRef.current = isBoardLocked; }, [isBoardLocked]);
  useEffect(() => { calledNumbersRef.current = calledNumbers; }, [calledNumbers]);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { opponentNameRef.current = opponentName; }, [opponentName]);
  useEffect(() => { localScoreRef.current = localScore; }, [localScore]);
  useEffect(() => { opponentScoreRef.current = opponentScore; }, [opponentScore]);
  useEffect(() => { seriesLengthRef.current = seriesLength; }, [seriesLength]);
  useEffect(() => { activeWagerRef.current = activeWager; }, [activeWager]);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

  // Evaluation of current board
  const { completedLinesCount, winningTileIndices, completedLineIds } = evaluateBoard(board, calledNumbers);
  const targetWins = getTargetWins(seriesLength);

  // Opponent Imminent Threat Indicator (4/5 lines claimed)
  const isOpponentThreat = isBoardLocked && opponentLinesCount >= 4;

  // Clicked tile indices on player's board (0..24)
  const clickedTileIndices = useMemo(() => {
    const calledSet = new Set(calledNumbers);
    const indices = [];
    board.forEach((num, idx) => {
      if (num !== null && calledSet.has(num)) {
        indices.push(idx);
      }
    });
    return indices;
  }, [board, calledNumbers]);

  // Progressive tension tile indices (unclicked tiles exactly 1 tap away from completing a line)
  const tensionTileIndices = useMemo(() => {
    if (!isBoardLocked || screen !== 'playing') return new Set();
    return new Set(getTensionTiles(clickedTileIndices, WIN_LINES));
  }, [clickedTileIndices, isBoardLocked, screen]);

  // Pre-Game Setup Derived State
  const nextSequentialNumber = (() => {
    for (let i = 1; i <= 25; i++) {
      if (!board.includes(i)) return i;
    }
    return null;
  })();
  const placedCount = board.filter((n) => n !== null).length;
  const isBoardFull = placedCount === 25;

  // Love Ledger Derived State
  const pendingDebts = wagerHistory.filter((item) => item.status === 'pending');
  const pendingDebtsCount = pendingDebts.length;
  const yugiOwesCount = pendingDebts.filter((item) => item.loserName === 'Yugi').length;
  const reniaOwesCount = pendingDebts.filter((item) => item.loserName === 'Renia' || item.loserName === 'Rania').length;

  // Handle Wager Text Change
  const handleWagerChange = (val) => {
    setCustomWager(val);
    try {
      localStorage.setItem('bingo_date_night_wager', val);
    } catch (e) {}
  };

  // Toggle Wager Status in Love Ledger
  const handleToggleWagerStatus = (id) => {
    setWagerHistory((prev) => {
      const updated = prev.map((item) => {
        if (item.id === id) {
          const nextStatus = item.status === 'pending' ? 'fulfilled' : 'pending';
          if (nextStatus === 'fulfilled') {
            playRomanticChime();
            triggerHaptic([20, 40]);
            showToast('Penalty fulfilled with love! ❤️');
          } else {
            triggerHaptic([15]);
            showToast('Marked as pending ⏳');
          }
          return { ...item, status: nextStatus };
        }
        return item;
      });
      try {
        localStorage.setItem('bingo_wager_history_v1', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Clear Love Ledger History
  const handleClearWagerHistory = () => {
    setWagerHistory([]);
    try {
      localStorage.setItem('bingo_wager_history_v1', JSON.stringify([]));
    } catch (e) {}
    triggerHaptic([15]);
    showToast('Love Ledger cleared');
  };

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
    showToast('Lifetime stats reset to zero');
  };

  // Trigger floating iOS Toast
  const showToast = useCallback((msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  // Trigger prominent in-arena Line Alert (stays for 4.8 seconds)
  const triggerLineAlert = useCallback((alertObj) => {
    if (lineAlertTimeoutRef.current) clearTimeout(lineAlertTimeoutRef.current);
    setLineAlert(alertObj);
    lineAlertTimeoutRef.current = setTimeout(() => {
      setLineAlert(null);
    }, 4800);
  }, []);

  // Trigger floating reaction emote across screen
  const triggerFloatingEmote = useCallback((emoji, xPos = null) => {
    const id = Date.now() + Math.random();
    const x =
      xPos ??
      Math.floor(
        Math.random() *
          (typeof window !== 'undefined' ? window.innerWidth - 80 : 250) +
          30
      );
    setFloatingEmotes((prev) => [...prev.slice(-8), { id, emoji, x }]);
    setTimeout(() => {
      setFloatingEmotes((prev) => prev.filter((item) => item.id !== id));
    }, 2400);
  }, []);

  // Handle user tapping an in-game love reaction
  const handleSendEmote = (emoji) => {
    playTapSound();
    triggerHaptic([15]);
    triggerFloatingEmote(emoji);

    if (connRef.current && connRef.current.open) {
      connRef.current.send({
        type: 'EMOTE_REACTION',
        emoji,
        senderName: playerName
      });
    }

    // In Solo practice mode, the AI replies with a cute heart after a natural delay
    if (role === 'solo') {
      setTimeout(() => {
        const botReplies = ['❤️', '😘', '✨', '🥰', '🌹'];
        const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
        triggerFloatingEmote(reply);
        triggerHaptic([20, 30]);
      }, 700);
    }
  };

  // Sound toggle handler
  const handleToggleMute = () => {
    const nextMuted = toggleSoundMuted();
    setIsMuted(nextMuted);
    showToast(nextMuted ? 'Sound Muted' : 'Sound Enabled');
  };

  // Inspect URL for auto-join room code on mount (Task 1: Guest is permanently Renia)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');
      if (urlRoom && /^\d{4}$/.test(urlRoom)) {
        setInputCode(urlRoom);
        setIsUrlJoin(true);
        setRole('guest'); // Guest is permanently Renia
      }
    } catch (e) {}
  }, []);

  // Cleanup WebRTC connections on unmount
  useEffect(() => {
    return () => {
      if (handshakeIntervalRef.current) clearInterval(handshakeIntervalRef.current);
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (lineAlertTimeoutRef.current) clearTimeout(lineAlertTimeoutRef.current);
    };
  }, []);

  // Soft Embers Particle Dispersal along Meteor Ray path
  const triggerLineSparks = useCallback((lineId) => {
    const coords = METEOR_LINE_COORDS[lineId];
    if (!coords) return;
    const gridEl = gridContainerRef.current;
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();

    const colors = ['#F43F5E', '#FDA4AF', '#FBBF24', '#FEF08A', '#FFFFFF'];

    // Fire 3 staggered gentle embers along the meteor path (start -> middle -> end) over 400ms
    const points = [0.2, 0.5, 0.8];
    points.forEach((progress, idx) => {
      setTimeout(() => {
        const xPct = (coords.x1 + (coords.x2 - coords.x1) * progress) / 100;
        const yPct = (coords.y1 + (coords.y2 - coords.y1) * progress) / 100;

        const originX = (rect.left + rect.width * xPct) / window.innerWidth;
        const originY = (rect.top + rect.height * yPct) / window.innerHeight;

        try {
          confetti({
            particleCount: 12,
            spread: 40,
            startVelocity: 15,
            origin: { x: originX, y: originY },
            colors,
            ticks: 60,
            gravity: 0.6,
            scalar: 0.8,
            shapes: ['circle', 'star'],
            disableForReducedMotion: true
          });
        } catch (e) {}
      }, idx * 160);
    });
  }, []);

  // Track completed lines to play chime & trigger prominent banner
  useEffect(() => {
    if (isBoardLocked && completedLinesCount > prevCompletedLinesRef.current && screen === 'playing') {
      triggerHaptic([30, 45, 30]);
      playRomanticChime();

      // Identify newly completed line(s)
      const newlyCompletedIds = (completedLineIds || []).filter(
        (id) => !prevCompletedLineIdsRef.current.includes(id)
      );
      const lineNamesStr =
        newlyCompletedIds.map((id) => LINE_NAMES[id]).join(' & ') || 'a line';

      // Trigger Staggered Domino Wave + Meteor Ray Sweep + Soft Embers
      if (newlyCompletedIds.length > 0) {
        playSweepSound();
        triggerHaptic([25, 40, 55]);
        shakeControls.start({
          x: [0, -6, 7, -4, 4, -2, 2, 0],
          transition: { duration: 0.35, ease: 'easeInOut' }
        });

        // 1. Calculate 5 tile indices for newly completed line(s) for Staggered Domino Wave
        const newDomino = {};
        newlyCompletedIds.forEach((lineId) => {
          const lineIndices = WIN_LINES[lineId];
          if (lineIndices) {
            lineIndices.forEach((tileIdx, pos) => {
              if (newDomino[tileIdx] === undefined || pos < newDomino[tileIdx]) {
                newDomino[tileIdx] = pos;
              }
            });
          }
        });
        setDominoTiles(newDomino);
        setTimeout(() => {
          setDominoTiles({});
        }, 1000);

        // 2. Spawn Magic UI Meteor Ray Sweep(s)
        const timestamp = Date.now();
        const newMeteors = newlyCompletedIds.map((lineId, i) => ({
          id: `${timestamp}-${lineId}-${i}`,
          lineId
        }));
        setActiveMeteors((prev) => [...prev, ...newMeteors]);

        // 3. Fire Soft Embers particle dispersal along meteor ray path
        newlyCompletedIds.forEach((lineId, i) => {
          setTimeout(() => {
            triggerLineSparks(lineId);
          }, i * 120);
        });
      }

      const title =
        completedLinesCount >= 5
          ? '🏆 BINGO! YOU CLAIMED 5 LINES! ❤️'
          : completedLinesCount === 4
          ? `🚨 4 LINES DOWN! Claimed ${lineNamesStr}!`
          : `❤️ You claimed ${lineNamesStr}! (${completedLinesCount}/5)`;

      const subtitle =
        completedLinesCount >= 5
          ? 'Victory is sealed! 🥂'
          : completedLinesCount === 4
          ? 'Hold your breath! 1 more line to BINGO! 💓'
          : 'One step closer to victory, my love. 💕';

      triggerLineAlert({
        title,
        subtitle,
        isOpponent: false,
        count: completedLinesCount,
        lineName: lineNamesStr,
        senderName: playerName
      });

      // Broadcast LINE_COMPLETED packet immediately so partner's phone rings & shows alert
      if (connRef.current && connRef.current.open) {
        connRef.current.send({
          type: 'LINE_COMPLETED',
          linesCount: completedLinesCount,
          senderName: playerName,
          lineName: lineNamesStr
        });
      }
    }
    prevCompletedLinesRef.current = completedLinesCount;
    prevCompletedLineIdsRef.current = completedLineIds || [];
  }, [completedLinesCount, completedLineIds, screen, isBoardLocked, playerName, triggerLineAlert, triggerLineSparks, shakeControls]);

  // Confetti celebrations
  const fireVictoryConfetti = useCallback(() => {
    triggerHaptic([50, 70, 50, 70, 120]);
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
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 },
      shapes,
      colors,
      scalar: 1.3
    });

    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
        shapes,
        colors,
        scalar: 1.4
      });
    }, 260);
  }, []);

  // Record a round win and evaluate series outcome
  const recordRoundResult = useCallback(
    (winnerRole, winnerDisplay) => {
      let nextLocalScore = localScoreRef.current;
      let nextOpponentScore = opponentScoreRef.current;

      if (winnerRole === 'local') {
        nextLocalScore += 1;
        localScoreRef.current = nextLocalScore;
        setLocalScore(nextLocalScore);
      } else if (winnerRole === 'opponent') {
        nextOpponentScore += 1;
        opponentScoreRef.current = nextOpponentScore;
        setOpponentScore(nextOpponentScore);
      }

      const curPlayerName = playerNameRef.current;
      const curOpponentName = opponentNameRef.current;
      const curSeriesLength = seriesLengthRef.current;
      const curActiveWager = activeWagerRef.current;
      const curCurrentRound = currentRoundRef.current;
      const curTargetWins = getTargetWins(curSeriesLength);

      // Identify winner by name for lifetime Yugi vs Renia tally
      const winnerIsYugi =
        winnerDisplay.includes('Yugi') ||
        (winnerRole === 'local' && curPlayerName === 'Yugi') ||
        (winnerRole === 'opponent' && curOpponentName.includes('Yugi'));
      const winnerIsRenia =
        winnerDisplay.includes('Renia') ||
        winnerDisplay.includes('Rania') ||
        (winnerRole === 'local' && (curPlayerName === 'Renia' || curPlayerName === 'Rania')) ||
        (winnerRole === 'opponent' && (curOpponentName.includes('Renia') || curOpponentName.includes('Rania')));

      // Update rounds in persistent stats
      setStats((prev) => {
        const nextReniaRounds = winnerIsRenia
          ? (prev.reniaRoundsWon ?? prev.raniaRoundsWon ?? 0) + 1
          : (prev.reniaRoundsWon ?? prev.raniaRoundsWon ?? 0);
        const updated = {
          ...prev,
          totalRoundsPlayed: (prev.totalRoundsPlayed || 0) + 1,
          localRoundsWon:
            winnerRole === 'local'
              ? (prev.localRoundsWon || 0) + 1
              : prev.localRoundsWon || 0,
          opponentRoundsWon:
            winnerRole === 'opponent'
              ? (prev.opponentRoundsWon || 0) + 1
              : prev.opponentRoundsWon || 0,
          yugiRoundsWon: winnerIsYugi
            ? (prev.yugiRoundsWon || 0) + 1
            : prev.yugiRoundsWon || 0,
          reniaRoundsWon: nextReniaRounds,
          raniaRoundsWon: nextReniaRounds
        };
        try {
          localStorage.setItem('bingo_h2h_stats_v2', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      // Check for Series Win
      const localClenched = nextLocalScore >= curTargetWins;
      const opponentClenched = nextOpponentScore >= curTargetWins;

      if (localClenched || opponentClenched) {
        const seriesWinner = localClenched ? 'local' : 'opponent';
        const seriesWinnerName = localClenched ? curPlayerName : curOpponentName;

        const seriesVictoryQuotes = [
          `${seriesWinnerName} is the undisputed Date Night Queen! 👑💖`,
          `${seriesWinnerName} takes the crown, but surrenders all hugs! 🥂🌹`,
          `Victory sealed with a kiss! 💋`,
          `${seriesWinnerName} gets forehead kisses on demand for 24 hours! 😘`,
          `All hail the reigning Bingo Monarch! 👸`,
          `Defeated by your cuteness and your 5x5 grid! 🫠`
        ];

        const romanticSeriesReason =
          seriesVictoryQuotes[
            (nextLocalScore + nextOpponentScore) % seriesVictoryQuotes.length
          ];

        setSeriesWinnerInfo({
          winner: seriesWinner,
          name: seriesWinnerName,
          finalScore: `${nextLocalScore} - ${nextOpponentScore}`,
          wager: curActiveWager,
          reason: romanticSeriesReason
        });

        // Determine if Yugi or Renia clinched the series for named stats
        const seriesWinnerIsYugi = seriesWinnerName.includes('Yugi');
        const seriesWinnerIsRenia = seriesWinnerName.includes('Renia') || seriesWinnerName.includes('Rania');
        const winnerLabel = seriesWinnerIsYugi
          ? 'Yugi'
          : seriesWinnerIsRenia
          ? 'Renia'
          : seriesWinner;

        // Update series in persistent stats
        setStats((prev) => {
          const isWinnerLocal = seriesWinner === 'local';
          const newStreak =
            prev.streakHolder === winnerLabel ? (prev.currentStreak || 0) + 1 : 1;
          const nextReniaSeries = seriesWinnerIsRenia
            ? (prev.reniaSeriesWon ?? prev.raniaSeriesWon ?? 0) + 1
            : (prev.reniaSeriesWon ?? prev.raniaSeriesWon ?? 0);
          const updated = {
            ...prev,
            totalSeriesPlayed: (prev.totalSeriesPlayed || 0) + 1,
            localSeriesWon: isWinnerLocal
              ? (prev.localSeriesWon || 0) + 1
              : prev.localSeriesWon || 0,
            opponentSeriesWon: !isWinnerLocal
              ? (prev.opponentSeriesWon || 0) + 1
              : prev.opponentSeriesWon || 0,
            yugiSeriesWon: seriesWinnerIsYugi
              ? (prev.yugiSeriesWon || 0) + 1
              : prev.yugiSeriesWon || 0,
            reniaSeriesWon: nextReniaSeries,
            raniaSeriesWon: nextReniaSeries,
            currentStreak: newStreak,
            streakHolder: winnerLabel
          };
          try {
            localStorage.setItem('bingo_h2h_stats_v2', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });

        // Log to Date Night Wager History ("Love Ledger")
        const loserLabel = winnerLabel === 'Yugi' ? 'Renia' : 'Yugi';

        const newHistoryItem = {
          id: Date.now().toString(),
          date: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          }),
          winnerName: winnerLabel,
          loserName: loserLabel,
          finalScore: `${nextLocalScore} - ${nextOpponentScore}`,
          wager: curActiveWager || '15-Min Massage 💆',
          status: 'pending'
        };

        setWagerHistory((prevHistory) => {
          const updated = [newHistoryItem, ...(prevHistory || [])];
          try {
            localStorage.setItem('bingo_wager_history_v1', JSON.stringify(updated));
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
          'Simultaneous BINGO! Even our boards are in love. ❤️',
          'A perfect tie — soulmates can’t even beat each other! 🥂',
          'Two boards, one heartbeat. It’s a draw! 🕊️',
          'Neither loses, meaning double the hugs! 🫂',
          'Cosmic synchronization: 100% matched. 🌌'
        ];

        const roundWinQuotes = [
          `${winnerDisplay} claimed a line & took the round! What a charmer! ❤️`,
          `That round was pure poetry in motion! ✨`,
          `A round for ${winnerDisplay}, a smile for us both. 🥰`,
          `${winnerDisplay} locked in 5 lines with unstoppable grace! 💕`
        ];

        let roundReason = '';
        if (winnerRole === 'tie') {
          roundReason = tieReasons[curCurrentRound % tieReasons.length];
        } else {
          roundReason = roundWinQuotes[curCurrentRound % roundWinQuotes.length];
        }

        setRoundWinnerInfo({
          winner: winnerRole,
          name: winnerDisplay,
          reason: roundReason,
          localScore: nextLocalScore,
          opponentScore: nextOpponentScore,
          roundNum: curCurrentRound
        });
        setScreen('round_over');
        playWinFanfare();
        fireVictoryConfetti();
      }
    },
    [
      fireVictoryConfetti
    ]
  );

  // Setup Peer message handlers
  const attachDataHandler = (conn) => {
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'HELLO': {
          setOpponentName(data.name || 'Renia');
          // Do NOT overwrite host's room wager with guest's default!
          try {
            conn.send({
              type: 'HELLO_ACK',
              name: playerNameRef.current,
              turn: 'host',
              seriesLength: seriesLengthRef.current,
              wager: activeWagerRef.current
            });
          } catch (e) {
            console.error('Failed to send HELLO_ACK:', e);
          }

          if (screenRef.current !== 'playing') {
            setScreen('playing');
            setRole('host');
            setTurn('host');
            setFirstTurnRole('host');
            setLocalScore(0);
            localScoreRef.current = 0;
            setOpponentScore(0);
            opponentScoreRef.current = 0;
            setCurrentRound(1);
            currentRoundRef.current = 1;
            const hostEmptyBoard = Array(25).fill(null);
            setBoard(hostEmptyBoard);
            boardRef.current = hostEmptyBoard;
            setIsBoardLocked(false);
            isBoardLockedRef.current = false;
            setSetupMode('manual');
            prevCompletedLinesRef.current = 0;
            prevCompletedLineIdsRef.current = [];
            prevOpponentLinesCountRef.current = 0;
            prevBotCompletedLineIdsRef.current = [];
            setLineAlert(null);
            showToast(
              `${data.name || 'Renia'} joined! Best of ${seriesLengthRef.current} for ${activeWagerRef.current}`
            );
          }
          break;
        }

        case 'HELLO_ACK': {
          if (handshakeIntervalRef.current) {
            clearInterval(handshakeIntervalRef.current);
            handshakeIntervalRef.current = null;
          }
          if (joinTimeoutRef.current) {
            clearTimeout(joinTimeoutRef.current);
            joinTimeoutRef.current = null;
          }
          setOpponentName(data.name || 'Yugi');
          if (data.seriesLength) setSeriesLength(data.seriesLength);
          if (data.wager) setCustomWager(data.wager);

          if (screenRef.current !== 'playing') {
            setScreen('playing');
            setRole('guest');
            setTurn(data.turn || 'host');
            setFirstTurnRole(data.turn || 'host');
            setLocalScore(0);
            localScoreRef.current = 0;
            setOpponentScore(0);
            opponentScoreRef.current = 0;
            setCurrentRound(1);
            currentRoundRef.current = 1;
            const guestEmptyBoard = Array(25).fill(null);
            setBoard(guestEmptyBoard);
            boardRef.current = guestEmptyBoard;
            setIsBoardLocked(false);
            isBoardLockedRef.current = false;
            setSetupMode('manual');
            prevCompletedLinesRef.current = 0;
            prevCompletedLineIdsRef.current = [];
            prevOpponentLinesCountRef.current = 0;
            prevBotCompletedLineIdsRef.current = [];
            setLineAlert(null);
            showToast(`Connected with ${data.name || 'Yugi'}! 💕`);
          }
          break;
        }

        case 'EMOTE_REACTION': {
          if (data.emoji) {
            triggerFloatingEmote(data.emoji);
            triggerHaptic([20, 30]);
            playTapSound();
          }
          break;
        }

        case 'LINE_COMPLETED': {
          const newCount = data.linesCount || 0;
          if (newCount > prevOpponentLinesCountRef.current) {
            triggerHaptic([35, 50]);
            playRomanticChime();

            const sender = data.senderName || opponentNameRef.current;
            const lineClaimedText = data.lineName ? ` ${data.lineName}` : ' a line';
            const title =
              newCount >= 5
                ? `🏆 BINGO! ${sender.toUpperCase()} WON THE ROUND!`
                : newCount === 4
                ? `🚨 ${sender} HAS 4 LINES!`
                : `💕 ${sender} claimed${lineClaimedText}! (${sender}: ${newCount}/5)`;

            const subtitle =
              newCount >= 5
                ? `${sender} completed 5 lines on their board!`
                : newCount === 4
                ? 'ONE AWAY FROM BINGO! Watch out! 💓'
                : `${sender} just claimed${lineClaimedText} on their board.`;

            triggerLineAlert({
              title,
              subtitle,
              isOpponent: true,
              count: newCount,
              lineName: data.lineName,
              senderName: sender
            });

            setOpponentLinesCount(newCount);
            prevOpponentLinesCountRef.current = newCount;
          }
          break;
        }

        case 'LINE_UPDATE': {
          if (typeof data.linesCount === 'number') {
            setOpponentLinesCount(data.linesCount);
            prevOpponentLinesCountRef.current = data.linesCount;
          }
          break;
        }

        case 'CALL_NUMBER': {
          const calledNum = data.number;
          setLastCalled(calledNum);
          playOpponentTapSound();
          triggerHaptic([10]);

          const currentCalled = calledNumbersRef.current;
          if (currentCalled.includes(calledNum)) {
            setTurn(data.nextTurn);
            break;
          }

          const updatedCalled = [...currentCalled, calledNum];
          calledNumbersRef.current = updatedCalled;
          setCalledNumbers(updatedCalled);

          // Evaluate local board with current live board
          const localEval = evaluateBoard(boardRef.current, updatedCalled);

          // Check for simultaneous win
          if (data.isClaimingWin && localEval.completedLinesCount >= 5) {
            recordRoundResult('tie', 'Both Players');
            conn.send({ type: 'CLAIM_TIE' });
            setTurn(data.nextTurn);
            break;
          }

          if (data.isClaimingWin) {
            recordRoundResult('opponent', data.senderName || opponentNameRef.current);
            setTurn(data.nextTurn);
            break;
          }

          if (localEval.completedLinesCount >= 5) {
            recordRoundResult('local', playerNameRef.current);
            conn.send({
              type: 'CLAIM_WIN',
              winnerName: playerNameRef.current,
              senderName: playerNameRef.current
            });
            setTurn(data.nextTurn);
            break;
          }

          // Check if opponent completed a new line in this turn
          if (typeof data.linesCount === 'number') {
            if (
              data.linesCount > prevOpponentLinesCountRef.current &&
              !data.isClaimingWin
            ) {
              triggerHaptic([35, 50]);
              playRomanticChime();
              const sender = data.senderName || opponentNameRef.current;
              const lineClaimedText = data.lineName ? ` ${data.lineName}` : ' a line';
              const title =
                data.linesCount === 4
                  ? `🚨 ${sender} HAS 4 LINES!`
                  : `💕 ${sender} claimed${lineClaimedText}! (${sender}: ${data.linesCount}/5)`;
              const subtitle =
                data.linesCount === 4
                  ? 'ONE AWAY FROM BINGO! Watch out! 💓'
                  : `${sender} just claimed${lineClaimedText} on their board.`;

              triggerLineAlert({
                title,
                subtitle,
                isOpponent: true,
                count: data.linesCount,
                lineName: data.lineName,
                senderName: sender
              });
            }
            prevOpponentLinesCountRef.current = data.linesCount;
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
      showToast(`${opponentName} disconnected`);
      setConnectionStatus('idle');
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      showToast('Connection error');
    });
  };

  // Helper to advance to the next round in the series
  const startNextRound = (startingTurn, roundNum) => {
    const emptyBoard = Array(25).fill(null);
    const freshBotBoard = generateBoard();
    setBoard(emptyBoard);
    boardRef.current = emptyBoard;
    setBotBoard(freshBotBoard);
    botBoardRef.current = freshBotBoard;
    setIsBoardLocked(false);
    isBoardLockedRef.current = false;
    setSetupMode('manual');
    setCalledNumbers([]);
    calledNumbersRef.current = [];
    setLastCalled(null);
    setRoundWinnerInfo(null);
    setOpponentLinesCount(0);
    prevCompletedLinesRef.current = 0;
    prevCompletedLineIdsRef.current = [];
    prevOpponentLinesCountRef.current = 0;
    prevBotCompletedLineIdsRef.current = [];
    setLineAlert(null);
    setActiveMeteors([]);
    setDominoTiles({});
    shakeControls.set({ x: 0 });
    setTurn(startingTurn);
    setFirstTurnRole(startingTurn);
    const nextRound = roundNum || currentRoundRef.current + 1;
    setCurrentRound(nextRound);
    currentRoundRef.current = nextRound;
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
    const emptyBoard = Array(25).fill(null);
    const freshBotBoard = generateBoard();
    setBoard(emptyBoard);
    boardRef.current = emptyBoard;
    setBotBoard(freshBotBoard);
    botBoardRef.current = freshBotBoard;
    setIsBoardLocked(false);
    isBoardLockedRef.current = false;
    setSetupMode('manual');
    setCalledNumbers([]);
    calledNumbersRef.current = [];
    setLastCalled(null);
    setRoundWinnerInfo(null);
    setSeriesWinnerInfo(null);
    setShowPolaroidModal(false);
    setRematchStatus('none');
    setLocalScore(0);
    localScoreRef.current = 0;
    setOpponentScore(0);
    opponentScoreRef.current = 0;
    setCurrentRound(1);
    currentRoundRef.current = 1;
    setOpponentLinesCount(0);
    prevCompletedLinesRef.current = 0;
    prevCompletedLineIdsRef.current = [];
    prevOpponentLinesCountRef.current = 0;
    prevBotCompletedLineIdsRef.current = [];
    setLineAlert(null);
    setActiveMeteors([]);
    setDominoTiles({});
    shakeControls.set({ x: 0 });
    setTurn(startingTurn);
    setFirstTurnRole(startingTurn);
    setScreen('playing');
  };

  // 1. Host: Create Room Flow (Mandatory Love Ledger Wager)
  const handleCreateRoom = (retryCount = 0) => {
    if (!customWager || !customWager.trim()) {
      showToast('💌 Please choose a Love Ledger wager for Yugi & Renia first!');
      return;
    }

    if (handshakeIntervalRef.current) clearInterval(handshakeIntervalRef.current);
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    if (connRef.current) {
      try { connRef.current.close(); } catch (e) {}
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(code);
    setRole('host');
    setPeerError('');
    setConnectionStatus('connecting');
    setScreen('waiting');

    try {
      const hostPeerId = PEER_PREFIX + code;
      const peer = new Peer(hostPeerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => {
        setConnectionStatus('idle');
        setPeerError('');
      });

      peer.on('connection', (conn) => {
        connRef.current = conn;

        // Attach data handler IMMEDIATELY so incoming HELLO packet is never missed
        attachDataHandler(conn);

        const handleOpen = () => {
          setConnectionStatus('connected');
        };

        if (conn.open) {
          handleOpen();
        } else {
          conn.on('open', handleOpen);
        }

        conn.on('close', () => {
          if (screenRef.current === 'playing') {
            showToast(`${opponentName} disconnected`);
            setConnectionStatus('idle');
          }
        });

        conn.on('error', (err) => {
          console.error('Host connection error:', err);
        });
      });

      peer.on('error', (err) => {
        console.error('Host peer error:', err);
        if (err.type === 'unavailable-id' && retryCount < 3) {
          // Room ID already occupied on PeerJS cloud; re-roll code
          handleCreateRoom(retryCount + 1);
        } else if (err.type === 'network') {
          setPeerError('Network error connecting to matchmaking server.');
          setConnectionStatus('error');
        } else {
          setPeerError(err.message || 'Matchmaking server connection error.');
          setConnectionStatus('error');
        }
      });
    } catch (err) {
      console.error('Error creating host peer:', err);
      setPeerError('Failed to initialize peer connection.');
      setConnectionStatus('error');
    }
  };

  // 2. Guest: Join Room Flow (Guest is permanently Renia)
  const handleJoinRoom = (targetCode) => {
    const code = (targetCode || inputCode).trim();
    if (!/^\d{4}$/.test(code)) {
      showToast('Please enter a valid 4-digit room code');
      return;
    }

    if (handshakeIntervalRef.current) clearInterval(handshakeIntervalRef.current);
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    if (connRef.current) {
      try { connRef.current.close(); } catch (e) {}
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }

    setRoomCode(code);
    setRole('guest');
    setPeerError('');
    setConnectionStatus('connecting');

    // 15-second connection timeout guardrail
    joinTimeoutRef.current = setTimeout(() => {
      if (screenRef.current !== 'playing') {
        if (handshakeIntervalRef.current) {
          clearInterval(handshakeIntervalRef.current);
          handshakeIntervalRef.current = null;
        }
        setConnectionStatus('error');
        setPeerError(`Could not connect to Room ${code}. Make sure Yugi has the room open.`);
        showToast(`Could not connect to Room ${code}`);
      }
    }, 15000);

    try {
      const peer = new Peer(PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => {
        const hostPeerId = PEER_PREFIX + code;
        const conn = peer.connect(hostPeerId, { reliable: true });
        connRef.current = conn;

        // Attach data handler IMMEDIATELY
        attachDataHandler(conn);

        const sendHello = () => {
          if (conn.open) {
            try {
              conn.send({
                type: 'HELLO',
                name: playerNameRef.current,
                wager: activeWagerRef.current
              });
            } catch (e) {
              console.warn('Failed to send HELLO:', e);
            }
          }
        };

        const handleOpen = () => {
          setConnectionStatus('connected');
          sendHello();

          // Handshake retry loop: resend HELLO every 600ms until 'playing' or 12 attempts
          if (handshakeIntervalRef.current) clearInterval(handshakeIntervalRef.current);
          let attempts = 0;
          handshakeIntervalRef.current = setInterval(() => {
            attempts++;
            if (screenRef.current === 'playing' || attempts > 12) {
              clearInterval(handshakeIntervalRef.current);
              handshakeIntervalRef.current = null;
              return;
            }
            if (conn.open) {
              sendHello();
            }
          }, 600);
        };

        if (conn.open) {
          handleOpen();
        } else {
          conn.on('open', handleOpen);
        }

        conn.on('close', () => {
          if (handshakeIntervalRef.current) {
            clearInterval(handshakeIntervalRef.current);
            handshakeIntervalRef.current = null;
          }
          if (screenRef.current === 'playing') {
            showToast('Opponent disconnected');
            setConnectionStatus('idle');
          }
        });

        conn.on('error', (err) => {
          console.error('Guest connection error:', err);
          if (handshakeIntervalRef.current) {
            clearInterval(handshakeIntervalRef.current);
            handshakeIntervalRef.current = null;
          }
          if (joinTimeoutRef.current) {
            clearTimeout(joinTimeoutRef.current);
            joinTimeoutRef.current = null;
          }
          setPeerError(`Could not reach Room ${code}. Check the code and try again.`);
          setConnectionStatus('error');
        });
      });

      peer.on('error', (err) => {
        console.error('Guest peer error:', err);
        if (handshakeIntervalRef.current) {
          clearInterval(handshakeIntervalRef.current);
          handshakeIntervalRef.current = null;
        }
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
          joinTimeoutRef.current = null;
        }
        if (err.type === 'peer-unavailable') {
          setPeerError(`Room ${code} not found. Please verify the code and make sure Yugi has the room open.`);
        } else if (err.type === 'network') {
          setPeerError('Network error connecting to matchmaking server.');
        } else {
          setPeerError(err.message || 'Failed to initialize connection. Please try again.');
        }
        setConnectionStatus('error');
      });
    } catch (err) {
      console.error('Error creating guest peer:', err);
      setPeerError('Failed to initialize connection.');
      setConnectionStatus('error');
    }
  };

  // 3. Solo Practice vs Smart Bot Mode Flow
  const handlePlaySolo = () => {
    if (peerRef.current) peerRef.current.destroy();
    setRole('solo');

    const soloOpponentName = 'Renia (AI 💕)';
    setOpponentName(soloOpponentName);
    const emptyBoard = Array(25).fill(null);
    const freshBotBoard = generateBoard();
    setBoard(emptyBoard);
    boardRef.current = emptyBoard;
    setBotBoard(freshBotBoard);
    botBoardRef.current = freshBotBoard;
    setIsBoardLocked(false);
    isBoardLockedRef.current = false;
    setSetupMode('manual');
    setCalledNumbers([]);
    calledNumbersRef.current = [];
    setLastCalled(null);
    setRoundWinnerInfo(null);
    setSeriesWinnerInfo(null);
    setShowPolaroidModal(false);
    setRematchStatus('none');
    setLocalScore(0);
    localScoreRef.current = 0;
    setOpponentScore(0);
    opponentScoreRef.current = 0;
    setCurrentRound(1);
    currentRoundRef.current = 1;
    setOpponentLinesCount(0);
    prevCompletedLinesRef.current = 0;
    prevCompletedLineIdsRef.current = [];
    prevOpponentLinesCountRef.current = 0;
    prevBotCompletedLineIdsRef.current = [];
    setLineAlert(null);
    setTurn('player');
    setFirstTurnRole('player');
    setScreen('playing');
    showToast(`Solo Practice vs ${soloOpponentName}! Best of ${seriesLength}`);
  };

  // Share Invite Link Helper
  const handleShareInvite = async () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Date Night Bingo with Yugi & Renia ❤️',
          text: `Join our Best-of-${seriesLength} Bingo match for "${activeWager}"! Code: ${roomCode}`,
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

  const fallbackCopyText = (text) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        showToast('Invite Link Copied! 📋');
      } else {
        showToast(`Room Code: ${roomCode}`);
      }
    } catch (e) {
      showToast(`Room Code: ${roomCode}`);
    }
  };

  const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast('Invite Link Copied! 📋'),
        () => fallbackCopyText(text)
      );
    } else {
      fallbackCopyText(text);
    }
  };

  // Copy or Share Polaroid Memory Card
  const handleSharePolaroidMemory = async () => {
    const memoryText = `📸 Yugi & Renia Date Night Bingo 🌹\n🏆 ${
      seriesWinnerInfo?.name
    } won the Series (${seriesWinnerInfo?.finalScore})!\n📜 Official Contract: ${
      seriesWinnerInfo?.wager || activeWager
    }\n✨ "Destined minds • Sealed with love 💕"`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Yugi & Renia Date Night Victory Memory Card 📸',
          text: memoryText
        });
      } catch (e) {
        copyToClipboard(memoryText);
      }
    } else {
      copyToClipboard(memoryText);
    }
  };

  // Fill remaining (or all) empty slots randomly
  const handleFillRandom = () => {
    if (isBoardLocked) return;
    playShuffleSound();
    triggerHaptic([15, 25]);
    setBoard((prevBoard) => {
      const unplaced = Array.from({ length: 25 }, (_, i) => i + 1).filter(
        (n) => !prevBoard.includes(n)
      );
      if (unplaced.length === 0) {
        // If already full, reshuffle all 25 numbers
        const fresh = generateBoard();
        boardRef.current = fresh;
        showToast('Board reshuffled with random numbers! 🎲');
        return fresh;
      }
      // Shuffle unplaced numbers using Fisher-Yates
      const shuffledUnplaced = [...unplaced];
      for (let i = shuffledUnplaced.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledUnplaced[i], shuffledUnplaced[j]] = [shuffledUnplaced[j], shuffledUnplaced[i]];
      }
      const next = [...prevBoard];
      let fillIdx = 0;
      for (let i = 0; i < 25; i++) {
        if (next[i] === null && fillIdx < shuffledUnplaced.length) {
          next[i] = shuffledUnplaced[fillIdx++];
        }
      }
      boardRef.current = next;
      showToast('Filled empty slots randomly! 🎲');
      return next;
    });
  };

  // Clear Board in Setup Mode
  const handleClearBoard = () => {
    if (isBoardLocked) return;
    playTapSound();
    triggerHaptic([15]);
    const emptyBoard = Array(25).fill(null);
    setBoard(emptyBoard);
    boardRef.current = emptyBoard;
    showToast('Board cleared');
  };

  // Lock board and ready up
  const handleLockBoard = () => {
    if (isBoardLocked) return;
    const isFull = board.every((cell) => cell !== null);
    if (!isFull) {
      showToast('Please fill all 25 numbers before locking!');
      return;
    }
    playRomanticChime();
    triggerHaptic([20, 40]);
    setIsBoardLocked(true);
    isBoardLockedRef.current = true;
    showToast('Board locked & ready! Game on! 🎯');
  };

  // Human Player taps a number tile
  const handleTileClick = (index) => {
    if (screen !== 'playing') return;

    // Guardrail: if board is not locked yet, handle on-tap sequential fill or remove
    if (!isBoardLocked) {
      setBoard((prevBoard) => {
        const currentVal = prevBoard[index];

        // Tapped a placed number: remove it and return it to unplaced pool
        if (currentVal !== null) {
          playTapSound();
          triggerHaptic([10]);
          const next = [...prevBoard];
          next[index] = null;
          boardRef.current = next;
          showToast(`Removed #${currentVal}`);
          return next;
        }

        // Tapped empty box: place the lowest unplaced number (1, 2, 3... 25) in sequence!
        let nextNum = 1;
        while (nextNum <= 25 && prevBoard.includes(nextNum)) {
          nextNum++;
        }

        if (nextNum > 25) {
          showToast('Board is full! Lock when ready 🔒');
          return prevBoard;
        }

        playPlacementNote(nextNum);
        triggerHaptic([12]);
        const next = [...prevBoard];
        next[index] = nextNum;
        boardRef.current = next;
        return next;
      });
      return;
    }

    const number = boardRef.current[index];
    if (number === null) return;

    // Check turn
    const isMyTurn = role === 'solo' ? turn === 'player' : turn === role;
    if (!isMyTurn) {
      showToast(
        playerName === 'Yugi'
          ? "Waiting for your darling Renia's move! 💕"
          : "Waiting for your handsome Yugi's move! 🥂"
      );
      return;
    }

    if (calledNumbers.includes(number)) return;

    // Process move
    playTapSound();
    triggerHaptic([12]);
    const nextCalled = [...calledNumbers, number];
    calledNumbersRef.current = nextCalled;
    setCalledNumbers(nextCalled);
    setLastCalled(number);

    // Evaluate local board with current live board
    const localEval = evaluateBoard(boardRef.current, nextCalled);
    const hasWon = localEval.completedLinesCount >= 5;

    // Determine newly completed line for local player
    const newlyCompletedLocalIds = (localEval.completedLineIds || []).filter(
      (id) => !prevCompletedLineIdsRef.current.includes(id)
    );
    const localLineName =
      newlyCompletedLocalIds.map((id) => LINE_NAMES[id]).join(' & ') || '';

    if (role === 'solo') {
      // Solo Bot Mode
      if (hasWon) {
        recordRoundResult('local', playerNameRef.current);
        return;
      }

      // Check bot lines count
      const botEval = evaluateBoard(botBoardRef.current, nextCalled);
      const newlyCompletedBotIds = (botEval.completedLineIds || []).filter(
        (id) => !prevBotCompletedLineIdsRef.current.includes(id)
      );
      const botLineName =
        newlyCompletedBotIds.map((id) => LINE_NAMES[id]).join(' & ') || '';

      const botDisplayName = 'Renia (AI 💕)';

      const playerGainedLine = localEval.completedLinesCount > prevCompletedLinesRef.current;
      const botGainedLine =
        botEval.completedLinesCount > prevOpponentLinesCountRef.current &&
        botEval.completedLinesCount < 5;

      if (playerGainedLine && botGainedLine) {
        triggerHaptic([35, 50, 35]);
        playRomanticChime();
        triggerLineAlert({
          title: `⚡ DOUBLE LINE! You claimed ${localLineName} & ${botDisplayName} claimed ${botLineName}!`,
          subtitle: `Both boards progressed! You: ${localEval.completedLinesCount}/5 • Opponent: ${botEval.completedLinesCount}/5`,
          isOpponent: false,
          count: localEval.completedLinesCount,
          isDouble: true
        });
      } else if (botGainedLine) {
        triggerHaptic([35, 50]);
        playRomanticChime();
        triggerLineAlert({
          title:
            botEval.completedLinesCount === 4
              ? `🚨 ${botDisplayName} HAS 4 LINES!`
              : `💕 ${botDisplayName} claimed ${botLineName}! (${botDisplayName}: ${botEval.completedLinesCount}/5)`,
          subtitle: `${botDisplayName} just claimed ${botLineName} on their hidden board!`,
          isOpponent: true,
          count: botEval.completedLinesCount,
          lineName: botLineName,
          senderName: botDisplayName
        });
      }

      prevOpponentLinesCountRef.current = botEval.completedLinesCount;
      prevBotCompletedLineIdsRef.current = botEval.completedLineIds || [];
      setOpponentLinesCount(botEval.completedLinesCount);

      if (botEval.completedLinesCount >= 5) {
        recordRoundResult('opponent', botDisplayName);
        return;
      }

      // Switch to bot's turn
      setTurn('bot');
    } else {
      // Multiplayer WebRTC Mode
      const nextTurnRole = role === 'host' ? 'guest' : 'host';
      setTurn(nextTurnRole);

      // Send CALL_NUMBER to peer with line name
      if (connRef.current && connRef.current.open) {
        connRef.current.send({
          type: 'CALL_NUMBER',
          number,
          nextTurn: nextTurnRole,
          isClaimingWin: hasWon,
          senderName: playerNameRef.current,
          linesCount: localEval.completedLinesCount,
          lineName: localLineName
        });
      }

      if (hasWon) {
        recordRoundResult('local', playerNameRef.current);
      }
    }
  };

  // Bot Turn Automation in Solo Mode (natural 650ms delay, waits for player to lock board)
  useEffect(() => {
    if (role !== 'solo' || screen !== 'playing' || turn !== 'bot' || !isBoardLocked) return;

    const timer = setTimeout(() => {
      const chosenNum = getBestBotMove(botBoardRef.current, calledNumbersRef.current);
      playOpponentTapSound();
      triggerHaptic([12]);

      setLastCalled(chosenNum);
      const nextCalled = [...calledNumbersRef.current, chosenNum];
      calledNumbersRef.current = nextCalled;
      setCalledNumbers(nextCalled);

      // Evaluate both boards with bot's pick
      const playerEval = evaluateBoard(boardRef.current, nextCalled);
      const botEval = evaluateBoard(botBoardRef.current, nextCalled);

      const botDisplayName = 'Renia (AI 💕)';

      const botGainedLine =
        botEval.completedLinesCount > prevOpponentLinesCountRef.current &&
        botEval.completedLinesCount < 5;
      const playerGainedLine =
        playerEval.completedLinesCount > prevCompletedLinesRef.current &&
        playerEval.completedLinesCount < 5;

      const newlyCompletedBotIds = (botEval.completedLineIds || []).filter(
        (id) => !prevBotCompletedLineIdsRef.current.includes(id)
      );
      const botLineName =
        newlyCompletedBotIds.map((id) => LINE_NAMES[id]).join(' & ') || 'a line';

      const newlyCompletedLocalIds = (playerEval.completedLineIds || []).filter(
        (id) => !prevCompletedLineIdsRef.current.includes(id)
      );
      const playerLineName =
        newlyCompletedLocalIds.map((id) => LINE_NAMES[id]).join(' & ') || 'a line';

      if (playerGainedLine && botGainedLine) {
        triggerHaptic([35, 50, 35]);
        playRomanticChime();
        triggerLineAlert({
          title: `⚡ DOUBLE LINE! You claimed ${playerLineName} & ${botDisplayName} claimed ${botLineName}!`,
          subtitle: `Both boards progressed! You: ${playerEval.completedLinesCount}/5 • Opponent: ${botEval.completedLinesCount}/5`,
          isOpponent: false,
          count: playerEval.completedLinesCount,
          isDouble: true
        });
      } else if (botGainedLine) {
        triggerHaptic([35, 50]);
        playRomanticChime();
        triggerLineAlert({
          title:
            botEval.completedLinesCount === 4
              ? `🚨 ${botDisplayName} HAS 4 LINES!`
              : `💕 ${botDisplayName} claimed ${botLineName}! (${botDisplayName}: ${botEval.completedLinesCount}/5)`,
          subtitle: `${botDisplayName} just claimed ${botLineName} on their hidden board!`,
          isOpponent: true,
          count: botEval.completedLinesCount,
          lineName: botLineName,
          senderName: botDisplayName
        });
      }

      prevOpponentLinesCountRef.current = botEval.completedLinesCount;
      prevBotCompletedLineIdsRef.current = botEval.completedLineIds || [];
      setOpponentLinesCount(botEval.completedLinesCount);

      const botWon = botEval.completedLinesCount >= 5;
      const playerWon = playerEval.completedLinesCount >= 5;

      if (botWon && playerWon) {
        recordRoundResult('tie', 'Both Players');
      } else if (botWon) {
        recordRoundResult('opponent', botDisplayName);
      } else if (playerWon) {
        recordRoundResult('local', playerNameRef.current);
      } else {
        setTurn('player');
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [
    role,
    screen,
    turn,
    isBoardLocked,
    recordRoundResult,
    triggerLineAlert
  ]);

  // Handle Series Rematch Click
  const handleSeriesRematch = () => {
    const nextStart = firstTurnRole === 'host' ? 'guest' : 'host';

    if (role === 'solo') {
      const nextSoloStart = firstTurnRole === 'player' ? 'bot' : 'player';
      startNewSeries(nextSoloStart);
      showToast(
        nextSoloStart === 'player' ? 'New series! Your turn.' : 'New series! Bot starts.'
      );
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
    if (handshakeIntervalRef.current) {
      clearInterval(handshakeIntervalRef.current);
      handshakeIntervalRef.current = null;
    }
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
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
    setShowPolaroidModal(false);
    setRematchStatus('none');
    setCalledNumbers([]);
    setLastCalled(null);
    setLocalScore(0);
    setOpponentScore(0);
    prevCompletedLinesRef.current = 0;
    prevOpponentLinesCountRef.current = 0;
    setLineAlert(null);
    setIsBoardLocked(false);
    isBoardLockedRef.current = false;
    setSetupMode('manual');
    const emptyBoard = Array(25).fill(null);
    setBoard(emptyBoard);
    boardRef.current = emptyBoard;
  };

  // Status banner text tailored for Yugi and Renia banter
  const isLocalTurn = role === 'solo' ? turn === 'player' : turn === role;
  let statusBannerText = '';

  const waitingQuotesForYugi = [
    "Waiting for Renia’s sweet move... 💕",
    "Take your time, my queen... admiring you. 🌹",
    "Renia is plotting something dangerously cute... 💭",
    "No pressure, beauty, but the crown is waiting! 👑",
    "Listening to Renia’s adorable thinking sounds... 🎶",
    "Contemplating love or your next number, Renia? 🥰",
    "Renia's Turn to Strike! ⚡",
    "Patience, king... Renia is cooking her master move! 🥂"
  ];

  const waitingQuotesForRenia = [
    "Waiting for Yugi’s genius move... ✨",
    "Take your time, handsome... I'm watching you. 😉",
    "Yugi is overthinking as usual... 💭",
    "Show me what you've got, king! 👑",
    "Watching Yugi cook up his master strategy... 🥂",
    "Contemplating love or your next number, Yugi? 🥰",
    "Yugi is thinking deeply... 💕",
    "Yugi's turn to make his lady proud! 🌹"
  ];

  const turnQuotesForYugi = [
    "Your turn, handsome! Make it count. ❤️",
    "Show Renia how a master plays! 🥂",
    "The board is yours, king! 👑",
    "Make your lady proud, Yugi! 🌹",
    "Time to show that genius strategy! ✨",
    "Your move, my love! ❤️"
  ];

  const turnQuotesForRenia = [
    "Your turn, gorgeous! Make it count. ❤️",
    "The board is yours, my queen. 👑",
    "Show Yugi who truly runs this house! 💅",
    "Show me how a master plays, darling. 🥂",
    "Your move, beauty! 🌹",
    "Pick a lucky number for us both! 🍀"
  ];

  const isYugi = playerName === 'Yugi';
  if (isLocalTurn) {
    const list = isYugi ? turnQuotesForYugi : turnQuotesForRenia;
    statusBannerText = list[calledNumbers.length % list.length];
  } else {
    const list = isYugi ? waitingQuotesForYugi : waitingQuotesForRenia;
    statusBannerText = list[calledNumbers.length % list.length];
  }

  return (
    <div className="relative w-full min-h-screen flex flex-col justify-between overflow-x-hidden text-[#F8FAFC] date-night-mode bg-[#12030C]">
      {/* Background Ambient Glow Orbs */}
      <div className="ambient-glow-wrapper">
        <div className="glow-orb-top-left" />
        <div className="glow-orb-bottom-right" />
        <FloatingParticles />
      </div>

      {/* Film Grain Texture Overlay */}
      <div className="noise-overlay" aria-hidden="true" />

      {/* Full-Screen Vignette & Cinematic Depth Overlay */}
      <div className="fixed inset-0 pointer-events-none shadow-[inset_0_0_120px_rgba(0,0,0,0.8)] z-0" aria-hidden="true" />

      {/* Floating Reaction Emotes */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {floatingEmotes.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 1, y: 0, x: item.x, scale: 0.7 }}
            animate={{ opacity: 0, y: -window.innerHeight * 0.55, scale: 1.5 }}
            transition={{ duration: 2.2, ease: 'easeOut' }}
            className="absolute bottom-16 text-3xl filter drop-shadow-lg select-none"
          >
            {item.emoji}
          </motion.div>
        ))}
      </div>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full glass-panel shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-semibold tracking-wide text-rose-100 bg-rose-950/90 shadow-rose-950/60"
          >
            <Heart size={15} className="text-rose-400 fill-rose-400 animate-pulse" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* SCREEN 1: LOBBY (EXCLUSIVE TO YUGI & RENIA) */}
      {/* ================================================================ */}
      {screen === 'lobby' && (
        <div className="relative z-10 w-full min-h-[100dvh] flex flex-col justify-between px-4 py-4 max-w-md mx-auto overflow-y-auto space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-lg bg-gradient-to-tr from-rose-500 to-rose-700 shadow-rose-500/30">
                ❤️
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  BINGO{' '}
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold border bg-rose-500/20 text-rose-300 border-rose-500/30">
                    DATE NIGHT
                  </span>
                </h1>
                <p className="text-xs font-semibold text-rose-300/80 tracking-wider">
                  YUGI & RENIA EXCLUSIVE 🌹
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveStatsTab('ledger');
                  setShowStatsModal(true);
                }}
                className="relative w-10 h-10 rounded-full glass-button flex items-center justify-center text-rose-300 hover:text-white"
                title="Love Ledger & Wager Debts"
              >
                <ScrollText size={18} />
                {pendingDebtsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold flex items-center justify-center shadow-md animate-pulse">
                    {pendingDebtsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveStatsTab('stats');
                  setShowStatsModal(true);
                }}
                className="w-10 h-10 rounded-full glass-button flex items-center justify-center text-amber-300"
                title="View Head-to-Head Stats"
              >
                <Flame size={18} />
              </button>
              <button
                onClick={handleToggleMute}
                className="w-10 h-10 rounded-full glass-button flex items-center justify-center text-slate-300"
                title="Toggle Sound"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          </div>

          {/* Yugi & Renia Exclusive Lifetime Scoreboard */}
          <GlareCard
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/70 via-rose-900/50 to-amber-950/40 border border-rose-500/40 shadow-lg"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                <Heart size={13} className="text-rose-400 fill-rose-400" />
                <span>Lifetime Scoreboard</span>
              </span>
              <span className="text-xs text-amber-300 font-bold flex items-center gap-1">
                <Flame size={13} className="text-amber-400 fill-amber-400" />
                <span>
                  Streak:{' '}
                  {stats.streakHolder !== 'None'
                    ? `${stats.streakHolder} (${stats.currentStreak || 0})`
                    : 'None'}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              {/* Yugi Card */}
              <div className="p-2.5 rounded-xl border bg-rose-950/80 border-rose-400/50 shadow-inner flex flex-col items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white bg-gradient-to-tr from-amber-500 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.4)] border border-rose-300/40 mb-1">
                  Y
                </div>
                <div className="text-sm font-bold text-white flex items-center justify-center gap-1">
                  <span>Yugi</span> 🥂
                </div>
                <div className="text-2xl font-black text-amber-400 font-display leading-none my-1">
                  {stats.yugiSeriesWon || 0}{' '}
                  <span className="text-xs text-slate-400 font-sans font-bold">Series</span>
                </div>
                <div className="text-xs text-slate-300 font-medium">
                  {stats.yugiRoundsWon || 0} Rounds Won
                </div>
              </div>

              {/* Renia Card */}
              <div className="p-2.5 rounded-xl border bg-rose-950/80 border-rose-400/50 shadow-inner flex flex-col items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white bg-gradient-to-tr from-rose-500 to-pink-600 shadow-[0_0_10px_rgba(244,63,94,0.4)] border border-rose-300/40 mb-1">
                  R
                </div>
                <div className="text-sm font-bold text-white flex items-center justify-center gap-1">
                  <span>Renia</span> 🌹
                </div>
                <div className="text-2xl font-black text-rose-300 font-display leading-none my-1">
                  {stats.reniaSeriesWon || stats.raniaSeriesWon || 0}{' '}
                  <span className="text-xs text-slate-400 font-sans font-bold">Series</span>
                </div>
                <div className="text-xs text-slate-300 font-medium">
                  {stats.reniaRoundsWon || stats.raniaRoundsWon || 0} Rounds Won
                </div>
              </div>
            </div>
          </GlareCard>

          {/* Mandatory Love Ledger Wager / Stakes Selector */}
          <GlareCard
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-3.5 rounded-2xl glass-card space-y-2.5 shadow-lg border-rose-500/40"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                <Gift size={13} className="text-amber-400" />
                <span>Love Ledger Wager (Mandatory)</span>
              </label>
              <span className="text-xs text-amber-300 font-bold">Prize at stake</span>
            </div>

            <div className="relative flex items-center">
              <input
                type="text"
                maxLength={45}
                value={customWager}
                onChange={(e) => handleWagerChange(e.target.value)}
                placeholder="Choose or enter wager... (e.g. 15-Min Massage 💆)"
                className="w-full bg-slate-900/75 border border-rose-500/40 focus:border-rose-400 rounded-xl pl-3.5 pr-8 py-2.5 text-sm font-semibold text-white placeholder-slate-400 outline-none transition shadow-inner"
              />
              {customWager && (
                <button
                  type="button"
                  onClick={() => handleWagerChange('')}
                  className="absolute right-2.5 w-5 h-5 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition"
                  title="Clear"
                >
                  ×
                </button>
              )}
            </div>

            {/* Quick 1-Tap Preset Wager Chips */}
            <div className="flex flex-wrap gap-1.5">
              {WAGER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    handleWagerChange(preset);
                    triggerHaptic([10]);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs transition border ${
                    customWager === preset
                      ? 'bg-rose-500/30 border-rose-400 text-rose-200 font-bold shadow-sm'
                      : 'bg-slate-900/60 border-slate-700/50 text-slate-300 hover:text-white hover:border-rose-500/40'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </GlareCard>

          {/* Series Length & Room Actions */}
          <div className="space-y-2.5">
            {/* Best-of Series Selector */}
            <div className="glass-card p-3 space-y-2 rounded-2xl border-rose-500/30">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Swords size={13} className="text-amber-400" />
                  <span>Series Match Length</span>
                </label>
                <span className="text-xs font-bold text-amber-300">
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
                      onClick={() => {
                        setSeriesLength(item.length);
                        triggerHaptic([10]);
                      }}
                      className={`py-2 px-1 rounded-xl text-center transition flex flex-col items-center justify-center border ${
                        isSelected
                          ? 'bg-rose-500 border-rose-300 text-white font-extrabold shadow-md shadow-rose-500/30'
                          : 'bg-slate-900/60 border-slate-700/50 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs leading-none font-bold">{item.label}</span>
                      <span className="text-[10px] font-bold opacity-80 mt-0.5">{item.wins}W</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prominent Invite Link Hero Banner (when opening ?room=XXXX) */}
            {isUrlJoin && inputCode && (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="p-3.5 rounded-2xl border shadow-xl flex flex-col gap-2.5 bg-gradient-to-r from-rose-950/90 via-rose-900/70 to-amber-950/60 border-rose-400/50 shadow-rose-950/60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Match Invite Ready
                    </span>
                  </div>
                  <span className="font-mono text-sm font-black text-white px-2.5 py-0.5 rounded-lg bg-black/50 border border-white/10">
                    Room #{inputCode}
                  </span>
                </div>
                <RippleButton
                  onClick={() => handleJoinRoom(inputCode)}
                  disabled={connectionStatus === 'connecting'}
                  className="w-full py-3.5 rounded-xl text-white font-black text-base flex items-center justify-center gap-2 shadow-lg border border-white/20 transition bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/40"
                >
                  <Users size={20} />
                  <span>
                    {connectionStatus === 'connecting'
                      ? 'Connecting as Renia...'
                      : `Join Room #${inputCode} as Renia 🌹`}
                  </span>
                </RippleButton>
              </motion.div>
            )}

            {/* Create Room Button (Host is Yugi) */}
            <RippleButton
              onClick={handleCreateRoom}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/25 border-rose-400/30"
            >
              <Users size={20} />
              <span>Create Room as Yugi 🥂 (Best of {seriesLength})</span>
            </RippleButton>

            {/* Join Room Box (Guest is Renia) */}
            <div
              className={`glass-card p-3 space-y-2 rounded-2xl transition-all ${
                isUrlJoin ? 'ring-2 ring-rose-500/80 bg-rose-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  {isUrlJoin ? "Yugi's Invite Link Ready" : "Join Yugi's Room as Renia 🌹"}
                </span>
                {isUrlJoin && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
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
                  onChange={(e) => {
                    setInputCode(e.target.value.slice(0, 4));
                    if (peerError) setPeerError('');
                  }}
                  placeholder="4-digit code"
                  className="w-full bg-slate-900/60 border border-slate-700/60 focus:border-rose-500 rounded-xl px-3 py-2 text-center text-lg font-mono font-bold tracking-widest text-white placeholder-slate-500 outline-none transition"
                />
                <RippleButton
                  onClick={() => handleJoinRoom()}
                  disabled={connectionStatus === 'connecting' || inputCode.length !== 4}
                  className="px-5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-sm border border-rose-400/40 transition flex items-center justify-center shrink-0 shadow-md shadow-rose-950/40"
                >
                  {connectionStatus === 'connecting' ? 'Joining...' : 'Join as Renia'}
                </RippleButton>
              </div>

              {peerError && (
                <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-1.5 pt-1">
                  <AlertCircle size={14} className="shrink-0 text-rose-400 mt-0.5" />
                  <div className="flex-1">
                    <span>{peerError}</span>
                    <button
                      onClick={() => handleJoinRoom()}
                      className="block mt-1 font-bold text-rose-400 hover:underline"
                    >
                      Tap to Retry Join
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Solo Practice Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handlePlaySolo}
              className="w-full py-3 rounded-2xl glass-button text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-800/80"
            >
              <Bot size={18} className="text-rose-400" />
              <span>Solo Practice vs Renia AI 💕 (Best of {seriesLength})</span>
            </motion.button>
          </div>

          {/* Footer Info & Quick Stats Pill */}
          <div className="text-center pt-1.5 pb-1">
            <button
              onClick={() => setShowStatsModal(true)}
              className="text-xs text-slate-400 hover:text-amber-300 transition flex items-center justify-center gap-1.5 mx-auto"
            >
              <Flame size={14} className="text-amber-400" />
              <span>
                Yugi: {stats.yugiSeriesWon || 0}W • Renia: {stats.reniaSeriesWon || stats.raniaSeriesWon || 0}W • Streak: 🔥 {stats.currentStreak || 0}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SCREEN 2: WAITING ROOM (HOST: YUGI) */}
      {/* ================================================================ */}
      {screen === 'waiting' && (
        <div className="relative z-10 w-full min-h-[100dvh] flex flex-col justify-between px-5 py-6 max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleLeaveToLobby}
              className="px-3.5 py-2 rounded-full glass-button text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <ArrowLeft size={16} />
              <span>Cancel</span>
            </button>
            <span className="text-sm font-bold tracking-wider text-rose-400">
              BEST OF {seriesLength}
            </span>
          </div>

          {/* Center Card */}
          <div className="my-auto text-center space-y-5">
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                <span>Room Created!</span>
                <span>❤️</span>
              </h2>
              <p className="text-sm text-slate-300 max-w-xs mx-auto">
                Playing for: "{activeWager}" 💕 Share this code with Renia!
              </p>
            </div>

            {/* Giant Room Code Display */}
            <div className="glass-card py-6 px-4 max-w-xs mx-auto relative overflow-hidden shadow-2xl shadow-rose-950/50 border-rose-500/40">
              <div className="text-xs uppercase font-bold text-slate-400 tracking-widest mb-1.5">
                Room Code
              </div>
              <div className="text-5xl sm:text-6xl font-black tracking-widest font-display text-rose-300">
                {roomCode}
              </div>
            </div>

            {/* Share / Copy Buttons */}
            <div className="space-y-3 max-w-xs mx-auto">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleShareInvite}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/20 border-rose-400/30"
              >
                <Share2 size={20} />
                <span>Share Invite Link with Renia</span>
              </motion.button>

              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
                  copyToClipboard(url);
                }}
                className="w-full py-3 rounded-2xl glass-button text-sm font-semibold text-slate-300 flex items-center justify-center gap-2"
              >
                <Copy size={16} />
                <span>Copy Shareable URL</span>
              </button>
            </div>

            {/* Connection Error Banner & Regenerate Button */}
            {peerError && (
              <div className="max-w-xs mx-auto p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs text-rose-300 flex flex-col items-center gap-2 text-center shadow-lg">
                <div className="flex items-center gap-1.5 font-bold text-rose-200">
                  <AlertCircle size={15} className="text-rose-400 shrink-0" />
                  <span>Connection Issue</span>
                </div>
                <p>{peerError}</p>
                <button
                  onClick={() => handleCreateRoom()}
                  className="px-4 py-1.5 rounded-lg bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition shadow-md shadow-rose-500/30"
                >
                  Regenerate Room
                </button>
              </div>
            )}

            {/* Live Waiting Status Indicator */}
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-300 pt-1">
              {connectionStatus === 'connecting' ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-amber-400" />
                  <span className="text-amber-300">Registering room with server...</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-rose-400" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                  </span>
                  <span>Room is live! Waiting for Renia to connect...</span>
                </>
              )}
            </div>
          </div>

          <div className="text-center pb-2">
            <p className="text-xs text-slate-400">
              Matches play automatically up to {targetWins} wins!
            </p>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SCREEN 3: GAME ARENA */}
      {/* ================================================================ */}
      {(screen === 'playing' || screen === 'round_over' || screen === 'series_over') && (
        <div className="relative z-10 w-full min-h-[100dvh] flex flex-col justify-between px-3.5 py-2 max-w-md mx-auto">
          {/* Top Bar: Navigation, Series Indicator, Mute */}
          <div className="w-full flex items-center justify-between pt-1">
            <button
              onClick={handleLeaveToLobby}
              className="p-2 rounded-xl glass-button text-slate-400 hover:text-white"
              title="Leave Room"
            >
              <ArrowLeft size={18} />
            </button>

            {/* Series Indicator & Target */}
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full glass-panel text-xs font-bold">
              <Swords size={14} className="text-amber-400" />
              <span>
                Round {currentRound} • Best of {seriesLength} (First to {targetWins})
              </span>
            </div>

            <button
              onClick={handleToggleMute}
              className="p-2 rounded-xl glass-button text-slate-400 hover:text-white"
              title="Toggle Sound"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>

          {/* Series Head-to-Head Scoreboard Card */}
          <div
            className={`w-full py-2 px-3 rounded-2xl flex items-center justify-between border shadow-md my-0.5 transition-all duration-300 ${
              isOpponentThreat
                ? 'bg-rose-950/60 border-rose-500/70 shadow-[0_0_18px_rgba(244,63,94,0.35)]'
                : 'bg-rose-950/40 border-rose-500/30'
            }`}
          >
            {/* Player 1 (Local) */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white bg-gradient-to-tr from-amber-500 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.5)] border border-rose-300/40 shrink-0">
                {playerName === 'Yugi' ? 'Y' : 'R'}
              </div>
              <div className="min-w-0 flex-1 max-w-[95px] sm:max-w-[125px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-white truncate block">
                    {playerName}
                  </span>
                  <span className="text-[10px] text-rose-300/90 font-semibold font-mono ml-1 shrink-0">
                    {completedLinesCount}/5
                  </span>
                </div>
                {/* Player 1 Sleek Progress Bar */}
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (completedLinesCount / 5) * 100)}%` }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <span className="text-sm sm:text-base font-black px-2 py-0.5 rounded-lg shrink-0 font-display bg-rose-500/20 text-rose-300">
                {localScore}
              </span>
            </div>

            <div className="text-[11px] font-black uppercase text-rose-400/60 tracking-wider px-1.5">
              VS
            </div>

            {/* Player 2 (Opponent) */}
            <div className="flex items-center gap-2 min-w-0 justify-end flex-1">
              <span className="text-sm sm:text-base font-black px-2 py-0.5 rounded-lg shrink-0 font-display bg-amber-500/20 text-amber-300">
                {opponentScore}
              </span>
              <div className="text-right min-w-0 flex-1 max-w-[95px] sm:max-w-[125px]">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-semibold font-mono mr-1 shrink-0 ${
                      isOpponentThreat ? 'text-amber-300 font-black' : 'text-rose-300/90'
                    }`}
                  >
                    {opponentLinesCount}/5
                  </span>
                  <span
                    className={`font-bold text-xs sm:text-sm truncate block ${
                      isOpponentThreat ? 'text-rose-300 font-black animate-pulse' : 'text-slate-300'
                    }`}
                  >
                    {opponentName}
                  </span>
                </div>
                {/* Opponent Progress Bar with Imminent Threat Heat Aura */}
                <div
                  className={`w-full h-1.5 rounded-full overflow-hidden mt-1 transition-all ${
                    isOpponentThreat
                      ? 'bg-rose-950/80 ring-1 ring-rose-500/80 shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                      : 'bg-white/10'
                  }`}
                >
                  <motion.div
                    className={`h-full rounded-full ${
                      isOpponentThreat
                        ? 'bg-gradient-to-r from-amber-400 via-rose-500 to-red-600 shadow-[0_0_8px_rgba(239,68,68,0.9)]'
                        : 'bg-gradient-to-r from-amber-400 to-rose-400'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (opponentLinesCount / 5) * 100)}%` }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Opponent Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white shrink-0 shadow-md ${
                  opponentName.includes('Rania') || opponentName.includes('Renia')
                    ? 'bg-gradient-to-tr from-rose-500 to-pink-600 shadow-[0_0_10px_rgba(244,63,94,0.5)] border border-rose-300/40'
                    : 'bg-gradient-to-tr from-amber-500 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.5)] border border-rose-300/40'
                }`}
              >
                {opponentName.includes('Rania') || opponentName.includes('Renia') ? 'R' : 'Y'}
              </div>
            </div>
          </div>

          {/* Dedicated Centered Turn Status Banner */}
          <div className="flex items-center justify-center w-full h-12 mt-1 mb-3">
            <motion.div
              animate={isLocalTurn ? { scale: [1, 1.02, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2.2 }}
              className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 border shadow-sm transition-all max-w-[95%] justify-center ${
                !isBoardLocked
                  ? 'bg-slate-800/80 text-amber-300 border-amber-500/30'
                  : isLocalTurn
                  ? 'bg-rose-500/25 text-rose-200 border-rose-400/40 shadow-rose-950/40'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700/40'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  !isBoardLocked
                    ? 'bg-amber-400 animate-pulse'
                    : isLocalTurn
                    ? 'bg-rose-400 animate-pulse'
                    : 'bg-rose-400/60'
                }`}
              />
              <span className="truncate">
                {!isBoardLocked
                  ? 'Setup Phase: Tap boxes to place numbers'
                  : statusBannerText}
              </span>
            </motion.div>
          </div>

          {/* B-I-N-G-O Header Badges */}
          <div className="grid grid-cols-5 gap-2 w-full max-w-[380px] mx-auto place-items-center mb-5">
            {BINGO_LETTERS.map((letter, index) => {
              const isActive = completedLinesCount > index;
              return (
                <motion.div
                  key={letter}
                  animate={isActive ? { scale: [1, 1.15, 1.06] } : { scale: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`bingo-badge w-full max-w-[46px] ${isActive ? 'active' : 'inactive'}`}
                >
                  {letter}
                </motion.div>
              );
            })}
          </div>

          {/* 5x5 Tactile Grid with Spring Flying Tiles Physics */}
          <LayoutGroup id="bingo-setup-group">
            <div className="relative w-full max-w-[380px] mx-auto mt-4 mb-auto">
              <motion.div animate={shakeControls} className="w-full">
                <div
                  ref={gridContainerRef}
                  className="bingo-grid w-full"
                  style={{ perspective: 1000 }}
                >
                  {board.map((number, index) => {
                    const isEmpty = number === null;
                    const isCalled = !isEmpty && calledNumbers.includes(number);
                    const isWinning = !isEmpty && winningTileIndices.has(index);
                    const isLast = !isEmpty && lastCalled === number;
                    const isNewlyCompleted = dominoTiles[index] !== undefined;
                    const positionInLine = dominoTiles[index] ?? 0;
                    const isTension = tensionTileIndices.has(index);

                    return (
                      <motion.button
                        key={index}
                        layout
                        layoutId={number !== null ? `tile-${number}` : undefined}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        animate={
                          isNewlyCompleted
                            ? {
                                scale: [1, 1.15, 0.96, 1],
                                rotateX: [0, -18, 8, 0],
                                y: [0, -6, 2, 0],
                                transition: {
                                  duration: 0.55,
                                  delay: positionInLine * 0.08,
                                  ease: 'easeOut'
                                }
                              }
                            : isTension
                            ? {
                                scale: [1, 1.05, 1],
                                boxShadow: [
                                  '0px 0px 0px rgba(251,191,36,0)',
                                  '0px 0px 20px rgba(251,191,36,0.6)',
                                  '0px 0px 0px rgba(251,191,36,0)'
                                ],
                                transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                              }
                            : {}
                        }
                        whileTap={
                          screen === 'playing' && !(isBoardLocked && isCalled)
                            ? { scale: 0.92, rotateX: 5, rotateY: -5, translateZ: -10 }
                            : undefined
                        }
                        disabled={screen !== 'playing' || (isBoardLocked && isCalled)}
                        onClick={() => handleTileClick(index)}
                        className={`bingo-tile font-display ${
                          isEmpty
                            ? 'empty'
                            : isWinning
                            ? 'winning'
                            : isCalled
                            ? 'called'
                            : isTension
                            ? 'uncalled ring-1 ring-amber-400/50'
                            : 'uncalled'
                        }`}
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        {/* Themed Dauber Stamp (Physical Pressed Heart Glass) */}
                        {isCalled && (
                          <motion.div
                            initial={{ scale: 3, opacity: 0, rotate: -15 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="w-8 h-8 sm:w-10 sm:h-10 text-rose-400/40 fill-current drop-shadow-[0_0_10px_rgba(244,63,94,0.75)]"
                            >
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                          </motion.div>
                        )}

                        {/* Last Called Pulse Ring */}
                        {isLast && <div className="last-called-ring" />}
                        <span className="relative z-10 font-display">{isEmpty ? '' : number}</span>
                      </motion.button>
                    );
                  })}

                {/* Meteor Ray Sweep Overlay (Magic UI) */}
                <AnimatePresence>
                  {activeMeteors.map((meteor) => (
                    <MeteorRay
                      key={meteor.id}
                      lineId={meteor.lineId}
                      onComplete={() => {
                        setActiveMeteors((prev) => prev.filter((m) => m.id !== meteor.id));
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* In-Game Floating Reactions Emote Bar (Multiplayer Only) */}
          {isBoardLocked && role !== 'solo' && (
            <div className="flex items-center justify-center gap-2 py-0.5">
              <span className="text-xs font-bold text-rose-300 opacity-80">Send Love:</span>
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel shadow-md">
                {EMOTE_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendEmote(emoji)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-base hover:scale-125 active:scale-95 transition"
                    title={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Setup Control Panel / In-game Call Status */}
          {!isBoardLocked ? (
            <div className="w-full max-w-sm mx-auto p-3.5 rounded-2xl glass-card shadow-xl space-y-2.5 my-1 border-rose-500/30">
              {/* Header Status Row */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-200">Board Setup</span>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    {placedCount}/25
                  </span>
                </div>

                {nextSequentialNumber !== null ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-rose-500/20 text-rose-300 border-rose-500/40">
                    <span>Next on tap:</span>
                    <motion.span
                      layoutId={`tile-${nextSequentialNumber}`}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="font-mono text-sm underline font-black"
                    >
                      #{nextSequentialNumber}
                    </motion.span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                    <Check size={14} />
                    <span>Board Complete!</span>
                  </div>
                )}
              </div>

              {/* Action Helper Buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleFillRandom}
                  className="py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border shadow bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-500/40"
                  title="Fill remaining or all slots randomly"
                >
                  <Shuffle size={14} className="text-rose-400" />
                  <span>Random 🎲</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleClearBoard}
                  className="py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border shadow bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
                  title="Clear all numbers"
                >
                  <RotateCcw size={14} className="text-slate-400" />
                  <span>Clear ↺</span>
                </motion.button>
              </div>

              {/* Hint or Lock CTA */}
              {isBoardFull ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleLockBoard}
                  className="w-full py-3.5 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 border transition bg-gradient-to-r from-rose-500 via-rose-600 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white border-amber-300/40 shadow-rose-900/50 animate-pulse"
                >
                  <Lock size={16} />
                  <span>Lock Board & Ready! 🎯</span>
                </motion.button>
              ) : (
                <p className="text-xs text-center text-slate-300 leading-snug">
                  👉 <strong>Tap any box</strong> to place <strong>#{nextSequentialNumber}</strong> in sequence. Tap a placed number to remove. Or tap <strong>Random 🎲</strong>!
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[36px] my-1">
              {calledNumbers.length === 0 ? (
                <div className="flex items-center gap-2 py-1 px-4 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold shadow-md">
                  <Lock size={13} className="text-rose-400" />
                  <span>
                    Board Locked!{' '}
                    {isLocalTurn ? 'Your turn to call a number!' : `Waiting for ${opponentName}...`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-6 h-20 text-xs sm:text-sm font-semibold text-slate-400">
                  <span className="flex items-center gap-1.5">
                    Calls: <strong className="text-white font-mono text-sm">{calledNumbers.length}</strong>/25
                  </span>
                  {lastCalled && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Last Call:</span>
                      <HeroOrb key={lastCalled} number={lastCalled} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </LayoutGroup>

          {/* Bottom-Anchored Line Completion Alert Banner (Floats just above Hero Orb) */}
          <AnimatePresence>
            {lineAlert && (
              <motion.div
                key="bottom-line-alert"
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center pointer-events-none w-max max-w-[92%]"
              >
                <div
                  className={`bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl rounded-full px-6 py-2 flex items-center gap-2.5 sm:gap-3 text-white pointer-events-auto ${
                    lineAlert.count >= 4
                      ? 'border-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                      : 'border-rose-400/40 shadow-[0_0_18px_rgba(244,63,94,0.3)]'
                  }`}
                >
                  <span className="text-base shrink-0">
                    {lineAlert.count >= 4 ? '🔥' : '💕'}
                  </span>
                  <div className="text-xs sm:text-sm font-bold truncate max-w-[190px] sm:max-w-[240px]">
                    {lineAlert.title.replace(/\s*\(Opponent: \d+\/5\)/, '')}
                  </div>
                  <div className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 border ml-1 bg-rose-900/70 text-amber-200 border-amber-400/50">
                    {lineAlert.count}/5 lines
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.88, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 15 }}
              className="glass-card w-full max-w-sm p-5 text-center space-y-4 shadow-2xl border-rose-500/40"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-white shadow-xl bg-gradient-to-tr from-rose-500 to-rose-700 shadow-rose-500/40">
                <Heart size={36} className="fill-white" />
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                  Round {roundWinnerInfo.roundNum} Winner
                </span>
                <SplitText
                  text={`${roundWinnerInfo.name} Secured the Round!`}
                  className="text-xl sm:text-2xl font-black text-white tracking-tight"
                />
                <p className="text-sm text-slate-300">{roundWinnerInfo.reason}</p>
              </div>

              {/* Updated Scorecard */}
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/60 flex items-center justify-around">
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-400 block">{playerName}</span>
                  <span className="text-xl font-black text-white font-display">
                    {roundWinnerInfo.localScore}
                  </span>
                </div>
                <div className="text-xs font-bold text-amber-400">
                  First to {targetWins}
                </div>
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-400 block">{opponentName}</span>
                  <span className="text-xl font-black text-white font-display">
                    {roundWinnerInfo.opponentScore}
                  </span>
                </div>
              </div>

              {/* Next Round CTA */}
              {role === 'guest' ? (
                <div className="w-full py-3.5 px-4 rounded-2xl text-slate-300 font-bold text-sm bg-slate-800/80 border border-slate-700/60 flex items-center justify-center gap-2 cursor-not-allowed">
                  <RefreshCw size={16} className="animate-spin text-slate-400" />
                  <span>Waiting for Yugi to start next round...</span>
                </div>
              ) : (
                <RippleButton
                  onClick={handleProceedToNextRound}
                  className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 shadow-rose-500/30 border-rose-400/30"
                >
                  <RefreshCw size={18} />
                  <span>Start Round {roundWinnerInfo.roundNum + 1}</span>
                </RippleButton>
              )}
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className="glass-card w-full max-w-sm p-6 text-center space-y-4 shadow-2xl shadow-rose-950/60 border-rose-500/40"
            >
              {/* Grand Trophy Icon */}
              <div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center shadow-xl bg-gradient-to-tr from-rose-500 via-rose-600 to-amber-500 text-white shadow-rose-500/40">
                <Trophy size={42} strokeWidth={2.3} />
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400" />
                  <span>SERIES CHAMPION</span>
                  <Sparkles size={13} className="text-amber-400" />
                </span>
                <SplitText
                  text={`${seriesWinnerInfo.name} WINS THE SERIES!`}
                  className="text-2xl sm:text-3xl font-black text-white tracking-tight"
                />
                <p className="text-sm text-slate-300">{seriesWinnerInfo.reason}</p>
              </div>

              {/* Final Series Scoreboard */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs space-y-1">
                <div className="text-xs uppercase font-bold text-slate-400">
                  Final Series Score (Best of {seriesLength})
                </div>
                <div className="text-3xl font-black text-amber-400 font-mono">
                  {seriesWinnerInfo.finalScore}
                </div>
              </div>

              {/* Official Love Ledger Contract Awarded */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/70 via-rose-950/70 to-amber-950/70 border border-amber-400/50 text-center space-y-1 shadow-lg">
                <div className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center justify-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400" />
                  <span>Official Love Ledger Contract Sealed</span>
                  <Sparkles size={13} className="text-amber-400" />
                </div>
                <div className="text-sm font-bold text-white">
                  {seriesWinnerInfo.name} wins:{' '}
                  <span className="shimmer-text font-black">
                    {seriesWinnerInfo.wager || activeWager}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowPolaroidModal(true)}
                    className="py-2.5 px-2 rounded-xl glass-button text-xs font-bold text-rose-300 border-rose-400/40 flex items-center justify-center gap-1.5 hover:bg-rose-950/40 shadow-md"
                  >
                    <Camera size={15} />
                    <span>Polaroid 📸</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveStatsTab('ledger');
                      setShowStatsModal(true);
                    }}
                    className="py-2.5 px-2 rounded-xl glass-button text-xs font-bold text-amber-300 border-amber-400/40 flex items-center justify-center gap-1.5 hover:bg-amber-950/40 shadow-md"
                  >
                    <ScrollText size={15} />
                    <span>Love Ledger 📜</span>
                  </button>
                </div>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSeriesRematch}
                  disabled={rematchStatus === 'requested'}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 shadow-rose-500/25 border-rose-400/30"
                >
                  <RefreshCw size={18} />
                  <span>
                    {rematchStatus === 'requested'
                      ? 'Waiting for Partner...'
                      : rematchStatus === 'received'
                      ? 'Accept Rematch!'
                      : 'Play Another Series, Honey? 💕'}
                  </span>
                </motion.button>

                <button
                  onClick={handleLeaveToLobby}
                  className="w-full py-2.5 rounded-2xl glass-button text-sm font-semibold text-slate-300 hover:text-white"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="glass-card w-full max-w-sm p-4 sm:p-5 space-y-3.5 shadow-2xl max-h-[88vh] flex flex-col border-rose-500/40"
            >
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {activeStatsTab === 'ledger' ? (
                    <ScrollText size={22} className="text-rose-400" />
                  ) : (
                    <Flame size={22} className="text-amber-400" />
                  )}
                  <h3 className="text-lg font-black text-white">
                    {activeStatsTab === 'ledger'
                      ? 'The Love Ledger 📜'
                      : 'Yugi vs Renia Rivalry 💕'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowStatsModal(false)}
                  className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg glass-button font-semibold"
                >
                  Close
                </button>
              </div>

              {/* Tabs for Stats vs Love Ledger */}
              <div className="flex rounded-xl bg-slate-900/80 p-1 border border-rose-500/30 shrink-0">
                <button
                  onClick={() => setActiveStatsTab('stats')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    activeStatsTab === 'stats'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Flame size={14} />
                  <span>Rivalry Stats</span>
                </button>
                <button
                  onClick={() => setActiveStatsTab('ledger')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    activeStatsTab === 'ledger'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ScrollText size={14} />
                  <span>Love Ledger</span>
                  {pendingDebtsCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center ml-0.5">
                      {pendingDebtsCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab 1: Rivalry Stats Content */}
              {activeStatsTab === 'stats' ? (
                <div className="space-y-3 overflow-y-auto pr-0.5">
                  {/* Lifetime Series Record */}
                  <GlareCard className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-2">
                    <span className="text-xs uppercase font-bold text-slate-400 block">
                      Series Record
                    </span>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-white text-sm">
                        Yugi 🥂
                      </span>
                      <span className="text-lg font-black text-amber-400 font-display">
                        {stats.yugiSeriesWon || 0} - {stats.reniaSeriesWon || stats.raniaSeriesWon || 0}
                      </span>
                      <span className="font-bold text-slate-300 text-sm">
                        Renia 🌹
                      </span>
                    </div>
                  </GlareCard>

                  {/* Total Rounds Record */}
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60">
                      <span className="text-xs uppercase font-bold text-slate-400 block">
                        Yugi Rounds
                      </span>
                      <span className="text-lg font-extrabold text-white font-display">
                        {stats.yugiRoundsWon || 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60">
                      <span className="text-xs uppercase font-bold text-slate-400 block">
                        Renia Rounds
                      </span>
                      <span className="text-lg font-extrabold text-rose-300 font-display">
                        {stats.reniaRoundsWon || stats.raniaRoundsWon || 0}
                      </span>
                    </div>
                  </div>

                  {/* Current Streak */}
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-xs uppercase font-bold text-slate-400 block">
                        Current Streak
                      </span>
                      <span className="text-sm font-extrabold text-amber-400 flex items-center gap-1.5 mt-0.5">
                        <Flame size={15} className="text-amber-400" />
                        <span>
                          {stats.streakHolder !== 'None'
                            ? `${stats.streakHolder} (${stats.currentStreak} in a row)`
                            : 'No active streak'}
                        </span>
                      </span>
                    </div>

                    <button
                      onClick={handleResetStats}
                      className="px-3 py-1.5 rounded-lg glass-button text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"
                    >
                      <RotateCcw size={13} />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Tab 2: Love Ledger Content */
                <div className="space-y-3 overflow-y-auto pr-0.5 flex-1">
                  {/* Debts Summary Card */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/70 via-rose-900/40 to-amber-950/40 border border-rose-500/40 flex items-center justify-around text-center">
                    <div>
                      <span className="text-xs font-bold text-slate-300 block">Yugi Owes</span>
                      <span className="text-lg font-black text-amber-400 font-mono">
                        {yugiOwesCount} {yugiOwesCount === 1 ? 'Debt' : 'Debts'}
                      </span>
                    </div>
                    <div className="w-[1px] h-8 bg-rose-500/30" />
                    <div>
                      <span className="text-xs font-bold text-slate-300 block">Renia Owes</span>
                      <span className="text-lg font-black text-rose-300 font-mono">
                        {reniaOwesCount} {reniaOwesCount === 1 ? 'Debt' : 'Debts'}
                      </span>
                    </div>
                  </div>

                  {/* Wager History List */}
                  {wagerHistory.length === 0 ? (
                    <div className="p-6 text-center space-y-2 rounded-2xl bg-slate-900/40 border border-slate-800">
                      <Heart size={32} className="mx-auto text-rose-400/60" />
                      <p className="text-sm font-semibold text-slate-200">No debts recorded yet!</p>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Play a series to crown a champion and log what the loser has to do 💕
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                      {wagerHistory.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-2xl border transition-all ${
                            item.status === 'pending'
                              ? 'bg-rose-950/40 border-rose-500/40 shadow-sm'
                              : 'bg-slate-900/50 border-slate-700/40 opacity-75'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                            <span className="font-semibold text-slate-300">{item.date}</span>
                            <span className="font-mono font-bold text-amber-400">
                              🏆 {item.winnerName} won ({item.finalScore})
                            </span>
                          </div>

                          <div className="my-1.5 flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-extrabold uppercase tracking-wider text-rose-300 block">
                                {item.loserName}’s Penalty:
                              </span>
                              <span
                                className={`text-sm font-bold leading-snug block ${
                                  item.status === 'fulfilled'
                                    ? 'line-through text-slate-400'
                                    : 'shimmer-text font-black'
                                }`}
                              >
                                {item.wager}
                              </span>
                            </div>

                            <button
                              onClick={() => handleToggleWagerStatus(item.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition flex items-center gap-1 border ${
                                item.status === 'pending'
                                  ? 'bg-rose-500/25 text-rose-200 border-rose-400/40 hover:bg-rose-500 hover:text-white'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              }`}
                            >
                              {item.status === 'pending' ? (
                                <>
                                  <span>⏳ Owed</span>
                                </>
                              ) : (
                                <>
                                  <Check size={13} className="stroke-[3]" />
                                  <span>Fulfilled ❤️</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {wagerHistory.length > 0 && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleClearWagerHistory}
                        className="text-[10px] text-slate-400 hover:text-rose-400 transition flex items-center gap-1"
                      >
                        <RotateCcw size={10} />
                        <span>Clear History</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* MODAL 4: DATE NIGHT POLAROID MEMORY CARD */}
      {/* ================================================================ */}
      <AnimatePresence>
        {showPolaroidModal && seriesWinnerInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className="w-full max-w-xs bg-[#FAF7F2] text-slate-900 p-4 pt-5 pb-6 rounded-2xl shadow-2xl space-y-3.5 border-4 border-white/80"
            >
              {/* Polaroid Photo Frame */}
              <div className="w-full aspect-[4/3] rounded-xl bg-gradient-to-tr from-rose-950 via-rose-900 to-amber-950 p-4 flex flex-col justify-between items-center text-center relative overflow-hidden border border-rose-500/40 shadow-inner">
                <div className="w-full flex items-center justify-between text-[10px] font-bold text-rose-300/80 uppercase tracking-widest">
                  <span>Yugi & Renia</span>
                  <span>Date Night</span>
                </div>

                <div className="my-auto space-y-1">
                  <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 flex items-center justify-center text-white shadow-lg">
                    <Trophy size={24} />
                  </div>
                  <SplitText
                    as="div"
                    text={`${seriesWinnerInfo.name} Won! 👑`}
                    className="text-base font-black text-white tracking-tight"
                  />
                  <div className="text-[11px] text-amber-300 font-bold font-display">
                    Series Score: {seriesWinnerInfo.finalScore}
                  </div>
                </div>

                <div className="w-full text-[9px] text-rose-200/90 font-medium">
                  {new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>

              {/* Polaroid Note Content */}
              <div className="text-center space-y-1 pt-1">
                <div className="text-xs font-extrabold text-slate-800 flex items-center justify-center gap-1">
                  <span>Prize:</span>
                  <span className="shimmer-text font-black text-sm">
                    {seriesWinnerInfo.wager || activeWager}
                  </span>
                </div>
                <p className="text-[11px] italic text-slate-600">
                  "Destined minds • Sealed with love 💕"
                </p>
              </div>

              {/* Share / Close Buttons */}
              <div className="space-y-2 pt-1">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSharePolaroidMemory}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md"
                >
                  <Share2 size={14} />
                  <span>Share / Copy Memory</span>
                </motion.button>

                <button
                  onClick={() => setShowPolaroidModal(false)}
                  className="w-full py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
