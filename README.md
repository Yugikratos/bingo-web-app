# BINGO // 25 — Real-Time P2P Multiplayer Web App

> A production-ready, zero-backend 1–25 Classic Multiplayer Bingo Web Application designed for mobile and desktop browsers with real-time peer-to-peer WebRTC connectivity via PeerJS, zero-asset procedural Web Audio synthesis, Best-of Series match engine, Flying Tiles setup physics, exclusive Date Night Mode (Yugi & Renia) with the persistent Love Ledger wager vault, head-to-head stats tracking, and an intelligent AI practice bot.

[![Live App](https://img.shields.io/badge/Live_Deployment-Vercel-black?style=for-the-badge&logo=vercel)](https://bingo-web-app-nine.vercel.app)
[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![WebRTC](https://img.shields.io/badge/WebRTC-PeerJS-FF6B6B?style=for-the-badge&logo=webrtc&logoColor=white)](https://peerjs.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-14.3-black?style=for-the-badge&logo=framer)](https://www.framer.com/motion/)

---

## 🌐 Live Deployment & Instant Play

* **Production URL:** [https://bingo-web-app-nine.vercel.app](https://bingo-web-app-nine.vercel.app)
* **Direct Invite Format:** `https://bingo-web-app-nine.vercel.app/?room=XXXX` (where `XXXX` is any 4-digit room code)

---

## 🌟 Architecture & Key Highlights

* **Zero-Backend Architecture**: Runs 100% client-side in the browser. Requires zero database instances, no Firebase, no custom backend relay servers, and zero API keys.
* **Zero-Server P2P Multiplayer**: Direct browser-to-browser WebRTC data channels via **PeerJS** with deterministic 4-digit room codes or one-click auto-join URLs (`?room=XXXX`).
* **"Flying Tiles" Setup Physics**: Powered by **Framer Motion `<LayoutGroup>`**, manual sequential board setup animates physical tiles un-docking from the "Next on tap" preview and flying fluidly into grid slots with tactile spring physics.
* **Best-of Series Match Engine**: Select from **Single Round**, **Best of 3**, **Best of 5**, **Best of 7**, or **Best of 10** with automatic clinch detection, scorekeeping, alternating first turns, and series championship celebrations.
* **Exclusive "Date Night" Mode (Yugi & Renia)**: A luxurious couples experience featuring velvet rose surfaces, shimmering gold foil wager text, persistent **Love Ledger (Wager Vault)**, live floating emote reactions (`❤️, 😘, 👀, 🔥, 🥺`), floating champagne particles, and commemorative Polaroid victory cards.
* **Procedural Web Audio Synthesizer**: Zero external MP3/WAV audio assets. Uses browser-native Web Audio API oscillators to generate a **Musical Tone Staircase** (ascending pentatonic notes C4–A7), line completion chimes, victory arpeggios, and percussive haptic clicks.
* **Intelligent AI Practice Bot**: Solo training partner equipped with line-advancing heuristic lookahead and natural humanized thinking delays.
* **Tactile Obsidian & Glassmorphism Design**: Mobile-first responsive layout tailored for iOS Safari, Android Chrome, and desktop browsers with true `100dvh` viewport adaptation and home-screen PWA support.

---

## 🎯 Detailed System Breakdown

### 1. Core Match Engine & 12-Line Win Detector
* **5×5 Square Matrix:** Responsive 1–25 number grid with strict 1:1 aspect ratio and zero coordinate drift.
* **12-Line Win Evaluator:** Continuously computes completed rows (5), columns (5), and diagonals (2). Scoring 5 lines spells **B-I-N-G-O** and clinches the round.
* **Best-of Series Engine:**
  - **Single Match:** 1 win needed
  - **Best of 3:** First to 2 wins
  - **Best of 5:** First to 3 wins
  - **Best of 7:** First to 4 wins
  - **Best of 10:** First to 6 wins
* **Turn Management:** Deterministic turn-swapping between host and guest (or player and bot), with automatic turn alternation at the start of each new round.
* **Smart AI Practice Bot:** Evaluates potential calls against its private board, prioritizing lines with 4/5 or 3/5 completion to simulate competitive human play. The bot automatically pauses while the human finishes board setup in multi-round matches.

---

### 2. Pre-Game Setup Phase & "Flying Tiles" Physics
* **On-Tap Sequential Placement (Default):**
  - Tap any open slot on the board to place the next number in sequence (`1, 2, 3... 25`).
  - Empty slots start clean and uncluttered without distracting ghost numbers.
* **"Flying Tiles" Spring Animation (Framer Motion `<LayoutGroup>`):**
  - The "Next on tap: #X" badge and the 25 board slots share animated layout contexts via `layoutId="tile-{number}"`.
  - Tapping an empty slot causes the tile to visually un-dock and fly seamlessly into place with high-stiffness spring damping (`stiffness: 400, damping: 30`).
  - Tapping a placed number instantly un-docks it and flies it back out.
* **Undo & Quick Helpers:**
  - **Undo Button:** Step back and remove the most recently placed number.
  - **Random Shuffle 🎲:** One-tap Fisher-Yates generator to instantly fill empty slots or shuffle a fresh board.
  - **Clear Board ↺:** Instant reset to start fresh at any point during setup.
  - Fully functional in Round 1, Round 2, and all subsequent series rounds.

---

### 3. Zero-Server P2P Multiplayer (PeerJS WebRTC)
* **Deterministic Addressing:** Room codes automatically construct WebRTC peer IDs using the prefix `bingo25-live-room-{code}`.
* **Instant URL Auto-Join:** Joining via link (`?room=1234`) pre-fills the room code and opens the connection seamlessly.
* **Stale-Closure Protected State Sync:** All incoming peer packets (`NEXT_ROUND`, `LINE_COMPLETED`, `EMOTE_REACTION`, `NUMBER_CALLED`, `SYNC_STATE`) resolve through React `useRef` bridges to eliminate stale closures.
* **Multiplayer Turn & Alert Synchronization:** Calls and line claims reflect instantly on both screens with zero perceived latency.

---

### 4. Exclusive "Date Night" Mode (Yugi & Renia)
* **Custom Velvet Rose & Gold Palette:** Deep velvet rose backdrops (`#12030C`), ambient gold orbs (`#FBBF24`), and glowing heart indicators.
* **Floating Champagne Particles:** 20 lightweight, zero-dependency `<motion.div>` ambient particles that drift upward through the background with staggered timing and soft golden shadows.
* **Freeform Stakes & Custom Wagers:** Set custom romantic bets (or choose presets: *"15-Min Massage 💆"*, *"Chooses Dinner 🍕"*, *"Breakfast in Bed 🥞"*, *"Does Dishes Tonight 🧼"*).
* **The Love Ledger (Wager Vault):**
  - Persistent historical record stored in `localStorage` tracking every Date Night series played.
  - Displays match date, winner, final series score, and unsettled penalties.
  - One-tap toggle to mark debts as **Pending** or **Fulfilled** (with strike-through styling).
  - Quick-access button directly accessible from the Lobby and Series Victory screen.
* **Shimmering Gold Foil Wager Text:** Dynamic wager strings rendered in the Polaroid card and Love Ledger gleam with animated metallic gold gradients (`.shimmer-text`).
* **Real-Time Floating Love Emotes:** Interactive emoji bar (`❤️, 😘, 👀, 🔥, 🥺`) during multiplayer matches that dispatches floating reactions across both players' screens.
* **Polaroid Victory Memory Card:** Post-series commemorative Polaroid frame featuring match date, victor, agreed-upon prize, and a one-click **"Copy Love Note"** button.

---

### 5. Procedural Web Audio Engine (Zero Assets)
* **Musical Tone Staircase (`playPlacementNote`):**
  - Sequentially placing numbers 1 through 25 plays ascending pentatonic scale notes from **C4 (261.63 Hz)** up to **A7 (3520.00 Hz)** and harmonic peaks beyond.
  - Simulates a cheerful music box or wooden kalimba while filling your board.
* **Harmonic Line Completion Chime (`playLineCompleteSound`):** Two-note rising chord (D5 to A5) that rings whenever a line is claimed.
* **Romantic Crystalline Chime (`playRomanticChime`):** Multi-octave harp shimmer exclusive to Date Night mode.
* **Triumphant Victory Fanfare (`playWinFanfare`):** 4-note ascending arpeggio (C5 → E5 → G5 → C6) played on round and series wins.
* **Mechanical Clicks & Taps:** Tactile sine clicks on user calls and woody thocks on opponent moves.
* **Global Audio Mute:** Session-persistent mute toggle with state preservation.

---

### 6. Visual Polish & Tactile Motion Design
* **Tactile Tile Spring Squash:** Board buttons squash smoothly on press using physical spring dynamics (`scale: 0.88`, `stiffness: 500`, `damping: 18`).
* **3D Arcade Call Puck:** The active number call badge bounces into view with dynamic 3D drop-shadows and spring scale pop.
* **B-I-N-G-O Header Lights:** Five prominent letter badges illuminate and pulse with celebratory gold/rose glow as lines 1 through 5 are claimed.
* **Radiant Winning Line Glow:** Tiles in completed lines illuminate with golden pulsing borders (`.bingo-tile.winning`) while keeping numbers completely legible.
* **Non-Blocking Top Line Alert:** Slide-down notification banner announcing line completion (e.g. `❤️ You claimed Column 4! (3/5)`) without obstructing board numbers.
* **Full-Screen Confetti Cannon:** Multi-stage celebration fireworks and custom heart-shaped confetti bursts (`canvas-confetti`).

---

### 7. Stats, Resilience & Platform Architecture
* **Head-to-Head Lifetime Statistics:** Persistent tracking of total series played, series win rates, round win rates, and current winning streaks between Yugi and Renia.
* **Crash-Resistant Global Error Boundary:** Catches unforeseen client runtime errors and renders a styled recovery screen with a single-click reset CTA.
* **Progressive Web App (PWA) Ready:** Configured with mobile viewports, theme colors, touch-action optimizations, and home-screen bookmark support.

---

## 💻 Tech Stack & Dependencies

| Layer | Library / Tool | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | React 19 | `^19.2.8` | Component lifecycle, state machines, and hooks |
| **Styling** | Tailwind CSS v4 | `^4.3.3` | Modern utility CSS engine via `@tailwindcss/vite` |
| **Motion** | Framer Motion | `^14.3.0` | LayoutGroup Flying Tiles, spring physics, and particle drift |
| **Networking**| PeerJS (WebRTC) | `^1.5.5` | P2P direct browser data channels |
| **Particles** | Canvas Confetti | `^1.9.4` | Particle physics confetti and custom SVG heart bursts |
| **Icons** | Lucide React | `^1.59.0` | High-clarity SVG UI iconography |
| **Build** | Vite | `^8.3.0` | Sub-second HMR and optimized asset bundling |
| **Linter** | Oxlint | `^1.81.0` | High-speed static analysis and linting |

---

## 🚀 Local Development & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Yugikratos/bingo-web-app.git
   cd bingo-web-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Run static analysis & linting:**
   ```bash
   npm run lint
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## 📜 License & Credits

* Crafted with ❤️ by **Yugi & Renia**.
* Released under the **MIT License**.
