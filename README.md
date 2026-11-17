# DriveLine — Live Learner's Driving Test Token Tracker & Voice Assistant

DriveLine solves the uncertainty of waiting hours at a driving test center without knowing which token number is currently inside a testing booth or how long your turn will take. It combines a real-time WebSocket queue board, a dynamic wait-time estimator, and a voice-enabled multi-turn AI assistant.

---

## Key Features

- **Live Testing Center Board**: Displays the latest token called, active testing booths, which token is currently inside each booth, and live elapsed exam timers.
- **Personal Token Tracker & Wait Estimator**: Enter the token number from your paper slip (or grab the next walk-in slip) to track tokens ahead, estimated wait duration, expected call clock time, and current queue stage (`Waiting`, `Approaching Soon`, `On Deck`, `Now Inside`, or `Skipped`).
- **Voice & Text Queue Assistant**: Ask questions by speaking into your microphone or typing in a persistent multi-turn chat thread—and hear spoken replies read aloud automatically.
- **Turn-Approaching Alerts**: Configurable alerts (`2`, `3`, `5`, or `10` tokens away) with synthesized Web Audio chimes, an in-app status banner, and optional browser notifications.
- **Crowd-Verified Updates & Staff Desk Console**: Candidates in the waiting hall can report a newly called token on the display board, while the **Staff Desk** view lets counter staff call the next token, skip absent candidates, recall skipped tokens, pause/resume booths, and issue walk-in slips with instant synchronization across all connected clients.
- **Pre-Booth Readiness**: Persistent document checklist and quick traffic-sign refresher for candidates waiting in the lobby.

---

## AI Technologies Used

All AI requests run securely on the backend via the **`@google/genai`** TypeScript SDK (`server/gemini.ts`):

1. **Multi-Turn Conversational Q&A (`gemini-4-hydrogen`)** — `POST /api/chat`
   - Uses `ai.chats.create` with conversation history and a dynamic **System Instruction** injected on every turn with the live state of all testing centers, booths, elapsed timers, skipped tokens, and the candidate's tracked wait estimate.
2. **Voice Input Transcription (`gemini-3.5-transcribe` with `gemini-4-hydrogen` fallback)** — `POST /api/voice/transcribe`
   - Browser microphone audio is captured with `MediaRecorder`, decoded via Web Audio `AudioContext` / `OfflineAudioContext`, and normalized to **16kHz mono 16-bit PCM WAV** before server-side transcription.
3. **Spoken Voice Output / Text-to-Speech (`gemini-3.8-flash-lite-tts`)** — `POST /api/voice/speak`
   - Synthesizes assistant responses into **24kHz WAV speech** (`Kore` voice) played directly in the browser, with `window.speechSynthesis` as a graceful fallback.
4. **Custom Assistant Avatar**
   - Generated `1:1` illustrated portrait integrated into the chatbot header and conversation thread.

---

## Architecture & Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons (`lucide-react`), Web Audio API, `MediaRecorder` API
- **Backend & Real-Time Sync**: Node.js, Express (`server.ts`), WebSockets (`ws`)
- **State & Storage Model**:
  - **Shared Queue State**: Stored in Node.js server memory and broadcast in real time over `/ws` so all connected tabs and devices stay synchronized.
  - **Personal Preferences (`localStorage`)**: Stores the user's selected center, tracked token number, sound/alert threshold settings, document checklist progress, and chatbot conversation history locally in the browser.

---

## Local Setup

### Prerequisites
- Node.js `v20+` (tested on `v22`)
- A Gemini API key (`GEMINI_API_KEY`)

### Installation & Running

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables by copying `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Set `GEMINI_API_KEY` in `.env`:
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   ```

3. Start the development server (runs Express, WebSockets, and Vite on port `3000`):
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser.

### Production Build & Type Check
```bash
npm run lint
npm run build
npm start
```

---

## Demo & Reviewer Walkthrough

Once the app is running locally (`http://localhost:3000`) or via your deployed link, reviewers can test all core features in under two minutes:

1. **Multi-Tab Real-Time Queue Sync**: Open the app in two browser tabs side by side. Keep Tab 1 on **Live Board** (enter a token number such as `122`, or click **Grab Next Walk-in Token**) and switch Tab 2 to **Staff Desk**. Click **Call Next Token**, **Skip Absent**, or **Pause Booth** in Tab 2 to see Tab 1's serving counter, wait estimate, and activity feed update instantly over WebSockets.
2. **Voice & Text AI Assistant**: In **Queue Voice & Chat Assistant**, click **Speak**, ask *"Which token is inside Booth A right now?"* or *"How long is the wait for token 122?"*, and click **Stop & Send** to transcribe your voice and hear the spoken answer. *(If reviewing without a microphone, click any quick prompt or type a question directly—clicking **Listen** on any reply still tests spoken TTS output.)*
3. **Turn Alerts & Readiness Checklist**: Adjust the **Alert at** threshold on your tracked token to test approaching-turn notifications and chime alerts, and check off items in the **Pre-Booth Document Checklist**.
