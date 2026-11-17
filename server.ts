import { exec } from 'node:child_process'; 
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ClientSocketMessage,
  CompletedTokenRecord,
  QueueActivityEvent,
  ServerSocketMessage,
  TestingCenter,
} from './src/types/queue.ts';
import { computeWaitEstimate } from './src/utils/waitTime.ts';
import {
  chatWithQueueAssistant,
  synthesizeVoiceReply,
  transcribeVoiceQuery,
  VoiceTranscriptionError,
  type ChatTurnInput,
} from './server/gemini.ts';

const PORT = Number(process.env.PORT || 3000);

function createSeedCenters(): TestingCenter[] {
  const now = Date.now();

  const makeHistory = (
    startToken: number,
    booths: { id: string; label: string }[],
    durations: number[],
  ): CompletedTokenRecord[] => {
    const records: CompletedTokenRecord[] = [];
    let cursorTime = now - 90_000;
    for (let i = 0; i < durations.length; i++) {
      const booth = booths[i % booths.length];
      const dur = durations[i];
      records.push({
        tokenNumber: startToken - i,
        boothId: booth.id,
        boothLabel: booth.label,
        completedAt: cursorTime,
        durationSec: dur,
        outcome: 'completed',
      });
      cursorTime -= Math.round(dur * 420);
    }
    return records;
  };

  return [
    {
      id: 'central-metro',
      code: 'CTR-01',
      name: 'Central Metro Testing Center',
      cityArea: 'Downtown Civic Complex · Hall B',
      operatingHours: '8:30 AM – 4:30 PM',
      currentToken: 118,
      lastIssuedToken: 146,
      defaultDurationSec: 255,
      booths: [
        {
          id: 'ctr-a',
          label: 'Booth A',
          examinerName: 'M. Nair',
          status: 'active',
          pauseReason: null,
          currentToken: 118,
          tokenStartedAt: now - 115_000,
        },
        {
          id: 'ctr-b',
          label: 'Booth B',
          examinerName: 'R. Alvarez',
          status: 'active',
          pauseReason: null,
          currentToken: 117,
          tokenStartedAt: now - 185_000,
        },
        {
          id: 'ctr-c',
          label: 'Booth C',
          examinerName: 'S. Kulkarni',
          status: 'active',
          pauseReason: null,
          currentToken: 116,
          tokenStartedAt: now - 230_000,
        },
      ],
      skippedTokens: [109, 114],
      completedHistory: makeHistory(
        115,
        [
          { id: 'ctr-a', label: 'Booth A' },
          { id: 'ctr-b', label: 'Booth B' },
          { id: 'ctr-c', label: 'Booth C' },
        ],
        [240, 275, 225, 260, 290, 215, 250, 268, 245, 232],
      ),
      activityFeed: [
        {
          id: 'evt-1',
          timestamp: now - 115_000,
          type: 'called',
          message: 'Token #118 called to Booth A',
          tokenNumber: 118,
          boothLabel: 'Booth A',
        },
        {
          id: 'evt-2',
          timestamp: now - 185_000,
          type: 'called',
          message: 'Token #117 called to Booth B',
          tokenNumber: 117,
          boothLabel: 'Booth B',
        },
        {
          id: 'evt-3',
          timestamp: now - 230_000,
          type: 'called',
          message: 'Token #116 called to Booth C',
          tokenNumber: 116,
          boothLabel: 'Booth C',
        },
        {
          id: 'evt-4',
          timestamp: now - 310_000,
          type: 'skipped',
          message: 'Token #114 marked absent at Booth B (moved to recall pool)',
          tokenNumber: 114,
          boothLabel: 'Booth B',
        },
      ],
      lastUpdatedAt: now,
    },
    {
      id: 'northside-hub',
      code: 'NTH-02',
      name: 'Northside Regional Licensing Hub',
      cityArea: 'North Corridor · Ground Floor Wing 2',
      operatingHours: '9:00 AM – 5:00 PM',
      currentToken: 42,
      lastIssuedToken: 64,
      defaultDurationSec: 285,
      booths: [
        {
          id: 'nth-a',
          label: 'Counter 1',
          examinerName: 'D. Chen',
          status: 'active',
          pauseReason: null,
          currentToken: 42,
          tokenStartedAt: now - 95_000,
        },
        {
          id: 'nth-b',
          label: 'Counter 2',
          examinerName: 'K. Patel',
          status: 'active',
          pauseReason: null,
          currentToken: 41,
          tokenStartedAt: now - 210_000,
        },
      ],
      skippedTokens: [38],
      completedHistory: makeHistory(
        40,
        [
          { id: 'nth-a', label: 'Counter 1' },
          { id: 'nth-b', label: 'Counter 2' },
        ],
        [270, 310, 265, 290, 280, 255, 305, 275],
      ),
      activityFeed: [
        {
          id: 'evt-n1',
          timestamp: now - 95_000,
          type: 'called',
          message: 'Token #42 called to Counter 1',
          tokenNumber: 42,
          boothLabel: 'Counter 1',
        },
        {
          id: 'evt-n2',
          timestamp: now - 210_000,
          type: 'called',
          message: 'Token #41 called to Counter 2',
          tokenNumber: 41,
          boothLabel: 'Counter 2',
        },
      ],
      lastUpdatedAt: now,
    },
    {
      id: 'westgate-hall',
      code: 'WST-03',
      name: 'Westgate Driver Exam Hall',
      cityArea: 'Westgate Transit Annex · Floor 1',
      operatingHours: '8:00 AM – 4:00 PM',
      currentToken: 209,
      lastIssuedToken: 251,
      defaultDurationSec: 220,
      booths: [
        {
          id: 'wst-1',
          label: 'Desk 1',
          examinerName: 'T. Morales',
          status: 'active',
          pauseReason: null,
          currentToken: 209,
          tokenStartedAt: now - 60_000,
        },
        {
          id: 'wst-2',
          label: 'Desk 2',
          examinerName: 'L. Brooks',
          status: 'active',
          pauseReason: null,
          currentToken: 208,
          tokenStartedAt: now - 140_000,
        },
        {
          id: 'wst-3',
          label: 'Desk 3',
          examinerName: 'P. Menon',
          status: 'active',
          pauseReason: null,
          currentToken: 207,
          tokenStartedAt: now - 195_000,
        },
        {
          id: 'wst-4',
          label: 'Desk 4',
          examinerName: 'A. Novak',
          status: 'break',
          pauseReason: 'System calibration (10 min)',
          currentToken: null,
          tokenStartedAt: null,
        },
      ],
      skippedTokens: [201, 204],
      completedHistory: makeHistory(
        206,
        [
          { id: 'wst-1', label: 'Desk 1' },
          { id: 'wst-2', label: 'Desk 2' },
          { id: 'wst-3', label: 'Desk 3' },
        ],
        [210, 235, 195, 220, 240, 205, 215, 230, 210, 225],
      ),
      activityFeed: [
        {
          id: 'evt-w1',
          timestamp: now - 60_000,
          type: 'called',
          message: 'Token #209 called to Desk 1',
          tokenNumber: 209,
          boothLabel: 'Desk 1',
        },
        {
          id: 'evt-w2',
          timestamp: now - 120_000,
          type: 'booth_paused',
          message: 'Desk 4 paused — System calibration (10 min)',
          boothLabel: 'Desk 4',
        },
      ],
      lastUpdatedAt: now,
    },
  ];
}

