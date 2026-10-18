# BINGO // 25 — iOS Premium Edition
> A complete, production-ready, zero-backend 1–25 Classic Multiplayer Bingo Web Application designed for mobile (`100dvh` iOS Safari first) with real-time peer-to-peer WebRTC connectivity via PeerJS, zero-asset Web Audio synthesis, and an intelligent AI practice bot.

---

## 🌟 Overview & Key Highlights

* **Zero-Backend Architecture**: Runs 100% in the browser. No databases, no Firebase, no custom backend servers, and no API keys required.
* **Direct WebRTC P2P**: Two players anywhere in the world connect directly peer-to-peer using **PeerJS** via a 4-digit room code or shareable invite link (`?room=XXXX`).
* **iOS 18 Dark Obsidian Aesthetics**: Designed specifically for iPhone Safari viewport locks (`100dvh`, `viewport-fit=cover`, `-webkit-touch-callout: none`), tactile 3D glass tiles, and ambient radial glow orbs.
* **Zero-Asset Web Audio Synthesizer**: Pure Web Audio API oscillators synthesize physical mechanical pops, woody thocks, harmonic line chimes, triumphant arpeggio fanfares, and percussive shuffle ticks without external MP3/WAV files.
* **Smart AI Bot Practice Mode**: Play solo anytime with a heuristic AI bot featuring a natural 650ms thinking delay and line-maximization algorithms.
* **12-Line Win Detector & Simultaneous Tie Handling**: Detects all 5 rows, 5 columns, and 2 diagonals; gracefully handles simultaneous 5-line wins with dual celebrations.

---

## 🛠️ Complete Tech Stack & Dependencies

| Category | Technology | Version | Purpose & Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **React** | `^19.2.8` | Declarative UI, state management, hooks (`useState`, `useEffect`, `useRef`, `useCallback`). |
| **DOM Renderer** | **React DOM** | `^19.2.8` | React DOM bindings for client-side rendering. |
| **Build Tool / Bundler** | **Vite** | `^8.3.0` | Ultra-fast HMR and optimized production bundling with `@vitejs/plugin-react`. |
| **CSS Engine** | **Tailwind CSS v4** | `^4.0.0` | Next-generation utility styling via `@tailwindcss/vite` integrated with custom CSS variables. |
| **P2P Networking** | **PeerJS** | `^1.5.5` | WebRTC peer-to-peer data channels for zero-latency, serverless packet exchange. |
| **Animation Engine** | **Framer Motion** | `^14.3.0` | Spring physics, entrance/exit modals, scale pulses on B-I-N-G-O badges, and toasts. |
| **Icons** | **Lucide React** | `^1.59.0` | Crisp SVG iconography (`Trophy`, `Shuffle`, `Share2`, `Copy`, `Volume2`, `Bot`, `Users`, etc.). |
| **Celebration Effects**| **Canvas Confetti**| `^1.9.4` | Physics-driven confetti bursts upon B-I-N-G-O victory or simultaneous ties. |
| **Audio Synthesizer** | **Web Audio API** | Native | Zero-asset, zero-latency synthesizer using `AudioContext`, oscillators, and gain ramps. |
| **Linter** | **Oxlint** | `^1.81.0` | High-performance JavaScript/JSX static analysis. |

---

## 📂 Project Architecture

```
bingo-web-app/
├── index.html               # Mobile viewport lock, PWA meta tags, theme color, dark canvas
├── package.json             # Project dependencies and npm scripts
├── vite.config.js           # Vite configuration with React and Tailwind CSS v4 plugins
├── dist/                    # Production bundle output (HTML, JS, CSS)
└── src/
    ├── main.jsx             # React 19 entry point and StrictMode wrapper
    ├── index.css            # 100dvh locks, obsidian background, ambient orbs, 3D tactile grid
    ├── App.jsx              # Complete state machine, WebRTC protocol, Arena, Modals & AI
    └── utils/
        ├── bingoEngine.js   # Fisher-Yates 1-25 generator, 12-line detector, Smart Bot AI
        └── sound.js         # Zero-asset Web Audio API synthesizer & sound controls
```

