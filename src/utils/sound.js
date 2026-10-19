/**
 * Zero-asset Web Audio API Synthesizer for tactile UI sounds
 * Optimized for iOS Safari & modern mobile browsers
 */

let audioCtx = null;
let isMuted = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;

  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

export function setSoundMuted(muted) {
  isMuted = muted;
}

export function getSoundMuted() {
  return isMuted;
}

export function toggleSoundMuted() {
  isMuted = !isMuted;
  return isMuted;
}

/**
 * 1. playTapSound: Crisp mechanical pop (triangle wave, 520Hz ramping down to 180Hz over 0.08s)
 */
export function playTapSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch (err) {
    // Graceful fallback if audio is not permitted
  }
}

/**
 * 2. playOpponentTapSound: Subtle lower woody thock (sine wave, 340Hz over 0.08s)
 */
export function playOpponentTapSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch (err) {
    // Graceful fallback
  }
}

/**
 * 3. playLineCompleteSound: Rising harmonic two-note chime (587.33Hz -> 880Hz)
 */
export function playLineCompleteSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Note 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.28);

    // Note 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);

    gain2.gain.setValueAtTime(0.32, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (err) {
    // Graceful fallback
  }
}

/**
 * playKatanaSlashSound: Sharp energetic anime / katana slice audio
 */
export function playKatanaSlashSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1300, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.16);

    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  } catch (err) {
    // Graceful fallback
  }
}

/**
 * 4. playWinFanfare: Triumphant 4-note arpeggio chord (C5 -> E5 -> G5 -> C6) when 5 lines are achieved
 */
export function playWinFanfare() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [
      { freq: 523.25, time: 0 },    // C5
      { freq: 659.25, time: 0.11 }, // E5
      { freq: 783.99, time: 0.22 }, // G5
      { freq: 1046.50, time: 0.35 } // C6
    ];

    const startTime = ctx.currentTime + 0.02;

    notes.forEach((note, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = startTime + note.time;
      const duration = idx === notes.length - 1 ? 0.7 : 0.35;

      osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(note.freq, noteTime);

      gain.gain.setValueAtTime(0.35, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + duration);
    });
  } catch (err) {
    // Graceful fallback
  }
}

/**
 * 5. playShuffleSound: Quick percussive tick when shuffling the board
 */
export function playShuffleSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // 3 rapid micro-ticks
    [0, 0.04, 0.08].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, now + offset);
      osc.frequency.exponentialRampToValueAtTime(260, now + offset + 0.03);

      gain.gain.setValueAtTime(0.2, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.03);
    });
  } catch (err) {
    // Graceful fallback
  }
}

/**
 * 6. playRomanticChime: Warm crystalline music-box harp arpeggio for Date Night
 */
export function playRomanticChime() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [
      { freq: 739.99, time: 0 },    // F#5
      { freq: 932.33, time: 0.1 },  // A#5
      { freq: 1108.73, time: 0.2 }, // C#6
      { freq: 1396.91, time: 0.32 } // F6
    ];

    const startTime = ctx.currentTime + 0.02;

    notes.forEach((note, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = startTime + note.time;
      const duration = 0.55;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, noteTime);

      gain.gain.setValueAtTime(0.25, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + duration);
    });
  } catch (err) {
    // Graceful fallback
  }
}

/**
 * 7. playPlacementNote: Ascending pentatonic note when placing numbers 1 to 25
 * Makes sequential board filling sound like a cheerful kalimba / music box
 */
export function playPlacementNote(number = 1, isDateNight = false) {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Major Pentatonic scale notes across octaves (C4 to A7)
    const baseFreqs = [
      261.63, 293.66, 329.63, 392.00, 440.00, // C4 - A4 (1-5)
      523.25, 587.33, 659.25, 783.99, 880.00, // C5 - A5 (6-10)
      1046.50, 1174.66, 1318.51, 1567.98, 1760.00, // C6 - A6 (11-15)
      2093.00, 2349.32, 2637.02, 3135.96, 3520.00, // C7 - A7 (16-20)
      3520.00, 3920.00, 4186.01, 4698.63, 5274.04  // Harmonic peak (21-25)
    ];

    const idx = Math.max(0, Math.min(24, (number || 1) - 1));
    const freq = baseFreqs[idx];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isDateNight ? 'sine' : 'triangle';
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(freq, now);

    const dur = isDateNight ? 0.22 : 0.16;
    gain.gain.setValueAtTime(isDateNight ? 0.24 : 0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur);
  } catch (err) {
    // Graceful fallback
  }
}
