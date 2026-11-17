import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Content, GenerateContentResponse } from '@google/genai';
import type { TestingCenter } from '../src/types/queue.ts';
import {
  computeAvgServiceSec,
  computeWaitEstimate,
  formatClockTime,
  formatDurationCompact,
  formatServiceDuration,
} from '../src/utils/waitTime.ts';

export interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

let cachedClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function buildLiveQueueSystemInstruction(
  centers: TestingCenter[],
  selectedCenterId: string,
  trackedToken: number | null,
): string {
  const now = Date.now();
  const activeCenter = centers.find((c) => c.id === selectedCenterId) || centers[0];

  const centersSummary = centers
    .map((center) => {
      const avgSec = computeAvgServiceSec(center);
      const activeBooths = center.booths.filter((b) => b.status === 'active');
      const boothsText = center.booths
        .map((b) => {
          if (b.status === 'break') {
            return `${b.label} (Examiner ${b.examinerName}): PAUSED (${b.pauseReason || 'Break'})`;
          }
          const elapsedSec = b.tokenStartedAt ? Math.max(0, Math.floor((now - b.tokenStartedAt) / 1000)) : 0;
          return `${b.label} (Examiner ${b.examinerName}): Serving Token #${b.currentToken ?? 'None'} (${formatServiceDuration(elapsedSec)} inside so far)`;
        })
        .join('; ');

      const skippedText =
        center.skippedTokens.length > 0
          ? center.skippedTokens.map((t) => `#${t}`).join(', ')
          : 'None';

      return [
        `- ${center.name} (${center.code}, ${center.cityArea}, hours: ${center.operatingHours}):`,
        `  Latest token called: #${center.currentToken}, Last issued walk-in slip: #${center.lastIssuedToken}`,
        `  Active booths: ${activeBooths.length} of ${center.booths.length}, Avg exam time: ${formatServiceDuration(avgSec)}`,
        `  Booth details: ${boothsText}`,
        `  Skipped / recall pool: ${skippedText}`,
      ].join('\n');
    })
    .join('\n\n');

  let trackedSummary = 'The candidate has not entered a personal token number yet.';
  if (activeCenter && trackedToken !== null) {
    const est = computeWaitEstimate(activeCenter, trackedToken, now);
    trackedSummary = [
      `The candidate is currently tracking Token #${trackedToken} at ${activeCenter.name} (${activeCenter.code}).`,
      `Stage: ${est.stage}.`,
      `Tokens ahead: ${est.tokensAhead}.`,
      `Estimated wait time: ${formatDurationCompact(est.estimatedWaitSec)}.`,
      `Expected call time: ${est.stage === 'serving' ? 'Now (In Booth ' + (est.assignedBoothLabel || '') + ')' : formatClockTime(est.estimatedCallTime)}.`,
    ].join(' ');
  }

  return [
    'You are the DriveLine Queue & Learner Driving Test Voice Assistant.',
    'Your role is to help candidates waiting at a driving testing center quickly understand live token numbers, which token is inside which booth, estimated wait times, skipped/recall status, and learner driving test preparation (documents needed and basic road-sign rules).',
    '',
    'Response style rules:',
    '- Be concise, warm, clear, and direct (2 to 4 short sentences unless the user asks for detailed steps).',
    '- Write naturally for both reading and spoken voice playback: avoid markdown asterisks, tables, bullet symbols, or code formatting.',
    '- Always cite exact live numbers from the snapshot below when answering about tokens, booths, or wait times.',
    '- If the user asks about a specific token number other than their tracked token, calculate or estimate its position relative to the latest token called and effective pace (~1.5 to 2 minutes per token across active booths, or exact wait based on active booth count and average exam time).',
    '- If the user has not set a token yet and asks about "my token", politely tell them the current token inside and remind them they can enter or tell you their slip number.',
    '',
    `Current selected center: ${activeCenter ? `${activeCenter.name} (${activeCenter.code})` : 'Unknown'}`,
    `Candidate tracked token status: ${trackedSummary}`,
    `Current local server time: ${formatClockTime(now)}`,
    '',
    'Live Testing Centers Snapshot:',
    centersSummary,
  ].join('\n');
}