---

## 🧩 Deep Dive into Modules

### 1. iOS Viewport & Shell (`index.html`)
* **Strict Viewport Lock**:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  ```
  Prevents Safari auto-zoom on taps and ensures the layout fits iPhone notch/island safe areas.
* **iOS Web App (PWA) Tags**:
  ```html
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#090A0F" />
  ```
* **No Flash Dark Canvas**: Initial CSS applied directly in `<head>` so screen transitions and initial loads never flash white.

---

### 2. Design System: "iOS 18 Dark Obsidian & Tactile Glass" (`src/index.css`)
* **Dynamic Viewport Height (`100dvh`)**: Locks height to `100dvh` and disables pull-to-refresh / rubber-banding:
  ```css
  overflow: hidden;
  position: fixed;
  touch-action: manipulation;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  ```
* **Ambient Glow Orbs**: Two fixed radial blur orbs create subtle depth behind the glass cards:
  - Top-Left: Indigo (`#6366F1`) with 8s ease-in-out breathing animation.
  - Bottom-Right: Emerald (`#10B981`) with counter-phase pulsation.
* **Tactile 5x5 Grid Tiles**:
  - **Uncalled Tile**: `rgba(30, 41, 59, 0.85)` with a top inner rim highlight (`inset 0 1px 0 rgba(255,255,255,0.14)`) and a 3D physical bottom lip (`0 4px 0 rgba(5, 7, 12, 0.85)`).
  - **Called Tile**: Physically depresses down (`transform: translateY(2px)`), drops bottom lip to `1px`, and shifts to deep Indigo gradient (`linear-gradient(135deg, #6366F1, #4338CA)`).
  - **Completed Line Tile**: Transitions to an energetic Emerald gradient (`linear-gradient(135deg, #10B981, #059669)`), `#34D399` border, and radiant pulse glow (`0 0 18px rgba(16, 185, 129, 0.55)`).
  - **Last Called Number Ring**: Subtle gold pulse ring (`#FBBF24`) highlighting the most recently called tile so both players immediately see what was tapped.
* **B-I-N-G-O Badges**:
  - Inactive: Muted slate squircle badges.
  - Active (1–5 lines completed): Ignites with warm gold gradient (`#FBBF24` to `#D97706`), bold dark text, and spring scale animation.

---

### 3. Zero-Asset Synthesized Audio Engine (`src/utils/sound.js`)
All sound effects are mathematically synthesized using the native **Web Audio API** (`AudioContext`). No audio asset files need to be fetched over the network.
* **Autoplay Compliance**: `AudioContext` is lazily initialized upon the first user tap to respect iOS Safari audio autoplay restrictions.
* **Synthesized Audio Profiles**:
  1. **`playTapSound()`** (Mechanical Tile Pop):
     - Waveform: Triangle wave
     - Pitch: 520 Hz ramping exponentially down to 180 Hz over 0.08s
     - Gain: 0.3 down to 0.001
  2. **`playOpponentTapSound()`** (Opponent Move Woody Thock):
     - Waveform: Sine wave
     - Pitch: 340 Hz ramping down to 220 Hz over 0.08s
     - Gain: 0.32 down to 0.001
  3. **`playLineCompleteSound()`** (Line Completion Two-Note Chime):
     - Waveform: Sine wave
     - Note 1: 587.33 Hz ($D_5$) at $t_0$, decaying over 0.28s
     - Note 2: 880.00 Hz ($A_5$) at $t_0 + 0.12s$, decaying over 0.33s
  4. **`playWinFanfare()`** (Triumphant 4-Note Arpeggio):
     - Chord Sequence: $C_5$ (523.25 Hz) $\rightarrow$ $E_5$ (659.25 Hz) $\rightarrow$ $G_5$ (783.99 Hz) $\rightarrow$ $C_6$ (1046.50 Hz)
     - Overlapping decays creating a celebratory harmonic progression.
  5. **`playShuffleSound()`** (Board Shuffle Ticks):
     - 3 rapid percussive micro-ticks (offsets: 0s, 0.04s, 0.08s) ramping 680 Hz to 260 Hz in 30ms.
