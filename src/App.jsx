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
  Swords,
  Bell,
  Camera,
  Smile,
  Send,
  Download,
  Lock,
  ScrollText,
  Gift
} from 'lucide-react';
import { generateBoard, evaluateBoard, getBestBotMove, LINE_NAMES } from './utils/bingoEngine';
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

const DEFAULT_STATS = {
  totalSeriesPlayed: 0,
  localSeriesWon: 0,
  opponentSeriesWon: 0,
  totalRoundsPlayed: 0,
  localRoundsWon: 0,
  opponentRoundsWon: 0,
  yugiSeriesWon: 0,
  reniaSeriesWon: 0,
  yugiRoundsWon: 0,
  reniaRoundsWon: 0,
  currentStreak: 0,
  streakHolder: 'None'
};

export default function App() {
  // Navigation / Game State Machine: 'lobby' | 'waiting' | 'playing' | 'round_over' | 'series_over'
  const [screen, setScreen] = useState('lobby');

  // Exclusive "Date Night" Mode (Yugi & Renia)
  const [isDateNight, setIsDateNight] = useState(() => {
    return localStorage.getItem('bingo_date_night') === 'true';
  });

  // Date Night Wager / Stakes Selection (Freeform text)
  const [customWager, setCustomWager] = useState(() => {
    const saved = localStorage.getItem('bingo_date_night_wager');
    if (!saved || saved === '15-Min Massage 💆') return '';
    return saved;
  });
  const activeWager = customWager.trim() || 'Sweet Reward 💕';

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

  // Player identity
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('bingo_player_name') || 'Yugi';
  });
  const [opponentName, setOpponentName] = useState(() => {
    return isDateNight ? (playerName === 'Renia' ? 'Yugi' : 'Renia') : 'Opponent';
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

  // Game Board & Logic State (Pre-game manual on-tap sequential fill by default)
  const [board, setBoard] = useState(() => Array(25).fill(null));
  const [botBoard, setBotBoard] = useState(() => generateBoard());
  const [setupMode, setSetupMode] = useState('manual'); // 'manual' | 'auto'
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

  // WebRTC & Line History Refs
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const prevCompletedLinesRef = useRef(0);
  const prevCompletedLineIdsRef = useRef([]);
  const prevOpponentLinesCountRef = useRef(0);
  const prevBotCompletedLineIdsRef = useRef([]);

  // Stale-closure prevention refs for WebRTC listeners and timers
  const boardRef = useRef(board);
  const botBoardRef = useRef(botBoard);
  const isBoardLockedRef = useRef(isBoardLocked);
  const calledNumbersRef = useRef(calledNumbers);
  const playerNameRef = useRef(playerName);
  const opponentNameRef = useRef(opponentName);
  const isDateNightRef = useRef(isDateNight);
  const localScoreRef = useRef(localScore);
  const opponentScoreRef = useRef(opponentScore);
  const seriesLengthRef = useRef(seriesLength);
  const activeWagerRef = useRef(activeWager);
  const currentRoundRef = useRef(currentRound);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { botBoardRef.current = botBoard; }, [botBoard]);
  useEffect(() => { isBoardLockedRef.current = isBoardLocked; }, [isBoardLocked]);
  useEffect(() => { calledNumbersRef.current = calledNumbers; }, [calledNumbers]);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { opponentNameRef.current = opponentName; }, [opponentName]);
  useEffect(() => { isDateNightRef.current = isDateNight; }, [isDateNight]);
  useEffect(() => { localScoreRef.current = localScore; }, [localScore]);
  useEffect(() => { opponentScoreRef.current = opponentScore; }, [opponentScore]);
  useEffect(() => { seriesLengthRef.current = seriesLength; }, [seriesLength]);
  useEffect(() => { activeWagerRef.current = activeWager; }, [activeWager]);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

  // Evaluation of current board
  const { completedLinesCount, winningTileIndices, completedLineIds, completedLineNames } = evaluateBoard(board, calledNumbers);
  const targetWins = getTargetWins(seriesLength);

  // Pre-Game Setup Derived State
  const unplacedNumbers = Array.from({ length: 25 }, (_, i) => i + 1).filter(
    (n) => !board.includes(n)
  );
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
  const reniaOwesCount = pendingDebts.filter((item) => item.loserName === 'Renia').length;

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
      setOpponentName(playerName === 'Renia' ? 'Yugi' : 'Renia');
      playRomanticChime();
      showToast('Date Night Mode Activated! ❤️');
    } else {
      showToast('Classic Mode Activated');
    }
  };

  // Quick switch between Yugi & Renia
  const handleSelectPersona = (persona) => {
    handleNameChange(persona);
    const nextOpponent = persona === 'Yugi' ? 'Renia' : 'Yugi';
    setOpponentName(nextOpponent);
    playRomanticChime();
    triggerHaptic([20]);
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
      if (lineAlertTimeoutRef.current) clearTimeout(lineAlertTimeoutRef.current);
    };
  }, []);

  // Track completed lines to play chime & trigger prominent banner
  useEffect(() => {
    if (completedLinesCount > prevCompletedLinesRef.current && screen === 'playing') {
      triggerHaptic([30, 45, 30]);
      if (isDateNight) {
        playRomanticChime();
      } else {
        playLineCompleteSound();
      }

      // Identify newly completed line(s)
      const newlyCompletedIds = (completedLineIds || []).filter(
        (id) => !prevCompletedLineIdsRef.current.includes(id)
      );
      const lineNamesStr =
        newlyCompletedIds.map((id) => LINE_NAMES[id]).join(' & ') || 'a line';

      const title =
        completedLinesCount >= 5
          ? isDateNight
            ? '🏆 BINGO! YOU CLAIMED 5 LINES! ❤️'
            : '🏆 BINGO! YOU COMPLETED 5 LINES!'
          : completedLinesCount === 4
          ? `🚨 4 LINES DOWN! Claimed ${lineNamesStr}!`
          : isDateNight
          ? `❤️ You claimed ${lineNamesStr}! (${completedLinesCount}/5)`
          : `✨ You completed ${lineNamesStr}! (${completedLinesCount}/5)`;

      const subtitle =
        completedLinesCount >= 5
          ? 'Victory is sealed! 🥂'
          : completedLinesCount === 4
          ? 'Hold your breath! 1 more line to BINGO! 💓'
          : isDateNight
          ? 'One step closer to victory, my love. 💕'
          : `You have completed ${completedLinesCount} of 5 lines.`;

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
  }, [completedLinesCount, completedLineIds, screen, isDateNight, playerName, triggerLineAlert]);

  // Confetti celebrations
  const fireVictoryConfetti = useCallback(() => {
    triggerHaptic([50, 70, 50, 70, 120]);
    if (isDateNight) {
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
    } else {
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
      const curIsDateNight = isDateNightRef.current;
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
        (winnerRole === 'local' && curPlayerName === 'Renia') ||
        (winnerRole === 'opponent' && curOpponentName.includes('Renia'));

      // Update rounds in persistent stats
      setStats((prev) => {
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
          reniaRoundsWon: winnerIsRenia
            ? (prev.reniaRoundsWon || 0) + 1
            : prev.reniaRoundsWon || 0
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
          reason: curIsDateNight
            ? romanticSeriesReason
            : `${seriesWinnerName} won the Best of ${curSeriesLength} Series!`
        });

        // Determine if Yugi or Renia clinched the series for named stats
        const seriesWinnerIsYugi = seriesWinnerName.includes('Yugi');
        const seriesWinnerIsRenia = seriesWinnerName.includes('Renia');
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
            reniaSeriesWon: seriesWinnerIsRenia
              ? (prev.reniaSeriesWon || 0) + 1
              : prev.reniaSeriesWon || 0,
            currentStreak: newStreak,
            streakHolder: winnerLabel
          };
          try {
            localStorage.setItem('bingo_h2h_stats_v2', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });

        // Log to Date Night Wager History ("Love Ledger")
        let loserLabel = 'Opponent';
        if (curIsDateNight) {
          loserLabel = winnerLabel === 'Yugi' ? 'Renia' : 'Yugi';
        } else {
          loserLabel = seriesWinner === 'local' ? curOpponentName : curPlayerName;
        }

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
          wager: curActiveWager || 'Sweet Reward 💕',
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

        let roundReason = `${winnerDisplay} completed 5 lines!`;
        if (curIsDateNight) {
          if (winnerRole === 'tie') {
            roundReason = tieReasons[curCurrentRound % tieReasons.length];
          } else {
            roundReason = roundWinQuotes[curCurrentRound % roundWinQuotes.length];
          }
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
      localScore,
      opponentScore,
      targetWins,
      currentRound,
      playerName,
      opponentName,
      isDateNight,
      seriesLength,
      activeWager,
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
          // Do NOT overwrite host's room wager with guest's default!
          conn.send({
            type: 'HELLO_ACK',
            name: playerNameRef.current,
            turn: 'host',
            seriesLength: seriesLengthRef.current,
            isDateNight: isDateNightRef.current,
            wager: activeWagerRef.current
          });
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
            `${data.name || 'Friend'} joined! Best of ${seriesLengthRef.current} for ${activeWagerRef.current}`
          );
          break;
        }

        case 'HELLO_ACK': {
          setOpponentName(data.name || 'Opponent');
          if (data.seriesLength) setSeriesLength(data.seriesLength);
          if (typeof data.isDateNight === 'boolean') setIsDateNight(data.isDateNight);
          if (data.wager) setCustomWager(data.wager);
          setScreen('playing');
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
          showToast(`Connected with ${data.name || 'Friend'}! 💕`);
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
            if (isDateNightRef.current) {
              playRomanticChime();
            } else {
              playLineCompleteSound();
            }

            const sender = data.senderName || opponentNameRef.current;
            const lineClaimedText = data.lineName ? ` ${data.lineName}` : ' a line';
            const title =
              newCount >= 5
                ? `🏆 BINGO! ${sender.toUpperCase()} WON THE ROUND!`
                : newCount === 4
                ? `🚨 ${sender} HAS 4 LINES!`
                : `${isDateNightRef.current ? '💕' : '✨'} ${sender} claimed${lineClaimedText}! (Opponent: ${newCount}/5)`;

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
              if (isDateNightRef.current) {
                playRomanticChime();
              } else {
                playLineCompleteSound();
              }
              const sender = data.senderName || opponentNameRef.current;
              const lineClaimedText = data.lineName ? ` ${data.lineName}` : ' a line';
              const title =
                data.linesCount === 4
                  ? `🚨 ${sender} HAS 4 LINES!`
                  : `${isDateNightRef.current ? '💕' : '✨'} ${sender} claimed${lineClaimedText}! (Opponent: ${data.linesCount}/5)`;
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
          isDateNight,
          wager: activeWager
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

    const soloOpponentName = isDateNight
      ? playerName === 'Renia'
        ? 'Yugi (AI 🥂)'
        : 'Renia (AI 💕)'
      : 'Smart Bot (AI)';

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
          title: isDateNight
            ? 'Date Night Bingo with Yugi & Renia ❤️'
            : 'Play 1-25 Bingo!',
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => showToast('Invite Link Copied!'),
      () => showToast('Failed to copy link')
    );
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
    if (calledNumbers.length > 0 || isBoardLocked) return;
    playShuffleSound();
    triggerHaptic([15, 25]);
    const unplaced = Array.from({ length: 25 }, (_, i) => i + 1).filter((n) => !board.includes(n));
    if (unplaced.length === 0) {
      // If already full, reshuffle all 25 numbers
      const fresh = generateBoard();
      setBoard(fresh);
      boardRef.current = fresh;
      showToast('Board reshuffled with random numbers! 🎲');
      return;
    }
    // Shuffle unplaced numbers using Fisher-Yates
    const shuffledUnplaced = [...unplaced];
    for (let i = shuffledUnplaced.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledUnplaced[i], shuffledUnplaced[j]] = [shuffledUnplaced[j], shuffledUnplaced[i]];
    }
    const newBoard = [...board];
    let fillIdx = 0;
    for (let i = 0; i < 25; i++) {
      if (newBoard[i] === null && fillIdx < shuffledUnplaced.length) {
        newBoard[i] = shuffledUnplaced[fillIdx++];
      }
    }
    setBoard(newBoard);
    boardRef.current = newBoard;
    showToast('Filled empty slots randomly! 🎲');
  };

  // Fill Board Sequentially (1 to 25 in order)
  const handleFillSequential = () => {
    if (calledNumbers.length > 0 || isBoardLocked) return;
    playTapSound();
    triggerHaptic([15]);
    const seq = Array.from({ length: 25 }, (_, i) => i + 1);
    setBoard(seq);
    boardRef.current = seq;
    showToast('Board filled 1 to 25! 🔢');
  };

  // Clear Board in Setup Mode
  const handleClearBoard = () => {
    if (calledNumbers.length > 0 || isBoardLocked) return;
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
    if (isDateNight) {
      playRomanticChime();
    } else {
      playLineCompleteSound();
    }
    triggerHaptic([20, 40]);
    setIsBoardLocked(true);
    isBoardLockedRef.current = true;
    showToast('Board locked & ready! Game on! 🎯');
  };

  // Human Player taps a number tile
  const handleTileClick = (number, index) => {
    if (screen !== 'playing') return;

    // Guardrail: if board is not locked yet, handle on-tap sequential fill or remove
    if (!isBoardLocked) {
      if (number === null) {
        // Tapped empty box: place next sequential number into this box
        if (nextSequentialNumber !== null) {
          playTapSound();
          triggerHaptic([12]);
          const newBoard = [...board];
          newBoard[index] = nextSequentialNumber;
          setBoard(newBoard);
          boardRef.current = newBoard;
        }
      } else {
        // Tapped placed number: remove it and return it to unplaced pool
        playTapSound();
        triggerHaptic([10]);
        const newBoard = [...board];
        newBoard[index] = null;
        setBoard(newBoard);
        boardRef.current = newBoard;
        showToast(`Removed #${number}`);
      }
      return;
    }

    if (number === null) return;

    // Check turn
    const isMyTurn = role === 'solo' ? turn === 'player' : turn === role;
    if (!isMyTurn) {
      showToast(
        isDateNight
          ? playerName === 'Yugi'
            ? "Waiting for your darling Renia's move! 💕"
            : "Waiting for your handsome Yugi's move! 🥂"
          : "Wait for opponent's turn!"
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

      const botDisplayName = isDateNight
        ? playerName === 'Renia'
          ? 'Yugi (AI 🥂)'
          : 'Renia (AI 💕)'
        : 'Smart Bot (AI)';

      const playerGainedLine = localEval.completedLinesCount > prevCompletedLinesRef.current;
      const botGainedLine =
        botEval.completedLinesCount > prevOpponentLinesCountRef.current &&
        botEval.completedLinesCount < 5;

      if (playerGainedLine && botGainedLine) {
        triggerHaptic([35, 50, 35]);
        if (isDateNight) playRomanticChime(); else playLineCompleteSound();
        triggerLineAlert({
          title: `⚡ DOUBLE LINE! You claimed ${localLineName} & ${botDisplayName} claimed ${botLineName}!`,
          subtitle: `Both boards progressed! You: ${localEval.completedLinesCount}/5 • Opponent: ${botEval.completedLinesCount}/5`,
          isOpponent: false,
          count: localEval.completedLinesCount,
          isDouble: true
        });
      } else if (botGainedLine) {
        triggerHaptic([35, 50]);
        if (isDateNight) playRomanticChime(); else playLineCompleteSound();
        triggerLineAlert({
          title:
            botEval.completedLinesCount === 4
              ? `🚨 ${botDisplayName} HAS 4 LINES!`
              : `${isDateNight ? '💕' : '✨'} ${botDisplayName} claimed ${botLineName}! (Opponent: ${botEval.completedLinesCount}/5)`,
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

  // Bot Turn Automation in Solo Mode (natural 650ms delay)
  useEffect(() => {
    if (role !== 'solo' || screen !== 'playing' || turn !== 'bot') return;

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

      const botDisplayName = isDateNightRef.current
        ? playerNameRef.current === 'Renia'
          ? 'Yugi (AI 🥂)'
          : 'Renia (AI 💕)'
        : 'Smart Bot (AI)';

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
        if (isDateNightRef.current) playRomanticChime(); else playLineCompleteSound();
        triggerLineAlert({
          title: `⚡ DOUBLE LINE! You claimed ${playerLineName} & ${botDisplayName} claimed ${botLineName}!`,
          subtitle: `Both boards progressed! You: ${playerEval.completedLinesCount}/5 • Opponent: ${botEval.completedLinesCount}/5`,
          isOpponent: false,
          count: playerEval.completedLinesCount,
          isDouble: true
        });
      } else if (botGainedLine) {
        triggerHaptic([35, 50]);
        if (isDateNightRef.current) playRomanticChime(); else playLineCompleteSound();
        triggerLineAlert({
          title:
            botEval.completedLinesCount === 4
              ? `🚨 ${botDisplayName} HAS 4 LINES!`
              : `${isDateNightRef.current ? '💕' : '✨'} ${botDisplayName} claimed ${botLineName}! (Opponent: ${botEval.completedLinesCount}/5)`,
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

  // Status banner text tailored for Yugi and Renia
  const isLocalTurn = role === 'solo' ? turn === 'player' : turn === role;
  let statusBannerText = isLocalTurn ? 'Your Turn' : `${opponentName}'s Turn`;

  if (isDateNight) {
    const isYugi = playerName === 'Yugi';

    const waitingQuotes = isYugi
      ? [
          `Waiting for Renia’s sweet move... 💕`,
          `Take your time, beauty... admiring you. 🌹`,
          `Renia is plotting something dangerously cute... 💭`,
          `No pressure, my queen, but the crown is waiting! 👑`,
          `Listening to Renia’s cute thinking sounds... 🎶`,
          `Contemplating love or your next number, Renia? 🥰`
        ]
      : [
          `Waiting for Yugi’s genius move... ✨`,
          `Take your time, handsome... I'm watching you. 😉`,
          `Yugi is overthinking as usual... 💭`,
          `Show me what you've got, king! 👑`,
          `Watching Yugi cook up his strategy... 🥂`,
          `Contemplating love or your next number, Yugi? 🥰`
        ];

    const turnQuotes = isYugi
      ? [
          'Your turn, handsome! Make it count. ❤️',
          'Show Renia how a master plays! 🥂',
          'The board is yours, king! 👑',
          'Make your lady proud, Yugi! 🌹',
          'Time to show that genius strategy! ✨',
          'Your move, my love! ❤️'
        ]
      : [
          'Your turn, gorgeous! Make it count. ❤️',
          'The board is yours, my queen. 👑',
          'Show Yugi who truly runs this house! 💅',
          'Show me how a master plays, darling. 🥂',
          'Your move, beauty! 🌹',
          'Pick a lucky number for us both! 🍀'
        ];

    if (isLocalTurn) {
      statusBannerText = turnQuotes[calledNumbers.length % turnQuotes.length];
    } else {
      statusBannerText = waitingQuotes[calledNumbers.length % waitingQuotes.length];
    }
  }

  return (
    <div
      className={`relative w-full min-h-screen flex flex-col justify-between overflow-x-hidden text-[#F8FAFC] transition-colors duration-500 ${
        isDateNight ? 'date-night-mode bg-[#12030C]' : 'bg-[#090A0F]'
      }`}
    >
      {/* Background Ambient Glow Orbs */}
      <div className="ambient-glow-wrapper">
        <div className="glow-orb-top-left" />
        <div className="glow-orb-bottom-right" />
      </div>

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
            className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full glass-panel shadow-2xl flex items-center gap-2 border text-xs sm:text-sm font-semibold tracking-wide ${
              isDateNight
                ? 'border-rose-400/30 text-rose-100 bg-rose-950/90 shadow-rose-950/60'
                : 'border-white/20 text-white'
            }`}
          >
            {isDateNight ? (
              <Heart size={15} className="text-rose-400 fill-rose-400 animate-pulse" />
            ) : (
              <Sparkles size={15} className="text-amber-400" />
            )}
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* SCREEN 1: LOBBY */}
      {/* ================================================================ */}
      {screen === 'lobby' && (
        <div className="relative z-10 w-full min-h-[100dvh] flex flex-col justify-between px-4 py-4 max-w-md mx-auto overflow-y-auto space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-lg ${
                  isDateNight
                    ? 'bg-gradient-to-tr from-rose-500 to-rose-700 shadow-rose-500/30'
                    : 'bg-gradient-to-tr from-indigo-500 to-indigo-700 shadow-indigo-500/30'
                }`}
              >
                {isDateNight ? '❤️' : '25'}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  BINGO{' '}
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                      isDateNight
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    {isDateNight ? 'DATE NIGHT' : 'SERIES PRO'}
                  </span>
                </h1>
                <p className="text-xs font-semibold text-slate-400 tracking-wider">
                  {isDateNight ? 'YUGI & RENIA EDITION' : 'ZERO-BACKEND MULTIPLAYER'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isDateNight && (
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
              )}
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

          {/* Date Night Mode Toggle Pill */}
          <div className="my-1">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleToggleDateNight}
              className={`w-full p-3 rounded-2xl flex items-center justify-between transition-all border shadow-lg ${
                isDateNight
                  ? 'bg-gradient-to-r from-rose-950/80 via-rose-900/40 to-amber-950/30 border-rose-500/40 shadow-rose-950/50'
                  : 'glass-card border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3 text-left">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    isDateNight ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Heart size={18} className={isDateNight ? 'fill-white' : ''} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    Date Night Mode (Yugi & Renia)
                    {isDateNight && <span className="text-rose-400 text-xs">✨ Active</span>}
                  </div>
                  <div className="text-xs text-slate-400">
                    Velvet rose surfaces, champagne gold & love banter
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
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-1 p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between"
            >
              <span className="text-xs font-semibold text-rose-300">Choose Player:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectPersona('Yugi')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    playerName === 'Yugi'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white'
                  }`}
                >
                  <span>Yugi</span> 🥂
                </button>
                <button
                  onClick={() => handleSelectPersona('Renia')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    playerName === 'Renia'
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white'
                  }`}
                >
                  <span>Renia</span> 🌹
                </button>
              </div>
            </motion.div>
          )}

          {/* Yugi & Renia Exclusive Lifetime Scoreboard on Main Page */}
          {isDateNight && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-2 p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/70 via-rose-900/50 to-amber-950/40 border border-rose-500/40 shadow-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                  <Heart size={13} className="text-rose-400 fill-rose-400" />
                  <span>Yugi & Renia Lifetime Score</span>
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
                {/* Yugi Side */}
                <div
                  className={`p-2.5 rounded-xl border transition ${
                    playerName === 'Yugi'
                      ? 'bg-rose-950/80 border-rose-400/50 shadow-inner'
                      : 'bg-slate-900/60 border-slate-700/40'
                  }`}
                >
                  <div className="text-sm font-bold text-white flex items-center justify-center gap-1">
                    <span>Yugi</span> 🥂
                  </div>
                  <div className="text-2xl font-black text-amber-400 font-mono leading-none my-1">
                    {stats.yugiSeriesWon || 0}{' '}
                    <span className="text-xs text-slate-400 font-sans font-bold">Series</span>
                  </div>
                  <div className="text-xs text-slate-300 font-medium">
                    {stats.yugiRoundsWon || 0} Rounds Won
                  </div>
                </div>

                {/* Renia Side */}
                <div
                  className={`p-2.5 rounded-xl border transition ${
                    playerName === 'Renia'
                      ? 'bg-rose-950/80 border-rose-400/50 shadow-inner'
                      : 'bg-slate-900/60 border-slate-700/40'
                  }`}
                >
                  <div className="text-sm font-bold text-white flex items-center justify-center gap-1">
                    <span>Renia</span> 🌹
                  </div>
                  <div className="text-2xl font-black text-rose-300 font-mono leading-none my-1">
                    {stats.reniaSeriesWon || 0}{' '}
                    <span className="text-xs text-slate-400 font-sans font-bold">Series</span>
                  </div>
                  <div className="text-xs text-slate-300 font-medium">
                    {stats.reniaRoundsWon || 0} Rounds Won
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Date Night Wager / Stakes Selector */}
          {isDateNight && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-2 p-3.5 rounded-2xl glass-card border border-rose-500/40 space-y-2 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                  <Gift size={13} className="text-amber-400" />
                  <span>Date Night Wager (Loser's Penalty)</span>
                </label>
                <span className="text-xs text-amber-300 font-bold">Prize at stake</span>
              </div>

              <div className="relative flex items-center">
                <input
                  type="text"
                  maxLength={45}
                  value={customWager}
                  onChange={(e) => handleWagerChange(e.target.value)}
                  placeholder="Type wager here... (e.g. 15-min massage, cook dinner, kisses)"
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
              <p className="text-xs text-slate-400">
                Type any penalty or bet — winner takes all! 💕
              </p>
            </motion.div>
          )}

          {/* Name Input & Best-of Selector */}
          <div className="space-y-2.5">
            {/* Player Name Card */}
            <div className="glass-card p-3 space-y-1.5 rounded-2xl">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Your Player Name
              </label>
              <input
                type="text"
                maxLength={15}
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter name"
                className="w-full bg-slate-900/60 border border-slate-700/60 focus:border-rose-500 rounded-xl px-3.5 py-2 text-base font-semibold text-white placeholder-slate-500 outline-none transition"
              />
            </div>

            {/* Best-of Series Selector */}
            <div className="glass-card p-3 space-y-2 rounded-2xl">
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
                          ? isDateNight
                            ? 'bg-rose-500 border-rose-300 text-white font-extrabold shadow-md shadow-rose-500/30'
                            : 'bg-indigo-600 border-indigo-300 text-white font-extrabold shadow-md shadow-indigo-500/30'
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

            {/* Create Room Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateRoom}
              className={`w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border ${
                isDateNight
                  ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/25 border-rose-400/30'
                  : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 shadow-indigo-500/25 border-indigo-400/30'
              }`}
            >
              <Users size={20} />
              <span>Create 2-Player Room (Best of {seriesLength})</span>
            </motion.button>

            {/* Join Room Box */}
            <div
              className={`glass-card p-3 space-y-2 rounded-2xl transition-all ${
                isUrlJoin ? 'ring-2 ring-indigo-500/80 bg-indigo-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  {isUrlJoin ? "Friend's Invite Link Ready" : "Join Friend's Room"}
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
                  onChange={(e) => setInputCode(e.target.value.slice(0, 4))}
                  placeholder="4-digit code"
                  className="w-full bg-slate-900/60 border border-slate-700/60 focus:border-rose-500 rounded-xl px-3 py-2 text-center text-lg font-mono font-bold tracking-widest text-white placeholder-slate-500 outline-none transition"
                />
                <button
                  onClick={() => handleJoinRoom()}
                  disabled={connectionStatus === 'connecting' || inputCode.length !== 4}
                  className="px-5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-sm border border-slate-600/50 transition flex items-center justify-center"
                >
                  {connectionStatus === 'connecting' ? 'Joining...' : 'Join'}
                </button>
              </div>

              {peerError && (
                <p className="text-xs text-rose-400 flex items-center gap-1 pt-0.5">
                  <AlertCircle size={13} />
                  <span>{peerError}</span>
                </p>
              )}
            </div>

            {/* Solo Practice Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handlePlaySolo}
              className="w-full py-3 rounded-2xl glass-button text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-800/80"
            >
              <Bot size={18} className={isDateNight ? 'text-rose-400' : 'text-emerald-400'} />
              <span>
                {isDateNight
                  ? `Solo Practice vs ${playerName === 'Renia' ? 'Yugi AI 🥂' : 'Renia AI 💕'}`
                  : `Play Solo vs Smart Bot (Best of ${seriesLength})`}
              </span>
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
                {isDateNight
                  ? `Yugi: ${stats.yugiSeriesWon || 0}W • Renia: ${stats.reniaSeriesWon || 0}W • Streak: 🔥 ${stats.currentStreak || 0}`
                  : `Lifetime Series: ${stats.localSeriesWon}W - ${stats.opponentSeriesWon}L • Streak: 🔥 ${stats.currentStreak}`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SCREEN 2: WAITING ROOM (HOST) */}
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
            <span
              className={`text-sm font-bold tracking-wider ${
                isDateNight ? 'text-rose-400' : 'text-indigo-400'
              }`}
            >
              BEST OF {seriesLength}
            </span>
          </div>

          {/* Center Card */}
          <div className="my-auto text-center space-y-5">
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                <span>Room Created!</span>
                {isDateNight && <span>❤️</span>}
              </h2>
              <p className="text-sm text-slate-300 max-w-xs mx-auto">
                {isDateNight
                  ? `Playing for: "${activeWager}" 💕 Share this code with your sweetheart!`
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
              <div className="text-xs uppercase font-bold text-slate-400 tracking-widest mb-1.5">
                Room Code
              </div>
              <div
                className={`text-5xl sm:text-6xl font-black tracking-widest font-mono ${
                  isDateNight ? 'text-rose-300' : 'text-indigo-300'
                }`}
              >
                {roomCode}
              </div>
            </div>

            {/* Share / Copy Buttons */}
            <div className="space-y-3 max-w-xs mx-auto">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleShareInvite}
                className={`w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border ${
                  isDateNight
                    ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/20 border-rose-400/30'
                    : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/20 border-emerald-400/30'
                }`}
              >
                <Share2 size={20} />
                <span>Share Invite Link</span>
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

            {/* Pulse Waiting Status */}
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-300 pt-2">
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
                {isDateNight
                  ? 'Waiting for darling to connect...'
                  : 'Waiting for opponent to connect...'}
              </span>
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
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full glass-panel text-xs font-bold border border-white/10">
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
            className={`w-full py-2 px-3.5 rounded-2xl flex items-center justify-between border shadow-md my-0.5 ${
              isDateNight
                ? 'bg-rose-950/40 border-rose-500/30'
                : 'bg-slate-900/60 border-slate-700/50'
            }`}
          >
            {/* Player 1 (Local) */}
            <div className="flex items-center gap-2">
              {isDateNight ? (
                <Heart size={16} className="text-rose-400 fill-rose-400" />
              ) : (
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
              )}
              <span className="font-bold text-sm text-white max-w-[105px] truncate">
                {playerName}
              </span>
              <span
                className={`text-base font-black px-2.5 py-1 rounded-xl ${
                  isDateNight ? 'bg-rose-500/20 text-rose-300' : 'bg-indigo-500/20 text-indigo-300'
                }`}
              >
                {localScore}
              </span>
            </div>

            <div className="text-xs font-black uppercase text-slate-400 tracking-wider">
              VS
            </div>

            {/* Player 2 (Opponent) */}
            <div className="flex items-center gap-2">
              <span
                className={`text-base font-black px-2.5 py-1 rounded-xl ${
                  isDateNight ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {opponentScore}
              </span>
              <span className="font-bold text-sm text-slate-300 max-w-[105px] truncate">
                {opponentName}
              </span>
              {isDateNight ? (
                <Heart size={16} className="text-amber-400 fill-amber-400" />
              ) : (
                <span className="w-3 h-3 rounded-full bg-indigo-400" />
              )}
            </div>
          </div>

          {/* Turn Status Pill Banner */}
          <div className="flex items-center justify-between px-1">
            <motion.div
              animate={isLocalTurn ? { scale: [1, 1.02, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2.2 }}
              className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 border transition-all ${
                isLocalTurn
                  ? isDateNight
                    ? 'bg-rose-500/25 text-rose-200 border-rose-400/40 shadow-md shadow-rose-950/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700/40'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
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
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <span className="text-slate-400 font-bold">{opponentName}:</span>
              <div className="flex gap-1 items-center">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      i < opponentLinesCount
                        ? isDateNight
                          ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]'
                          : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                        : 'bg-slate-700/80 border border-slate-600/40'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-xs font-bold text-slate-400">({opponentLinesCount}/5)</span>
            </div>
          </div>

          {/* Prominent Line Completion Alert Banner (Visible for 4.8s on BOTH screens!) */}
          <AnimatePresence>
            {lineAlert && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                className={`w-full py-2 px-3.5 rounded-2xl flex items-center justify-between shadow-2xl border my-0.5 ${
                  lineAlert.count >= 4
                    ? 'bg-gradient-to-r from-amber-950/95 via-rose-950/95 to-red-950/90 border-amber-400/70 shadow-amber-950/70 text-amber-100 ring-1 ring-amber-400/50'
                    : lineAlert.isOpponent
                    ? isDateNight
                      ? 'bg-gradient-to-r from-amber-950/90 via-rose-950/90 to-amber-900/80 border-amber-400/60 shadow-amber-950/60 text-amber-100'
                      : 'bg-indigo-950/90 border-indigo-400/50 text-indigo-100'
                    : isDateNight
                    ? 'bg-gradient-to-r from-rose-950/90 via-rose-900/90 to-pink-950/90 border-rose-400/60 shadow-rose-950/60 text-rose-100'
                    : 'bg-emerald-950/90 border-emerald-400/50 text-emerald-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">
                    {lineAlert.count >= 4 ? '🔥' : isDateNight ? '💕' : '✨'}
                  </span>
                  <div>
                    <div className="text-sm font-black tracking-tight leading-tight">
                      {lineAlert.title}
                    </div>
                    <div className="text-xs opacity-90 leading-tight">
                      {lineAlert.subtitle}
                    </div>
                  </div>
                </div>
                <div
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-full shrink-0 border ${
                    lineAlert.isOpponent
                      ? 'bg-indigo-900/60 text-indigo-200 border-indigo-400/40'
                      : isDateNight
                      ? 'bg-rose-900/70 text-amber-200 border-amber-400/50'
                      : 'bg-emerald-900/60 text-emerald-200 border-emerald-400/40'
                  }`}
                >
                  {lineAlert.isOpponent ? `${lineAlert.senderName || opponentName}: ` : 'You: '}
                  {lineAlert.count}/5
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* B-I-N-G-O Header Badges */}
          <div className="flex flex-col items-center justify-center my-0.5">
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-1">
              Your B-I-N-G-O Lines ({completedLinesCount}/5)
            </span>
            <div className="flex items-center justify-center gap-2.5">
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
          </div>

          {/* 5x5 Tactile Grid */}
          <div className="bingo-grid my-auto">
            {board.map((number, index) => {
              const isEmpty = number === null;
              const isCalled = !isEmpty && calledNumbers.includes(number);
              const isWinning = !isEmpty && winningTileIndices.has(index);
              const isLast = !isEmpty && lastCalled === number;

              return (
                <button
                  key={index}
                  disabled={screen !== 'playing' || (isBoardLocked && isCalled)}
                  onClick={() => handleTileClick(number, index)}
                  className={`bingo-tile ${
                    isEmpty
                      ? 'empty'
                      : isWinning
                      ? 'winning'
                      : isCalled
                      ? 'called'
                      : 'uncalled'
                  }`}
                >
                  {/* Last Called Pulse Ring */}
                  {isLast && <div className="last-called-ring" />}
                  <span>
                    {isEmpty ? (
                      !isBoardLocked && nextSequentialNumber ? (
                        <span className="text-xs sm:text-sm font-semibold opacity-35 select-none">
                          +{nextSequentialNumber}
                        </span>
                      ) : (
                        ''
                      )
                    ) : (
                      number
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* In-Game Floating Reactions Emote Bar (Date Night) */}
          {isDateNight && (
            <div className="flex items-center justify-center gap-2 py-0.5">
              <span className="text-xs font-bold text-rose-300 opacity-80">Send Love:</span>
              <div className="flex items-center gap-1.5 p-1 rounded-full glass-panel border border-rose-500/30 shadow-md">
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
            <div className="w-full max-w-sm mx-auto p-3 rounded-2xl glass-card border border-slate-700/60 shadow-xl space-y-2.5 my-1">
              {/* Header Status Row */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-200">Board Setup</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    {placedCount}/25
                  </span>
                </div>

                {nextSequentialNumber !== null ? (
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      isDateNight
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    }`}
                  >
                    <span>Next on tap:</span>
                    <span className="font-mono text-sm underline font-black">
                      #{nextSequentialNumber}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Check size={14} />
                    <span>Board Complete!</span>
                  </div>
                )}
              </div>

              {/* Action Helper Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleFillRandom}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border shadow ${
                    isDateNight
                      ? 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Fill remaining or all slots randomly"
                >
                  <Shuffle size={13} className={isDateNight ? 'text-rose-400' : 'text-indigo-400'} />
                  <span>Random 🎲</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleFillSequential}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border shadow ${
                    isDateNight
                      ? 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Fill entire board 1 to 25 in order"
                >
                  <span className="font-mono text-xs font-black">1➔25</span>
                  <span>In Order</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleClearBoard}
                  className="py-2 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border shadow bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
                  title="Clear all numbers"
                >
                  <RotateCcw size={13} className="text-slate-400" />
                  <span>Clear</span>
                </motion.button>
              </div>

              {/* Hint or Lock CTA */}
              {isBoardFull ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleLockBoard}
                  className={`w-full py-3 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 border transition ${
                    isDateNight
                      ? 'bg-gradient-to-r from-rose-500 via-rose-600 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white border-amber-300/40 shadow-rose-900/50 animate-pulse'
                      : 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 border-emerald-400/40 shadow-emerald-950/50 animate-pulse'
                  }`}
                >
                  <Lock size={16} />
                  <span>Lock Board & Ready! 🎯</span>
                </motion.button>
              ) : (
                <p className="text-[11px] text-center text-slate-400 leading-snug">
                  Tap any box to place <strong>#{nextSequentialNumber}</strong>. Tap placed number to remove. Or tap <strong>Random 🎲</strong>!
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[38px] my-1">
              {calledNumbers.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 py-1.5 px-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-semibold shadow-md">
                    <Lock size={13} className="text-emerald-400" />
                    <span>
                      Board Locked & Ready!{' '}
                      {isLocalTurn ? 'Your turn to call!' : `Waiting for ${opponentName}...`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-400">
                  <span>
                    Calls: <strong className="text-white">{calledNumbers.length}</strong>/25
                  </span>
                  <span>•</span>
                  <span>
                    Your Lines: <strong className="text-amber-400">{completedLinesCount}</strong>/5
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
          )}
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

              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                  Round {roundWinnerInfo.roundNum} Winner
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {roundWinnerInfo.name} Secured the Round!
                </h3>
                <p className="text-sm text-slate-300">{roundWinnerInfo.reason}</p>
              </div>

              {/* Updated Scorecard */}
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/60 flex items-center justify-around">
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-400 block">{playerName}</span>
                  <span className="text-xl font-black text-white">
                    {roundWinnerInfo.localScore}
                  </span>
                </div>
                <div className="text-xs font-bold text-amber-400">
                  First to {targetWins}
                </div>
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-400 block">{opponentName}</span>
                  <span className="text-xl font-black text-white">
                    {roundWinnerInfo.opponentScore}
                  </span>
                </div>
              </div>

              {/* Next Round CTA */}
              {role === 'guest' ? (
                <div className="w-full py-3.5 px-4 rounded-2xl text-slate-300 font-bold text-sm bg-slate-800/80 border border-slate-700/60 flex items-center justify-center gap-2 cursor-not-allowed">
                  <RefreshCw size={16} className="animate-spin text-slate-400" />
                  <span>Waiting for Host to start next round...</span>
                </div>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleProceedToNextRound}
                  className={`w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border ${
                    isDateNight
                      ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 shadow-rose-500/30 border-rose-400/30'
                      : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 shadow-indigo-500/30 border-indigo-400/30'
                  }`}
                >
                  <RefreshCw size={18} />
                  <span>Start Round {roundWinnerInfo.roundNum + 1}</span>
                </motion.button>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className={`glass-card w-full max-w-sm p-6 text-center space-y-4 border shadow-2xl ${
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
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1.5">
                  <Star size={13} className="fill-amber-400" />
                  <span>SERIES CHAMPION</span>
                  <Star size={13} className="fill-amber-400" />
                </span>
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {seriesWinnerInfo.name} WINS THE SERIES!
                </h3>
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

              {/* Official Date Night Contract Awarded */}
              {isDateNight && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/70 via-rose-950/70 to-amber-950/70 border border-amber-400/50 text-center space-y-1 shadow-lg">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center justify-center gap-1.5">
                    <Sparkles size={13} className="text-amber-400" />
                    <span>Official Date Night Contract Sealed</span>
                    <Sparkles size={13} className="text-amber-400" />
                  </div>
                  <div className="text-sm font-bold text-white">
                    {seriesWinnerInfo.name} wins:{' '}
                    <span className="text-amber-400 font-black">
                      {seriesWinnerInfo.wager || activeWager}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {isDateNight && (
                  <button
                    onClick={() => setShowPolaroidModal(true)}
                    className="w-full py-3 rounded-2xl glass-button text-sm font-bold text-rose-300 border-rose-400/40 flex items-center justify-center gap-2 hover:bg-rose-950/40 shadow-md"
                  >
                    <Camera size={16} />
                    <span>View Date Night Polaroid 📸</span>
                  </button>
                )}

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSeriesRematch}
                  disabled={rematchStatus === 'requested'}
                  className={`w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 border ${
                    isDateNight
                      ? 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 shadow-rose-500/25 border-rose-400/30'
                      : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 shadow-indigo-500/25 border-indigo-400/30'
                  }`}
                >
                  <RefreshCw size={18} />
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className={`glass-card w-full max-w-sm p-4 sm:p-5 space-y-3.5 border shadow-2xl max-h-[88vh] flex flex-col ${
                isDateNight ? 'border-rose-500/40' : 'border-white/20'
              }`}
            >
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {activeStatsTab === 'ledger' ? (
                    <ScrollText size={22} className="text-rose-400" />
                  ) : (
                    <Flame size={22} className="text-amber-400" />
                  )}
                  <h3 className="text-lg font-black text-white">
                    {isDateNight
                      ? activeStatsTab === 'ledger'
                        ? 'The Love Ledger 📜'
                        : 'Yugi vs Renia Rivalry'
                      : 'Head-to-Head Stats'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowStatsModal(false)}
                  className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg glass-button font-semibold"
                >
                  Close
                </button>
              </div>

              {/* Tabs for Date Night: Stats vs Love Ledger */}
              {isDateNight && (
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
              )}

              {/* Tab 1: Rivalry Stats Content */}
              {activeStatsTab === 'stats' ? (
                <div className="space-y-3 overflow-y-auto pr-0.5">
                  {/* Lifetime Series Record */}
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-2">
                    <span className="text-xs uppercase font-bold text-slate-400 block">
                      Series Record
                    </span>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-white text-sm">
                        {isDateNight ? 'Yugi 🥂' : playerName}
                      </span>
                      <span className="text-lg font-black text-amber-400 font-mono">
                        {isDateNight
                          ? `${stats.yugiSeriesWon || 0} - ${stats.reniaSeriesWon || 0}`
                          : `${stats.localSeriesWon} - ${stats.opponentSeriesWon}`}
                      </span>
                      <span className="font-bold text-slate-300 text-sm">
                        {isDateNight ? 'Renia 🌹' : opponentName}
                      </span>
                    </div>
                  </div>

                  {/* Total Rounds Record */}
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60">
                      <span className="text-xs uppercase font-bold text-slate-400 block">
                        {isDateNight ? 'Yugi Rounds' : 'Your Rounds Won'}
                      </span>
                      <span className="text-lg font-extrabold text-white">
                        {isDateNight ? stats.yugiRoundsWon || 0 : stats.localRoundsWon}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60">
                      <span className="text-xs uppercase font-bold text-slate-400 block">
                        {isDateNight ? 'Renia Rounds' : 'Opponent Rounds'}
                      </span>
                      <span className="text-lg font-extrabold text-slate-300">
                        {isDateNight ? stats.reniaRoundsWon || 0 : stats.opponentRoundsWon}
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
                        Play a Date Night series to crown a champion and log what the loser has to do 💕
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
                                    : 'text-white'
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
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
                  <div className="text-base font-black text-white tracking-tight">
                    {seriesWinnerInfo.name} Won! 👑
                  </div>
                  <div className="text-[11px] text-amber-300 font-bold font-mono">
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
                  <span className="text-rose-600 font-black">
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
