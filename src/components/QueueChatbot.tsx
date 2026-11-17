import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  RotateCcw,
  Send,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import assistantAvatarImg from '../assets/images/queue_assistant_avatar_1794767824662.jpg';
import type { TestingCenter } from '../types/queue';
import { formatClockTime } from '../utils/waitTime';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  viaVoice?: boolean;
}

interface QueueChatbotProps {
  messages: ChatMessageItem[];
  onAddMessage: (msg: ChatMessageItem) => void;
  onClearMessages: () => void;
  selectedCenter: TestingCenter | null;
  trackedToken: number | null;
  variant?: 'embedded' | 'full';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function normalizeAudioForTranscription(
  blob: Blob,
  fallbackMime: string,
): Promise<{ base64Audio: string; mimeType: string }> {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const rawBuffer = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(rawBuffer);
      await ctx.close();

      const targetRate = 16000;
      const offline = new OfflineAudioContext(
        1,
        Math.max(1, Math.ceil(decoded.duration * targetRate)),
        targetRate,
      );
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0);
      const rendered = await offline.startRendering();
      const monoSamples = rendered.getChannelData(0);
      const wavBuffer = encodeWavFromFloat32(monoSamples, targetRate);
      return {
        base64Audio: arrayBufferToBase64(wavBuffer),
        mimeType: 'audio/wav',
      };
    }
  } catch {
    // Fallback to original recorded container
  }

  return {
    base64Audio: await blobToBase64(blob),
    mimeType: fallbackMime,
  };
}

function pickSupportedRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export const QueueChatbot: React.FC<QueueChatbotProps> = ({
  messages,
  onAddMessage,
  onClearMessages,
  selectedCenter,
  trackedToken,
  variant = 'embedded',
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const renderAssistantAvatar = (sizeClass: string) =>
    !avatarFailed ? (
      <img
        src={assistantAvatarImg}
        alt="DriveLine Queue Assistant avatar"
        referrerPolicy="no-referrer"
        onError={() => setAvatarFailed(true)}
        className={`${sizeClass} rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0`}
      />
    ) : (
      <div
        aria-hidden="true"
        className={`${sizeClass} rounded-full bg-blue-700 text-white font-display font-bold text-xs flex items-center justify-center shrink-0`}
      >
        DL
      </div>
    );

  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesRef = useRef<ChatMessageItem[]>(messages);

  messagesRef.current = messages;

  const quickPrompts = [
    'Which token is inside right now?',
    trackedToken !== null
      ? `How long will it take for token ${trackedToken}?`
      : 'How fast is the queue moving today?',
    'Are any booths on break?',
    'What documents do I need?',
  ];

  // Scroll only the internal chat thread container to latest message
  useEffect(() => {
    const el = threadContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isSending, isTranscribing]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
      cleanupRecorder();
    };
  }, []);

  const stopAudioPlayback = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
    setLoadingAudioId(null);
  };

  const cleanupRecorder = () => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const speakMessage = async (msgId: string, text: string) => {
    if (speakingMessageId === msgId) {
      stopAudioPlayback();
      return;
    }

    stopAudioPlayback();
    setLoadingAudioId(msgId);

    try {
      const res = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = (await res.json()) as { audioBase64?: string; mimeType?: string; error?: string };
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || 'Voice playback unavailable.');
      }

      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      activeAudioRef.current = audio;
      setLoadingAudioId(null);
      setSpeakingMessageId(msgId);

      audio.onended = () => {
        if (activeAudioRef.current === audio) {
          activeAudioRef.current = null;
        }
        setSpeakingMessageId(null);
      };

      audio.onerror = () => {
        if (activeAudioRef.current === audio) {
          activeAudioRef.current = null;
        }
        setSpeakingMessageId(null);
      };

      await audio.play();
    } catch {
      setLoadingAudioId(null);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.onend = () => setSpeakingMessageId(null);
          utterance.onerror = () => setSpeakingMessageId(null);
          setSpeakingMessageId(msgId);
          window.speechSynthesis.speak(utterance);
          return;
        } catch {
          // Ignore synthesis fallback failure
        }
      }
      setSpeakingMessageId(null);
    }
  };

  const sendMessage = async (rawText: string, viaVoice = false) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    setErrorMsg(null);
    stopAudioPlayback();

    const historySnapshot = messagesRef.current.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const userMessage: ChatMessageItem = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
      viaVoice,
    };

    onAddMessage(userMessage);
    setInputText('');
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historySnapshot,
          centerId: selectedCenter?.id,
          trackedToken,
        }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Could not get a response from the assistant.');
      }

      const modelMessage: ChatMessageItem = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'model',
        text: data.reply,
        timestamp: Date.now(),
      };

      onAddMessage(modelMessage);
      setIsSending(false);

      if (autoSpeak || viaVoice) {
        void speakMessage(modelMessage.id, modelMessage.text);
      }
    } catch (err) {
      setIsSending(false);
      setErrorMsg(err instanceof Error ? err.message : 'Assistant request failed.');
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);
    stopAudioPlayback();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg('Voice recording is not supported in this browser. Type your question below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedType });
        cleanupRecorder();
        setIsRecording(false);
        setRecordingSeconds(0);

        if (blob.size < 400) {
          setErrorMsg('Recording was too short. Tap the mic, speak clearly, then tap Stop.');
          return;
        }

        setIsTranscribing(true);
        try {
          const cleanMime = recordedType.split(';')[0] || 'audio/webm';
          const { base64Audio, mimeType: uploadMime } = await normalizeAudioForTranscription(
            blob,
            cleanMime,
          );
          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64Audio,
              mimeType: uploadMime,
            }),
          });

          const data = (await res.json()) as { transcript?: string; error?: string };
          if (!res.ok) {
            throw new Error(data.error || 'Could not transcribe voice recording.');
          }

          const transcript = (data.transcript || '').trim();
          setIsTranscribing(false);

          if (!transcript) {
            setErrorMsg('No speech detected. Try speaking closer to your microphone.');
            return;
          }

          await sendMessage(transcript, true);
        } catch (err) {
          setIsTranscribing(false);
          setErrorMsg(err instanceof Error ? err.message : 'Voice transcription failed.');
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      cleanupRecorder();
      setIsRecording(false);
      const errName = err instanceof DOMException ? err.name : '';
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setErrorMsg('No microphone device was detected. Connect a microphone or type your question below.');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setErrorMsg('Your microphone is currently in use by another app. Close it and try again, or type below.');
      } else {
        setErrorMsg('Microphone permission was denied. Allow microphone access in your browser, reload, and try again.');
      }
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupRecorder();
      setIsRecording(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(inputText, false);
  };

  const handleClear = () => {
    stopAudioPlayback();
    setErrorMsg(null);
    onClearMessages();
  };

  const heightClass =
    variant === 'full' ? 'h-[calc(100vh-11rem)] min-h-[520px]' : 'h-[520px]';

  return (
    <section
      aria-label="Queue Voice and Text Chatbot"
      className={`bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden ${heightClass}`}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {renderAssistantAvatar('w-10 h-10')}
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 font-display truncate">
              Queue Voice &amp; Chat Assistant
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5 tabular-nums">
              {selectedCenter ? `${selectedCenter.name} (${selectedCenter.code})` : 'Live Queue'}
              {trackedToken !== null ? ` · Tracking Token #${trackedToken}` : ' · Ask about any token'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (autoSpeak) stopAudioPlayback();
              setAutoSpeak((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
              autoSpeak
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{autoSpeak ? 'Voice Replies On' : 'Voice Muted'}</span>
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Chat Thread */}
      <div
        ref={threadContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50/40"
      >
        {/* Welcome / Persistent Intro Message */}
        <div className="flex items-start gap-2.5">
          {renderAssistantAvatar('w-7 h-7 mt-1')}
          <div className="flex flex-col items-start min-w-0">
            <div className="max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-white border border-slate-200 text-slate-900">
              <p>
                Hi! Ask me by voice or text about which token is inside right now, your estimated wait time, active booths, or documents to bring. All your questions and answers stay saved here.
              </p>
            </div>
            <span className="mt-1.5 px-1 text-[11px] text-slate-400">
              Assistant · Ready
            </span>
          </div>
        </div>

        {/* Conversation History */}
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isSpeaking = speakingMessageId === msg.id;
          const isLoadingVoice = loadingAudioId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'items-start gap-2.5'}`}
            >
              {!isUser && renderAssistantAvatar('w-7 h-7 mt-1')}
              <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-blue-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>

                <div className="mt-1.5 flex items-center gap-3 px-1">
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {isUser ? (msg.viaVoice ? 'You (Voice)' : 'You') : 'Assistant'} ·{' '}
                    {formatClockTime(msg.timestamp)}
                  </span>

                  {!isUser && (
                    <button
                      type="button"
                      onClick={() => void speakMessage(msg.id, msg.text)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 py-1 px-1.5 rounded transition-colors"
                    >
                      {isSpeaking ? (
                        <>
                          <Square className="w-3 h-3 fill-current" />
                          <span>Stop</span>
                        </>
                      ) : isLoadingVoice ? (
                        <span>Loading voice...</span>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {(isTranscribing || isSending) && (
          <div className="flex items-start gap-2.5">
            {renderAssistantAvatar('w-7 h-7 mt-1')}
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-medium text-slate-600">
              {isTranscribing ? 'Transcribing your voice...' : 'Checking live queue & replying...'}
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompts Strip (always accessible without hiding history) */}
      <div className="px-6 py-2.5 border-t border-slate-100 bg-white flex items-center gap-2 overflow-x-auto shrink-0">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isSending || isTranscribing || isRecording}
            onClick={() => void sendMessage(prompt, false)}
            className="px-3 py-1.5 min-h-[34px] bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Inline Error Banner */}
      {errorMsg && (
        <div className="mx-6 mb-2 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-start justify-between gap-2 shrink-0">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-800 font-semibold shrink-0 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active Recording Indicator */}
      {isRecording && (
        <div className="mx-6 mb-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-900 tabular-nums">
              Recording voice... 0:{String(recordingSeconds).padStart(2, '0')}
            </span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop &amp; Send
          </button>
        </div>
      )}

      {/* Message & Voice Composer */}
      <form
        onSubmit={handleFormSubmit}
        className="px-6 py-4 border-t border-slate-200 bg-white flex items-center gap-2.5 shrink-0"
      >
        <button
          type="button"
          disabled={isTranscribing || isSending}
          onClick={() => (isRecording ? stopRecording() : void startRecording())}
          aria-label={isRecording ? 'Stop recording voice question' : 'Ask with voice'}
          title={isRecording ? 'Stop & send voice' : 'Tap to speak'}
          className={`min-h-[44px] px-3.5 rounded-xl inline-flex items-center justify-center gap-2 text-xs font-semibold transition-colors shrink-0 ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span className="hidden sm:inline">Speak</span>
            </>
          )}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isRecording || isTranscribing || isSending}
          placeholder={
            isRecording
              ? 'Listening to your voice question...'
              : 'Type or speak a question about your token...'
          }
          className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!inputText.trim() || isRecording || isTranscribing || isSending}
          aria-label="Send message"
          className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-45 disabled:pointer-events-none text-white inline-flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </section>
  );
};
