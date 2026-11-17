import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Edit3,
  Radio,
  Ticket,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ConnectionState } from '../hooks/useQueueSocket';
import type { TestingCenter, WaitEstimate } from '../types/queue';
import {
  formatClockTime,
  formatDurationCompact,
  formatElapsedTimer,
} from '../utils/waitTime';

interface LiveTokenHeroProps {
  centers: TestingCenter[];
  selectedCenter: TestingCenter;
  onSelectCenter: (centerId: string) => void;
  connectionState: ConnectionState;
  now: number;
  trackedToken: number | null;
  estimate: WaitEstimate | null;
  isEditingToken: boolean;
  onSetEditingToken: (editing: boolean) => void;
  onSaveToken: (tokenNumber: number) => void;
  onClearToken: () => void;
  onIssueWalkInToken: () => void;
  onReportSighting: (tokenNumber: number, boothLabel?: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  alertThreshold: number;
  onChangeAlertThreshold: (tokens: number) => void;
  onRequestBrowserNotifications: () => void;
  browserNotifStatus: 'default' | 'granted' | 'denied' | 'unsupported';
}

function getStageDisplay(estimate: WaitEstimate): {
  label: string;
  guidance: string;
  accentClass: string;
  surfaceClass: string;
  icon: React.ReactNode;
} {
  switch (estimate.stage) {
    case 'serving':
      return {
        label: estimate.assignedBoothLabel
          ? `Now Inside · Proceed to ${estimate.assignedBoothLabel}`
          : 'Now Serving Your Token',
        guidance: 'Have your photo ID, fee receipt, and learner application ready at the counter.',
        accentClass: 'text-emerald-800',
        surfaceClass: 'bg-emerald-50 border-emerald-200',
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />,
      };
    case 'on_deck':
      return {
        label: 'On Deck · Head to the Testing Hall',
        guidance: `Only ${estimate.tokensAhead} ${estimate.tokensAhead === 1 ? 'token' : 'tokens'} ahead. Stand near the booth entrance.`,
        accentClass: 'text-amber-900',
        surfaceClass: 'bg-amber-50 border-amber-200',
        icon: <Bell className="w-5 h-5 text-amber-700 shrink-0" />,
      };
    case 'approaching':
      return {
        label: 'Approaching Soon',
        guidance: 'Wrap up your review and confirm all documents are in order.',
        accentClass: 'text-blue-900',
        surfaceClass: 'bg-blue-50 border-blue-200',
        icon: <Clock className="w-5 h-5 text-blue-700 shrink-0" />,
      };
    case 'skipped':
      return {
        label: 'Marked Absent · In Recall Pool',
        guidance: 'Your token was called while away. Approach the check-in desk to be recalled.',
        accentClass: 'text-red-900',
        surfaceClass: 'bg-red-50 border-red-200',
        icon: <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />,
      };
    case 'completed':
      return {
        label: 'Turn Completed',
        guidance: `Token #${estimate.tokenNumber} has already passed the current counter number (#${estimate.currentToken}).`,
        accentClass: 'text-slate-800',
        surfaceClass: 'bg-slate-100 border-slate-200',
        icon: <CheckCircle2 className="w-5 h-5 text-slate-600 shrink-0" />,
      };
    case 'waiting':
    default:
      return {
        label: 'Waiting in Queue',
        guidance: 'Live pace updates automatically as each booth finishes an exam.',
        accentClass: 'text-slate-900',
        surfaceClass: 'bg-slate-50 border-slate-200',
        icon: <Clock className="w-5 h-5 text-slate-600 shrink-0" />,
      };
  }
}

export const LiveTokenHero: React.FC<LiveTokenHeroProps> = ({
  centers,
  selectedCenter,
  onSelectCenter,
  connectionState,
  now,
  trackedToken,
  estimate,
  isEditingToken,
  onSetEditingToken,
  onSaveToken,
  onClearToken,
  onIssueWalkInToken,
  onReportSighting,
  soundEnabled,
  onToggleSound,
  alertThreshold,
  onChangeAlertThreshold,
  onRequestBrowserNotifications,
  browserNotifStatus,
}) => {
  const [tokenInput, setTokenInput] = useState<string>(
    trackedToken !== null ? String(trackedToken) : String(selectedCenter.currentToken + 8),
  );
  const [showSightingForm, setShowSightingForm] = useState(false);
  const [sightingInput, setSightingInput] = useState<string>(String(selectedCenter.currentToken + 1));
  const [sightingBooth, setSightingBooth] = useState<string>(selectedCenter.booths[0]?.label || '');

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(tokenInput, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 9999) {
      onSaveToken(parsed);
      onSetEditingToken(false);
    }
  };