export async function chatWithQueueAssistant(params: {
  message: string;
  history: ChatTurnInput[];
  centers: TestingCenter[];
  selectedCenterId: string;
  trackedToken: number | null;
}): Promise<string> {
  const ai = getAiClient();
  const systemInstruction = buildLiveQueueSystemInstruction(
    params.centers,
    params.selectedCenterId,
    params.trackedToken,
  );

  const formattedHistory: Content[] = params.history
    .filter((turn) => turn.text.trim().length > 0)
    .slice(-16)
    .map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

  const chat = ai.chats.create({
    model: 'gemini-4-hydrogen',
    history: formattedHistory,
    config: {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
    },
  });

  const response = await chat.sendMessage({
    message: params.message,
  });

  const reply = response.text?.trim();
  if (!reply) {
    throw new Error('Assistant returned an empty response.');
  }
  return reply;
}

function extractTranscriptFromResponse(response: GenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];

  const audioTranscriptParts = parts
    .map((part) => part.audioTranscription?.text)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

  if (audioTranscriptParts.length > 0) {
    return audioTranscriptParts.map((t) => t.trim()).join(' ').trim();
  }

  const textParts = parts
    .filter((part) => typeof part.text === 'string' && part.thought !== true)
    .map((part) => part.text as string);

  return textParts.join('').trim();
}

function getErrorStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) {
    return err.status;
  }
  if (err instanceof Error) {
    if (err.message.includes('503') || err.message.includes('UNAVAILABLE')) return 503;
    if (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')) return 429;
  }
  return undefined;
}

function isTransientError(err: unknown): boolean {
  const status = getErrorStatus(err);
  return status === 503 || status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VoiceTranscriptionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function transcribeVoiceQuery(params: {
  base64Audio: string;
  mimeType: string;
}): Promise<string> {
  const ai = getAiClient();
  const mimeType = params.mimeType || 'audio/webm';
  const approxBytes = Math.round((params.base64Audio.length * 3) / 4);

  let transcript = '';
  let lastError: unknown = null;

  // Primary attempt: gemini-3.5-transcribe (extracting Part.audioTranscription directly)
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: params.base64Audio,
            },
          },
          {
            text: 'Transcribe this audio.',
          },
        ],
      },
    });
    transcript = extractTranscriptFromResponse(response);
    if (transcript) {
      return transcript;
    }
    console.warn(
      `[voice/transcribe] gemini-3.5-transcribe returned empty transcript (mime=${mimeType}, bytes=${approxBytes}); trying fallback.`,
    );
  } catch (err) {
    lastError = err;
    const status = getErrorStatus(err);
    console.warn(
      `[voice/transcribe] gemini-3.5-transcribe failed (status=${status ?? 'unknown'}, mime=${mimeType}, bytes=${approxBytes}); trying fallback.`,
    );
  }

  // Fallback: gemini-4-hydrogen (with one short retry if transient 503/429 occurs)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: params.base64Audio,
              },
            },
            {
              text: 'Transcribe the exact spoken words from this audio clip in plain text. Return only the transcript with no commentary.',
            },
          ],
        },
      });
      transcript = extractTranscriptFromResponse(fallbackResponse);
      if (transcript) {
        return transcript;
      }
      console.warn(
        `[voice/transcribe] gemini-4-hydrogen fallback returned empty transcript (attempt=${attempt}, mime=${mimeType}, bytes=${approxBytes}).`,
      );
      break;
    } catch (err) {
      lastError = err;
      const status = getErrorStatus(err);
      console.warn(
        `[voice/transcribe] gemini-4-hydrogen fallback failed (attempt=${attempt}, status=${status ?? 'unknown'}, mime=${mimeType}, bytes=${approxBytes}).`,
      );
      if (attempt === 1 && isTransientError(err)) {
        await sleep(800);
        continue;
      }
      break;
    }
  }

  if (lastError) {
    const status = getErrorStatus(lastError);
    if (status === 503 || status === 429) {
      throw new VoiceTranscriptionError(
        'Voice transcription service is temporarily busy (503). Please try again in a few seconds or type your question.',
        503,
      );
    }
    const safeMsg = lastError instanceof Error ? lastError.message : 'Unable to transcribe audio.';
    throw new VoiceTranscriptionError(safeMsg, status ?? 500);
  }

  return '';
}

export async function synthesizeVoiceReply(text: string): Promise<string> {
  const ai = getAiClient();

  // Strip any stray markdown characters so TTS speaks naturally
  const cleanText = text.replace(/[*_`#]/g, '').trim().slice(0, 1200);

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: {
              style: 'Warm, calm, helpful civic queue assistant',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Speech generation did not return audio data.');
  }
  return base64Audio;
}