let centers: TestingCenter[] = createSeedCenters();

function pushActivity(center: TestingCenter, event: Omit<QueueActivityEvent, 'id'>): void {
  const fullEvent: QueueActivityEvent = {
    ...event,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  center.activityFeed = [fullEvent, ...center.activityFeed].slice(0, 25);
}

function getNextWaitingToken(center: TestingCenter): number {
  const servingNums = center.booths
    .map((b) => b.currentToken)
    .filter((n): n is number => n !== null);
  const highestActive = Math.max(center.currentToken, ...servingNums, 0);
  const next = highestActive + 1;
  if (next > center.lastIssuedToken) {
    center.lastIssuedToken = next + 4;
  }
  return next;
}

function recordBoothCompletion(center: TestingCenter, boothId: string, boothLabel: string, prevToken: number, startedAt: number | null, outcome: 'completed' | 'skipped'): void {
  const now = Date.now();
  const rawDuration = startedAt ? Math.round((now - startedAt) / 1000) : center.defaultDurationSec;
  const durationSec = Math.max(45, Math.min(900, rawDuration));
  center.completedHistory = [
    {
      tokenNumber: prevToken,
      boothId,
      boothLabel,
      completedAt: now,
      durationSec,
      outcome,
    },
    ...center.completedHistory,
  ].slice(0, 30);
}

function handleAction(
  msg: ClientSocketMessage,
  sender?: WebSocket,
): { ok: boolean; error?: string } {
  const center = centers.find((c) => c.id === msg.centerId);
  if (!center) {
    return { ok: false, error: 'Testing center not found.' };
  }

  const now = Date.now();

  switch (msg.type) {
    case 'booth:next': {
      const booth = center.booths.find((b) => b.id === msg.boothId);
      if (!booth) return { ok: false, error: 'Booth not found.' };

      if (booth.currentToken !== null) {
        recordBoothCompletion(center, booth.id, booth.label, booth.currentToken, booth.tokenStartedAt, 'completed');
      }

      const nextToken = getNextWaitingToken(center);
      booth.status = 'active';
      booth.pauseReason = null;
      booth.currentToken = nextToken;
      booth.tokenStartedAt = now;
      center.currentToken = Math.max(center.currentToken, nextToken);
      center.lastUpdatedAt = now;

      pushActivity(center, {
        timestamp: now,
        type: 'called',
        message: `Token #${nextToken} called to ${booth.label}`,
        tokenNumber: nextToken,
        boothLabel: booth.label,
      });
      return { ok: true };
    }

    case 'booth:skip': {
      const booth = center.booths.find((b) => b.id === msg.boothId);
      if (!booth) return { ok: false, error: 'Booth not found.' };

      const skippedNum = booth.currentToken;
      if (skippedNum !== null) {
        if (!center.skippedTokens.includes(skippedNum)) {
          center.skippedTokens = [...center.skippedTokens, skippedNum].sort((a, b) => a - b);
        }
        recordBoothCompletion(center, booth.id, booth.label, skippedNum, booth.tokenStartedAt, 'skipped');
        pushActivity(center, {
          timestamp: now,
          type: 'skipped',
          message: `Token #${skippedNum} marked absent at ${booth.label} (moved to recall pool)`,
          tokenNumber: skippedNum,
          boothLabel: booth.label,
        });
      }

      const nextToken = getNextWaitingToken(center);
      booth.status = 'active';
      booth.pauseReason = null;
      booth.currentToken = nextToken;
      booth.tokenStartedAt = now;
      center.currentToken = Math.max(center.currentToken, nextToken);
      center.lastUpdatedAt = now;

      pushActivity(center, {
        timestamp: now,
        type: 'called',
        message: `Token #${nextToken} called to ${booth.label}`,
        tokenNumber: nextToken,
        boothLabel: booth.label,
      });
      return { ok: true };
    }

    case 'booth:recall': {
      const booth = center.booths.find((b) => b.id === msg.boothId);
      if (!booth) return { ok: false, error: 'Booth not found.' };
      if (!center.skippedTokens.includes(msg.tokenNumber)) {
        return { ok: false, error: `Token #${msg.tokenNumber} is no longer in the recall pool.` };
      }

      if (booth.currentToken !== null) {
        recordBoothCompletion(center, booth.id, booth.label, booth.currentToken, booth.tokenStartedAt, 'completed');
      }

      center.skippedTokens = center.skippedTokens.filter((t) => t !== msg.tokenNumber);
      booth.status = 'active';
      booth.pauseReason = null;
      booth.currentToken = msg.tokenNumber;
      booth.tokenStartedAt = now;
      center.lastUpdatedAt = now;

      pushActivity(center, {
        timestamp: now,
        type: 'recalled',
        message: `Skipped Token #${msg.tokenNumber} recalled to ${booth.label}`,
        tokenNumber: msg.tokenNumber,
        boothLabel: booth.label,
      });
      return { ok: true };
    }

    case 'booth:toggle_pause': {
      const booth = center.booths.find((b) => b.id === msg.boothId);
      if (!booth) return { ok: false, error: 'Booth not found.' };

      if (booth.status === 'active') {
        if (booth.currentToken !== null) {
          recordBoothCompletion(center, booth.id, booth.label, booth.currentToken, booth.tokenStartedAt, 'completed');
        }
        booth.status = 'break';
        booth.pauseReason = msg.reason?.trim() || 'Short break';
        booth.currentToken = null;
        booth.tokenStartedAt = null;
        center.lastUpdatedAt = now;

        pushActivity(center, {
          timestamp: now,
          type: 'booth_paused',
          message: `${booth.label} paused — ${booth.pauseReason}`,
          boothLabel: booth.label,
        });
      } else {
        const nextToken = getNextWaitingToken(center);
        booth.status = 'active';
        booth.pauseReason = null;
        booth.currentToken = nextToken;
        booth.tokenStartedAt = now;
        center.currentToken = Math.max(center.currentToken, nextToken);
        center.lastUpdatedAt = now;

        pushActivity(center, {
          timestamp: now,
          type: 'booth_resumed',
          message: `${booth.label} resumed and called Token #${nextToken}`,
          tokenNumber: nextToken,
          boothLabel: booth.label,
        });
      }
      return { ok: true };
    }

    case 'token:issue': {
      const issued = center.lastIssuedToken + 1;
      center.lastIssuedToken = issued;
      center.lastUpdatedAt = now;
      pushActivity(center, {
        timestamp: now,
        type: 'issued',
        message: `New walk-in Token #${issued} issued at reception`,
        tokenNumber: issued,
      });

      if (sender && sender.readyState === WebSocket.OPEN) {
        const ack: ServerSocketMessage = {
          type: 'token:issued_ack',
          centerId: center.id,
          tokenNumber: issued,
          requestId: msg.requestId,
        };
        sender.send(JSON.stringify(ack));
      }
      return { ok: true };
    }

    case 'sighting:report': {
      const reported = Math.floor(msg.tokenNumber);
      if (!Number.isFinite(reported) || reported < 1 || reported > 9999) {
        return { ok: false, error: 'Please enter a valid token number (1–9999).' };
      }

      const prevCurrent = center.currentToken;
      if (reported > prevCurrent) {
        // Record synthetic completion step so pace reflects real progression
        const targetBooth =
          center.booths.find((b) => b.label === msg.boothLabel && b.status === 'active') ||
          center.booths.find((b) => b.status === 'active');

        if (targetBooth) {
          if (targetBooth.currentToken !== null) {
            recordBoothCompletion(
              center,
              targetBooth.id,
              targetBooth.label,
              targetBooth.currentToken,
              targetBooth.tokenStartedAt,
              'completed',
            );
          }
          targetBooth.currentToken = reported;
          targetBooth.tokenStartedAt = now;
        }
        center.currentToken = reported;
        if (reported >= center.lastIssuedToken) {
          center.lastIssuedToken = reported + 12;
        }
      } else {
        center.currentToken = reported;
      }

      center.lastUpdatedAt = now;
      pushActivity(center, {
        timestamp: now,
        type: 'crowd_sighting',
        message: `Candidate update: Token #${reported} reported on hall display${msg.boothLabel ? ` (${msg.boothLabel})` : ''}`,
        tokenNumber: reported,
        boothLabel: msg.boothLabel,
      });
      return { ok: true };
    }

    case 'center:reset': {
      const fresh = createSeedCenters().find((c) => c.id === msg.centerId);
      if (fresh) {
        centers = centers.map((c) => (c.id === msg.centerId ? fresh : c));
      }
      return { ok: true };
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', serverTime: Date.now(), centerCount: centers.length });
  });

  app.get('/api/centers', (_req, res) => {
    res.json({ centers, serverTime: Date.now() });
  });

  app.get('/api/centers/:id/estimate', (req, res) => {
    const center = centers.find((c) => c.id === req.params.id);
    if (!center) {
      res.status(404).json({ error: 'Testing center not found' });
      return;
    }
    const tokenNumber = Number(req.query.token);
    if (!Number.isFinite(tokenNumber) || tokenNumber < 1) {
      res.status(400).json({ error: 'Valid token query parameter required' });
      return;
    }
    res.json({
      estimate: computeWaitEstimate(center, Math.floor(tokenNumber), Date.now()),
      serverTime: Date.now(),
    });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, history, centerId, trackedToken } = req.body as {
        message?: string;
        history?: ChatTurnInput[];
        centerId?: string;
        trackedToken?: number | null;
      };

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: 'A message is required.' });
        return;
      }

      const reply = await chatWithQueueAssistant({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        centers,
        selectedCenterId: typeof centerId === 'string' ? centerId : centers[0]?.id || '',
        trackedToken: typeof trackedToken === 'number' ? trackedToken : null,
      });

      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach assistant.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/voice/transcribe', async (req, res) => {
    try {
      const { base64Audio, mimeType } = req.body as {
        base64Audio?: string;
        mimeType?: string;
      };

      if (!base64Audio || typeof base64Audio !== 'string') {
        res.status(400).json({ error: 'Audio payload is required.' });
        return;
      }

      const transcript = await transcribeVoiceQuery({
        base64Audio,
        mimeType: typeof mimeType === 'string' ? mimeType : 'audio/webm',
      });

      res.json({ transcript });
    } catch (err) {
      const status = err instanceof VoiceTranscriptionError ? err.statusCode : 500;
      const msg = err instanceof Error ? err.message : 'Unable to transcribe audio.';
      console.error(`[api/voice/transcribe] error (status=${status}): ${msg}`);
      res.status(status).json({ error: msg });
    }
});
  app.post('/api/voice/speak', async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'Text is required for speech output.' });
        return;
      }

      const audioBase64 = await synthesizeVoiceReply(text);
      res.json({ audioBase64, mimeType: 'audio/wav' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate voice reply.';
      res.status(500).json({ error: msg });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastState = () => {
    const payload: ServerSocketMessage = {
      type: 'state:sync',
      centers,
      serverTime: Date.now(),
    };
    const serialized = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };

  wss.on('connection', (ws) => {
    const initPayload: ServerSocketMessage = {
      type: 'state:sync',
      centers,
      serverTime: Date.now(),
    };
    ws.send(JSON.stringify(initPayload));

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ClientSocketMessage;
        const result = handleAction(parsed, ws);
        if (!result.ok) {
          const errPayload: ServerSocketMessage = {
            type: 'action:error',
            message: result.error || 'Action failed',
          };
          ws.send(JSON.stringify(errPayload));
          return;
        }
        broadcastState();
      } catch {
        const errPayload: ServerSocketMessage = {
          type: 'action:error',
          message: 'Invalid message format',
        };
        ws.send(JSON.stringify(errPayload));
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`DriveLine server running on ${url}`);

  if (process.env.NODE_ENV !== 'production' && !process.env.CI && !process.env.NO_OPEN) {
    if (process.platform === 'win32') {
      exec(`cmd /c start "" "${url}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${url}"`);
    }
  }
});
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