* **Mute Control**: Global toggle support (`toggleSoundMuted()`, `getSoundMuted()`) with instantaneous feedback.

---

### 4. 1–25 Classic Rules & Win Detector (`src/utils/bingoEngine.js`)
* **Board Generation**:
  - `generateBoard()`: Numbers 1 through 25 shuffled uniformly via the **Fisher-Yates (Knuth) Shuffle algorithm**.
* **12 Win Lines Definition (`WIN_LINES`)**:
  - **5 Rows**:
    - Row 0: `[0, 1, 2, 3, 4]`
    - Row 1: `[5, 6, 7, 8, 9]`
    - Row 2: `[10, 11, 12, 13, 14]`
    - Row 3: `[15, 16, 17, 18, 19]`
    - Row 4: `[20, 21, 22, 23, 24]`
  - **5 Columns**:
    - Col 0: `[0, 5, 10, 15, 20]`
    - Col 1: `[1, 6, 11, 16, 21]`
    - Col 2: `[2, 7, 12, 17, 22]`
    - Col 3: `[3, 8, 13, 18, 23]`
    - Col 4: `[4, 9, 14, 19, 24]`
  - **2 Diagonals**:
    - Diagonal 1: `[0, 6, 12, 18, 24]` (Top-Left to Bottom-Right)
    - Diagonal 2: `[4, 8, 12, 16, 20]` (Top-Right to Bottom-Left)
* **Evaluation Algorithm (`evaluateBoard`)**:
  - Evaluates board against a `Set` of called numbers for $O(1)$ lookups.
  - Returns:
    ```javascript
    {
      completedLinesCount: number,     // Total lines completed (0 to 12)
      winningTileIndices: Set<number>,  // Exact tile indices belonging to completed lines
      completedLineIds: number[]        // IDs of completed lines (0 to 11)
    }
    ```
  - **B-I-N-G-O condition**: `completedLinesCount >= 5`.
* **Smart AI Bot Move Selector (`getBestBotMove`)**:
  - Simulates calling each candidate uncalled number on its hidden 5x5 board.
  - Scores candidates using a weighted line-progression heuristic:
    - **Completes a Line**: `+1500` pts
    - **Creates 4-in-a-row**: `+200` pts
    - **Creates 3-in-a-row**: `+40` pts
    - **Creates 2-in-a-row**: `+10` pts
  - Dynamic tie-breaking: Picks randomly among top-tied moves to maintain engaging gameplay.

---

### 5. PeerJS WebRTC P2P Protocol & State Machine (`src/App.jsx`)

#### Deterministic Peer ID Addressing
Every room maps to a WebRTC peer via a deterministic prefix:
```javascript
const PEER_PREFIX = 'bingo25-live-room-';
const hostPeerId = PEER_PREFIX + roomCode; // e.g. bingo25-live-room-4821
```

#### Screen State Machine
1. **`lobby`**: Player nickname input, "Create 2-Player Room", "Join Friend's Room", and "Play Solo vs Smart Bot".
2. **`waiting`**: Displayed to the Host. Shows giant 4-digit code, shareable link, "Share Invite Link" (using `navigator.share()` with clipboard fallback), and pulsing connection radar.
3. **`playing`**: Active game arena with turn indicators, B-I-N-G-O letters, 5x5 tactile grid, opponent line tracker, and board shuffle controls.
4. **`gameover`**: Victory / Defeat / Simultaneous Tie modal with `canvas-confetti` fireworks, game statistics, and Rematch buttons.

