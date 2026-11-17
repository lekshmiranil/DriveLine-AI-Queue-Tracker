import React from 'react';
import type { TestingCenter } from '../types/queue';
import { computeAvgServiceSec, formatServiceDuration } from '../utils/waitTime';

interface WaitBreakdownStripProps {
  center: TestingCenter;
}

export const WaitBreakdownStrip: React.FC<WaitBreakdownStripProps> = ({ center }) => {
  const activeBooths = center.booths.filter((b) => b.status === 'active');
  const avgServiceSec = computeAvgServiceSec(center);
  const effectivePaceSec =
    activeBooths.length > 0 ? Math.round(avgServiceSec / activeBooths.length) : avgServiceSec;
  const tokensPerHour =
    activeBooths.length > 0 ? Math.round((3600 / avgServiceSec) * activeBooths.length) : 0;

  return (
    <section
      aria-label="Center throughput metrics"
      className="bg-white border border-slate-200 rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
    >
      <div className="p-5 sm:p-6">
        <p className="text-xs font-medium text-slate-500">Avg. Time Per Candidate</p>
        <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
          {formatServiceDuration(avgServiceSec)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          From last {Math.min(12, center.completedHistory.length)} exams
        </p>
      </div>

      <div className="p-5 sm:p-6 border-l border-slate-200 lg:border-l-0">
        <p className="text-xs font-medium text-slate-500">Active Testing Booths</p>
        <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
          {activeBooths.length} / {center.booths.length}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {center.booths.length - activeBooths.length === 0
            ? 'All booths running'
            : `${center.booths.length - activeBooths.length} on break`}
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <p className="text-xs font-medium text-slate-500">Queue Moving Pace</p>
        <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
          {activeBooths.length > 0 ? `~${formatServiceDuration(effectivePaceSec)}` : 'Paused'}
        </p>
        <p className="mt-1 text-xs text-slate-500 tabular-nums">
          {tokensPerHour > 0 ? `~${tokensPerHour} candidates / hour` : 'Waiting for booth resume'}
        </p>
      </div>

      <div className="p-5 sm:p-6 border-l border-slate-200 lg:border-l-0">
        <p className="text-xs font-medium text-slate-500">Skipped / Recall Pool</p>
        <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
          {center.skippedTokens.length}
        </p>
        <p className="mt-1 text-xs text-slate-500 truncate tabular-nums">
          {center.skippedTokens.length > 0
            ? center.skippedTokens.map((t) => `#${t}`).join(', ')
            : 'No absent tokens'}
        </p>
      </div>
    </section>
  );
};
