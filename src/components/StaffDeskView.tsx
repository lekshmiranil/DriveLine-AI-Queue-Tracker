import React, { useState } from 'react';
import {
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Ticket,
  UserPlus,
} from 'lucide-react';
import type { ClientSocketMessage, TestingCenter } from '../types/queue';
import { formatElapsedTimer } from '../utils/waitTime';

interface StaffDeskViewProps {
  center: TestingCenter;
  centers: TestingCenter[];
  onSelectCenter: (centerId: string) => void;
  now: number;
  onSendAction: (msg: ClientSocketMessage) => boolean;
}

export const StaffDeskView: React.FC<StaffDeskViewProps> = ({
  center,
  centers,
  onSelectCenter,
  now,
  onSendAction,
}) => {
  const [pauseReasonInput, setPauseReasonInput] = useState<string>('Short break (10 min)');
  const [recallBoothId, setRecallBoothId] = useState<string>(center.booths[0]?.id || '');

  const activeBooth = center.booths.find((b) => b.id === recallBoothId) || center.booths[0];

  return (
    <section aria-label="Staff and counter operator console" className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              Testing Desk Operator Console
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Advance tokens, skip absent candidates, or pause booths. Changes broadcast immediately to all waiting candidates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Select testing center for desk operations"
              value={center.id}
              onChange={(e) => onSelectCenter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3.5 py-2 min-h-[42px] text-sm font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onSendAction({ type: 'token:issue', centerId: center.id })}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[42px] bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              <Ticket className="w-4 h-4" />
              Issue Slip #{center.lastIssuedToken + 1}
            </button>

            <button
              type="button"
              onClick={() => onSendAction({ type: 'center:reset', centerId: center.id })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Queue
            </button>
          </div>
        </div>

        {/* Booth Action Grid */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {center.booths.map((booth) => {
            const isActive = booth.status === 'active';
            return (
              <div
                key={booth.id}
                className={`border rounded-xl p-5 flex flex-col justify-between ${
                  isActive ? 'bg-slate-50/70 border-slate-200' : 'bg-amber-50/50 border-amber-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900 font-display">
                      {booth.label}
                    </h2>
                    <span
                      className={`text-xs font-semibold ${
                        isActive ? 'text-emerald-700' : 'text-amber-800'
                      }`}
                    >
                      {isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Examiner {booth.examinerName}
                  </p>

                  <div className="mt-5 py-4 px-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500">Current Token</p>
                      <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-0.5">
                        {booth.currentToken !== null ? `#${booth.currentToken}` : '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Elapsed</p>
                      <p className="font-mono text-base font-semibold text-slate-700 tabular-nums mt-0.5">
                        {isActive ? formatElapsedTimer(booth.tokenStartedAt, now) : 'Break'}
                      </p>
                    </div>
                  </div>

                  {!isActive && booth.pauseReason && (
                    <p className="mt-2.5 text-xs text-amber-900">
                      Reason: {booth.pauseReason}
                    </p>
                  )}
                </div>

                <div className="mt-5 space-y-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onSendAction({
                        type: 'booth:next',
                        centerId: center.id,
                        boothId: booth.id,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <span>Call Next Token</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!isActive || booth.currentToken === null}
                      onClick={() =>
                        onSendAction({
                          type: 'booth:skip',
                          centerId: center.id,
                          boothId: booth.id,
                        })
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] bg-white hover:bg-slate-100 disabled:opacity-45 disabled:pointer-events-none border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      Skip Absent
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onSendAction({
                          type: 'booth:toggle_pause',
                          centerId: center.id,
                          boothId: booth.id,
                          reason: pauseReasonInput,
                        })
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                    >
                      {isActive ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          Pause Booth
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          Resume
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Break reason & Skipped Recall Controls */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label htmlFor="pause-reason-input" className="block text-sm font-semibold text-slate-900">
              Default Break Reason (when pausing a booth)
            </label>
            <input
              id="pause-reason-input"
              type="text"
              value={pauseReasonInput}
              onChange={(e) => setPauseReasonInput(e.target.value)}
              placeholder="e.g. Lunch break (20 min)"
              className="mt-2 w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 min-h-[42px] text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Recall Skipped Tokens
              </p>
              <select
                aria-label="Target booth for recall"
                value={activeBooth?.id || ''}
                onChange={(e) => setRecallBoothId(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800"
              >
                {center.booths.map((b) => (
                  <option key={b.id} value={b.id}>
                    Assign to {b.label}
                  </option>
                ))}
              </select>
            </div>

            {center.skippedTokens.length === 0 ? (
              <p className="mt-2.5 text-xs text-slate-500">
                No skipped tokens waiting in the recall pool.
              </p>
            ) : (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {center.skippedTokens.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => {
                      if (activeBooth) {
                        onSendAction({
                          type: 'booth:recall',
                          centerId: center.id,
                          boothId: activeBooth.id,
                          tokenNumber: tok,
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-300 text-slate-900 font-mono text-xs font-semibold rounded-lg transition-colors tabular-nums"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-blue-700" />
                    Recall #{tok}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
