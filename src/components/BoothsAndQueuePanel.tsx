import React from 'react';
import { CheckCircle2, Clock, PauseCircle, UserCheck } from 'lucide-react';
import type { TestingCenter } from '../types/queue';
import {
  computeWaitEstimate,
  formatClockTime,
  formatDurationCompact,
  formatElapsedTimer,
  formatServiceDuration,
} from '../utils/waitTime';

interface BoothsAndQueuePanelProps {
  center: TestingCenter;
  now: number;
  trackedToken: number | null;
  onSelectTokenToTrack: (token: number) => void;
}

export const BoothsAndQueuePanel: React.FC<BoothsAndQueuePanelProps> = ({
  center,
  now,
  trackedToken,
  onSelectTokenToTrack,
}) => {
  const highestServing = Math.max(
    center.currentToken,
    ...center.booths.map((b) => b.currentToken ?? 0),
  );

  // Build upcoming 8 tokens schedule
  const upcomingTokens = Array.from({ length: 8 }, (_, idx) => {
    const tokenNum = highestServing + idx + 1;
    const est = computeWaitEstimate(center, tokenNum, now);
    return est;
  });

  return (
    <section aria-label="Booth monitor and upcoming token schedule" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 7 columns: Upcoming Token Timetable & Booth Breakdown */}
      <div className="lg:col-span-7 space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-display">
                Upcoming Token Call Schedule
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Live expected call times for the next 8 tokens · Click any row to track it
              </p>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              Updated {formatClockTime(center.lastUpdatedAt)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-6">Token</th>
                  <th className="py-3 px-4">Queue Position</th>
                  <th className="py-3 px-4">Est. Wait</th>
                  <th className="py-3 px-6 text-right">Expected Call</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {upcomingTokens.map((item) => {
                  const isMine = trackedToken === item.tokenNumber;
                  return (
                    <tr
                      key={item.tokenNumber}
                      onClick={() => onSelectTokenToTrack(item.tokenNumber)}
                      className={`cursor-pointer transition-colors ${
                        isMine
                          ? 'bg-blue-50/80 hover:bg-blue-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3.5 px-6 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        #{item.tokenNumber}
                        {isMine && (
                          <span className="ml-2 font-sans text-xs font-semibold text-blue-700">
                            (Your slip)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 tabular-nums whitespace-nowrap">
                        {item.tokensAhead === 1 ? 'Next up' : `${item.tokensAhead} ahead`}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-800 tabular-nums whitespace-nowrap">
                        {formatDurationCompact(item.estimatedWaitSec)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {formatClockTime(item.estimatedCallTime)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* All Booths Status */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 font-display">
              Testing Booths &amp; Counters
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Which token is currently inside each counter and elapsed exam duration
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {center.booths.map((booth) => (
              <div
                key={booth.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      booth.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {booth.status === 'active' ? (
                      <UserCheck className="w-5 h-5" />
                    ) : (
                      <PauseCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {booth.label}{' '}
                      <span className="font-normal text-slate-500">
                        · Examiner {booth.examinerName}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {booth.status === 'active'
                        ? 'Active · Conducting learner theory & sign exam'
                        : `Paused · ${booth.pauseReason || 'Short break'}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Serving</p>
                    <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                      {booth.currentToken !== null ? `#${booth.currentToken}` : '—'}
                    </p>
                  </div>
                  <div className="text-right min-w-[64px]">
                    <p className="text-xs text-slate-500">Elapsed</p>
                    <p className="font-mono text-sm font-semibold text-slate-700 tabular-nums">
                      {booth.status === 'active'
                        ? formatElapsedTimer(booth.tokenStartedAt, now)
                        : 'Paused'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right 5 columns: Recent Pace History, Skipped Recall Pool & Live Feed */}
      <div className="lg:col-span-5 space-y-6">
        {/* Skipped / Recall Pool */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-base font-bold text-slate-900 font-display">
            Skipped &amp; Recall Pool
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Candidates who stepped out when called. Check in with the desk to be reassigned.
          </p>

          {center.skippedTokens.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              No skipped tokens right now. Everyone called has checked into a booth.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {center.skippedTokens.map((tok) => (
                <button
                  key={tok}
                  type="button"
                  onClick={() => onSelectTokenToTrack(tok)}
                  className={`px-3.5 py-2 min-h-[40px] font-mono text-sm font-semibold rounded-lg border transition-colors tabular-nums ${
                    trackedToken === tok
                      ? 'bg-red-50 border-red-300 text-red-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  #{tok}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Completed Durations */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Recent Completed Exams
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real exam durations powering your wait estimate
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {center.completedHistory.slice(0, 5).map((rec) => (
              <div
                key={`${rec.tokenNumber}-${rec.completedAt}`}
                className="px-6 py-3 flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    #{rec.tokenNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    {rec.boothLabel} <span aria-hidden="true">·</span> {rec.outcome === 'skipped' ? 'Absent' : 'Finished'}
                  </span>
                </div>
                <span className="font-mono text-xs font-medium text-slate-700 tabular-nums">
                  {formatServiceDuration(rec.durationSec)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Hall Activity Feed */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Live Queue Activity
            </h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {center.activityFeed.slice(0, 10).map((evt) => (
              <div key={evt.id} className="px-6 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-700 leading-relaxed">{evt.message}</p>
                </div>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                  {formatClockTime(evt.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