#### Real-Time Packet Protocol (`conn.send(data)`)
| Packet Type | Payload | Sender | Purpose |
| :--- | :--- | :--- | :--- |
| `HELLO` | `{ name }` | Guest | Initiates handshake upon connecting to Host. |
| `HELLO_ACK` | `{ name, turn }` | Host | Acknowledges handshake, syncs Host's name, sets Host first turn. |
| `CALL_NUMBER` | `{ number, nextTurn, isClaimingWin, senderName, linesCount }` | Active Turn Player | Broadcasts selected number, passes turn, and updates line progress. |
| `LINE_UPDATE` | `{ linesCount }` | Any | Syncs live BINGO line count for real-time progress bar. |
| `CLAIM_WIN` | `{ winnerName, senderName }` | Winner | Broadcasts immediate victory when 5 lines are reached. |
| `CLAIM_TIE` | `{}` | Local | Broadcasts simultaneous tie when both players hit 5 lines on the same call. |
| `REMATCH_REQUEST`| `{}` | Player | Informs opponent of rematch request ("Waiting for opponent..."). |
| `REMATCH_ACCEPT` | `{ nextStartingTurn }` | Opponent | Starts fresh round with alternating starter without disconnecting. |
| `LEAVE` | `{}` | Any | Notifies peer that player returned to lobby and closes connection cleanly. |

#### Edge-Case Handling
* **URL Auto-Join**: On mount, parses `?room=XXXX`. Automatically fills the 4-digit code and highlights the Join CTA so invited friends can join in a single tap.
* **Simultaneous Wins**: If Player A calls a number that completes 5 lines on Player A's board *and* also completes 5 lines on Player B's board, the engine triggers a **Simultaneous Tie** with confetti and fanfare on both devices.
* **Pre-Game Setup Phase**: Players can tap "Shuffle My Board" as many times as they want before the first number is called. As soon as `calledNumbers.length > 0`, the board layout locks permanently.
* **Connection Lifecycle**: Full cleanup on unmount or return to lobby (`peer.destroy()`, `conn.close()`).

---

## 🚀 Getting Started & Running Locally

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher

### 1. Installation
Clone or navigate to the project directory and install the packages:
```bash
npm install
```

### 2. Run Local Development Server
Launch the Vite dev server with network host exposure:
```bash
npm run dev -- --host
```
The terminal will display:
* **Local**: `http://localhost:5173/`
* **Network**: `http://<YOUR_LAN_IP>:5173/`

### 3. Testing on Mobile Devices
1. Ensure your iPhone / Android and your computer are connected to the same Wi-Fi network.
2. Open Safari / Chrome on your phone and browse to `http://<YOUR_LAN_IP>:5173/`.
3. Tap **"Create 2-Player Room"** on Phone A.
4. Tap **"Share Invite Link"** or scan/enter the 4-digit room code on Phone B.
5. Both phones connect directly via WebRTC and start playing in real time!

### 4. Production Build
Verify compilation and produce optimized static assets:
```bash
npm run build
```
Preview the production build locally:
```bash
npm run preview
```

---

## 📱 iOS Safari Optimization Best Practices Included

* **No Elastic Bounce / Rubber-Banding**: Body position fixed with `100dvh` prevents content dragging.
* **No Accidental Double-Tap Zoom**: `touch-action: manipulation;` and `user-scalable=no`.
* **No Callout Magnifiers**: `-webkit-touch-callout: none;` and `-webkit-user-select: none;`.
* **Zero Tap Highlight Grey Boxes**: `-webkit-tap-highlight-color: transparent;`.
* **Tabular Numerals**: Numbers 1–25 rendered with `font-variant-numeric: tabular-nums` to prevent layout jittering when numbers are called.
* **Safe-Area Insets**: Proper padding preserving space for dynamic island, notch, and home bar.

---

## 📄 License
MIT License. Built for zero-backend, high-performance web gaming.