  const handleSightingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(sightingInput, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 9999) {
      onReportSighting(parsed, sightingBooth || undefined);
      setShowSightingForm(false);
    }
  };

  const activeBooths = selectedCenter.booths.filter((b) => b.status === 'active');
  const stageDisplay = estimate ? getStageDisplay(estimate) : null;

  // Progress bar percentage between starting baseline and tracked token
  let progressPct = 0;
  if (estimate) {
    if (estimate.stage === 'serving' || estimate.stage === 'completed') {
      progressPct = 100;
    } else if (estimate.tokensAhead > 0) {
      const span = Math.max(20, estimate.tokensAhead + 6);
      progressPct = Math.max(8, Math.min(95, Math.round(((span - estimate.tokensAhead) / span) * 100)));
    }
  }

  return (
    <section aria-label="Live token board and personal wait estimator" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left Column: High-Contrast Live Center Board */}
      <div className="lg:col-span-7 bg-slate-900 text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div className="min-w-0">
              <label htmlFor="center-select" className="sr-only">
                Select testing center
              </label>
              <select
                id="center-select"
                value={selectedCenter.id}
                onChange={(e) => onSelectCenter(e.target.value)}
                className="bg-slate-800 text-white text-sm font-medium border border-slate-700 rounded-lg px-3 py-2 min-h-[40px] focus-visible:outline-2 focus-visible:outline-blue-400 max-w-full"
              >
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-300">
                {selectedCenter.cityArea} <span aria-hidden="true">·</span> {selectedCenter.operatingHours}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-300 shrink-0">
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-emerald-400'
                    : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span>
                {connectionState === 'connected'
                  ? 'Live sync active'
                  : connectionState === 'connecting'
                  ? 'Connecting...'
                  : 'Reconnecting...'}
              </span>
            </div>
          </div>

          <div className="py-8 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-slate-300">
                Currently Inside Testing Booths
              </p>
              <div className="mt-2 flex items-baseline gap-4">
                <span className="font-mono text-6xl sm:text-7xl font-bold tracking-tight text-white tabular-nums">
                  #{selectedCenter.currentToken}
                </span>
                <span className="text-sm text-slate-300 tabular-nums">
                  Latest token called
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-400">Last issued slip</p>
              <p className="font-mono text-xl font-semibold text-slate-100 tabular-nums mt-0.5">
                #{selectedCenter.lastIssuedToken}
              </p>
              <p className="text-xs text-slate-400 mt-1 tabular-nums">
                {Math.max(0, selectedCenter.lastIssuedToken - selectedCenter.currentToken)} waiting in hall
              </p>
            </div>
          </div>

          {/* Active Booths Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800">
            {selectedCenter.booths.slice(0, 3).map((booth) => (
              <div
                key={booth.id}
                className="bg-slate-800/75 border border-slate-700/70 rounded-xl px-4 py-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-slate-300 truncate">{booth.label}</p>
                  {booth.status === 'active' && booth.currentToken !== null ? (
                    <p className="font-mono text-lg font-bold text-white tabular-nums mt-0.5">
                      #{booth.currentToken}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-amber-300 mt-0.5">On Break</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {booth.status === 'active' && booth.tokenStartedAt ? (
                    <>
                      <p className="text-[11px] text-slate-400">Inside</p>
                      <p className="font-mono text-xs font-medium text-emerald-300 tabular-nums">
                        {formatElapsedTimer(booth.tokenStartedAt, now)}
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-amber-200/80 max-w-[90px] truncate">
                      {booth.pauseReason || 'Paused'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {selectedCenter.booths.length > 3 && (
            <p className="mt-2.5 text-xs text-slate-400">
              +{selectedCenter.booths.length - 3} more booth ({activeBooths.length} of {selectedCenter.booths.length} active) · View all in Booths &amp; Pace
            </p>
          )}
        </div>

        {/* Crowd-Verified Board Update Trigger */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          {!showSightingForm ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-300">
                Waiting in the hall? Help fellow candidates if the display moves ahead.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSightingInput(String(selectedCenter.currentToken + 1));
                  setShowSightingForm(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Radio className="w-3.5 h-3.5 text-blue-400" />
                Report Token Inside
              </button>
            </div>
          ) : (
            <form onSubmit={handleSightingSubmit} className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="sighting-token" className="block text-xs text-slate-300 mb-1">
                  Token shown on hall display
                </label>
                <input
                  id="sighting-token"
                  type="number"
                  min={1}
                  max={9999}
                  required
                  value={sightingInput}
                  onChange={(e) => setSightingInput(e.target.value)}
                  className="w-28 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 min-h-[40px] text-sm font-mono text-white tabular-nums focus-visible:outline-2 focus-visible:outline-blue-400"
                />
              </div>
              <div>
                <label htmlFor="sighting-booth" className="block text-xs text-slate-300 mb-1">
                  Booth (optional)
                </label>
                <select
                  id="sighting-booth"
                  value={sightingBooth}
                  onChange={(e) => setSightingBooth(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 min-h-[40px] text-sm text-white focus-visible:outline-2 focus-visible:outline-blue-400"
                >
                  {selectedCenter.booths.map((b) => (
                    <option key={b.id} value={b.label}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[40px] text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  Update Board
                </button>
                <button
                  type="button"
                  onClick={() => setShowSightingForm(false)}
                  className="px-3 py-2 min-h-[40px] text-xs font-medium text-slate-300 hover:text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Right Column: Your Personal Token & Wait Estimate */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
        {trackedToken === null || isEditingToken || !estimate || !stageDisplay ? (
          <div className="flex flex-col justify-between h-full">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight text-balance">
                Check Your Learner&apos;s Test Wait Time
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Enter the token number printed on your paper slip to track how many people are ahead of you and when your turn is expected.
              </p>

              <form onSubmit={handleTokenSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="my-token-input" className="block text-sm font-medium text-slate-800 mb-1.5">
                    Your paper token number
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="my-token-input"
                      type="number"
                      min={1}
                      max={9999}
                      required
                      placeholder={`e.g. ${selectedCenter.currentToken + 8}`}
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-4 py-2.5 min-h-[44px] text-lg font-mono font-semibold text-slate-900 tabular-nums focus-visible:outline-2 focus-visible:outline-blue-700"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 min-h-[44px] bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Start Tracking
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-5 pt-5 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2.5">
                  Testing or arriving without a slip yet?
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onIssueWalkInToken}
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Ticket className="w-4 h-4 text-blue-700" />
                    Grab Next Walk-in Token (#{selectedCenter.lastIssuedToken + 1})
                  </button>
                  {trackedToken !== null && (
                    <button
                      type="button"
                      onClick={() => onSetEditingToken(false)}
                      className="px-3 py-2 min-h-[40px] text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
              Live pace at {selectedCenter.code}: ~{Math.round(estimate ? estimate.effectivePaceSec / 60 : 1.5)} min per queue step across {activeBooths.length} active {activeBooths.length === 1 ? 'booth' : 'booths'}.
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-between h-full">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Tracking Your Slip · {selectedCenter.code}
                  </p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="font-mono text-4xl font-bold text-slate-900 tabular-nums">
                      #{estimate.tokenNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTokenInput(String(estimate.tokenNumber));
                        onSetEditingToken(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 py-1 px-2 -ml-1 rounded focus-visible:outline-2 focus-visible:outline-blue-700"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Change
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClearToken}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 py-1.5 px-2 rounded whitespace-nowrap"
                >
                  Clear
                </button>
              </div>

              {/* Explicit Stage Banner (Icon + Text Label, 1px hairline border) */}
              <div className={`mt-5 p-4 rounded-xl border ${stageDisplay.surfaceClass}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{stageDisplay.icon}</div>
                  <div>
                    <p className={`text-sm font-semibold ${stageDisplay.accentClass}`}>
                      {stageDisplay.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                      {stageDisplay.guidance}
                    </p>
                  </div>
                </div>
              </div>

              {/* Primary Countdown Metrics */}
              <div className="mt-6 grid grid-cols-3 gap-4 pb-5 border-b border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">Est. Wait</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {estimate.stage === 'serving'
                      ? 'Now'
                      : estimate.stage === 'completed' || estimate.stage === 'skipped'
                      ? '—'
                      : formatDurationCompact(estimate.estimatedWaitSec)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tokens Ahead</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {estimate.stage === 'serving' || estimate.stage === 'completed' || estimate.stage === 'skipped'
                      ? '0'
                      : estimate.tokensAhead}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Expected Call</p>
                  <p className="mt-1 font-mono text-lg sm:text-xl font-semibold text-slate-900 tabular-nums">
                    {estimate.stage === 'serving'
                      ? 'In Booth'
                      : estimate.stage === 'completed' || estimate.stage === 'skipped'
                      ? '—'
                      : formatClockTime(estimate.estimatedCallTime)}
                  </p>
                </div>
              </div>

              {/* Queue Position Progress Track */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-slate-600 mb-2 tabular-nums">
                  <span>Now Serving #{estimate.currentToken}</span>
                  <span>Your Token #{estimate.tokenNumber}</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Queue progress toward your token"
                  className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      estimate.stage === 'serving'
                        ? 'bg-emerald-600'
                        : estimate.stage === 'on_deck'
                        ? 'bg-amber-600'
                        : 'bg-blue-700'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Alert Preferences */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleSound}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    soundEnabled
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  {soundEnabled ? 'Chime On' : 'Chime Off'}
                </button>

                {browserNotifStatus === 'default' && (
                  <button
                    type="button"
                    onClick={onRequestBrowserNotifications}
                    className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    Enable Alerts
                  </button>
                )}
                {browserNotifStatus === 'denied' && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <BellOff className="w-3.5 h-3.5" />
                    In-app alerts only
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <label htmlFor="alert-threshold" className="whitespace-nowrap">
                  Alert at:
                </label>
                <select
                  id="alert-threshold"
                  value={alertThreshold}
                  onChange={(e) => onChangeAlertThreshold(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-700"
                >
                  <option value={2}>2 tokens away</option>
                  <option value={3}>3 tokens away</option>
                  <option value={5}>5 tokens away</option>
                  <option value={10}>10 tokens away</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
