import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, ClipboardCheck, LayoutDashboard, MessageSquare, Monitor, Sliders, X } from 'lucide-react';
import { BoothsAndQueuePanel } from './components/BoothsAndQueuePanel';
import { ChecklistAndPrep } from './components/ChecklistAndPrep';
import { Header, type ActiveView } from './components/Header';
import { LiveTokenHero } from './components/LiveTokenHero';
import { QueueChatbot, type ChatMessageItem } from './components/QueueChatbot';
import { StaffDeskView } from './components/StaffDeskView';
import { WaitBreakdownStrip } from './components/WaitBreakdownStrip';
import { useQueueSocket } from './hooks/useQueueSocket';
import { playTokenChime, sendBrowserNotification } from './utils/audioAlert';
import { computeWaitEstimate, formatDurationCompact } from './utils/waitTime';

const STORAGE_CENTER_KEY = 'driveline_center_id_v1';
const STORAGE_TOKEN_KEY = 'driveline_tracked_token_v1';
const STORAGE_SOUND_KEY = 'driveline_sound_enabled_v1';
const STORAGE_THRESHOLD_KEY = 'driveline_alert_threshold_v1';
const STORAGE_CHAT_KEY = 'driveline_chat_history_v1';

export default function App() {
  const {
    centers,
    connectionState,
    lastError,
    clearError,
    now,
    sendAction,
    lastIssuedAck,
  } = useQueueSocket();

  const [activeView, setActiveView] = useState<ActiveView>('board');
  const [selectedCenterId, setSelectedCenterId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_CENTER_KEY) || 'central-metro';
    } catch {
      return 'central-metro';
    }
  });

  const [trackedToken, setTrackedToken] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_TOKEN_KEY);
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
    } catch {
      return null;
    }
  });

  const [isEditingToken, setIsEditingToken] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SOUND_KEY);
      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  });

  const [alertThreshold, setAlertThreshold] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_THRESHOLD_KEY);
      const parsed = raw ? Number(raw) : 3;
      return [2, 3, 5, 10].includes(parsed) ? parsed : 3;
    } catch {
      return 3;
    }
  });

  const [alertBanner, setAlertBanner] = useState<{
    title: string;
    body: string;
    urgent: boolean;
  } | null>(null);

  const [browserNotifStatus, setBrowserNotifStatus] = useState<
    'default' | 'granted' | 'denied' | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CHAT_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? (parsed as ChatMessageItem[]) : [];
    } catch {
      return [];
    }
  });

  const lastAlertKeyRef = useRef<string | null>(null);

  const selectedCenter = useMemo(() => {
    return centers.find((c) => c.id === selectedCenterId) || centers[0] || null;
  }, [centers, selectedCenterId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CENTER_KEY, selectedCenterId);
    } catch {
      // Ignore storage error
    }
  }, [selectedCenterId]);

  useEffect(() => {
    try {
      if (trackedToken === null) {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
      } else {
        localStorage.setItem(STORAGE_TOKEN_KEY, String(trackedToken));
      }
    } catch {
      // Ignore storage error
    }
  }, [trackedToken]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SOUND_KEY, String(soundEnabled));
    } catch {
      // Ignore storage error
    }
  }, [soundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_THRESHOLD_KEY, String(alertThreshold));
    } catch {
      // Ignore storage error
    }
  }, [alertThreshold]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(chatMessages.slice(-60)));
    } catch {
      // Ignore storage error
    }
  }, [chatMessages]);

  // Auto-bind newly issued walk-in token to user's tracker
  useEffect(() => {
    if (lastIssuedAck && lastIssuedAck.centerId === selectedCenterId) {
      setTrackedToken(lastIssuedAck.tokenNumber);
      setIsEditingToken(false);
    }
  }, [lastIssuedAck, selectedCenterId]);

  const estimate = useMemo(() => {
    if (!selectedCenter || trackedToken === null) return null;
    return computeWaitEstimate(selectedCenter, trackedToken, now);
  }, [selectedCenter, trackedToken, now]);

  // Trigger alert when token hits threshold or enters a booth
  useEffect(() => {
    if (!estimate || !selectedCenter) return;

    if (estimate.stage === 'serving') {
      const key = `serving:${selectedCenter.id}:${estimate.tokenNumber}`;
      if (lastAlertKeyRef.current !== key) {
        lastAlertKeyRef.current = key;
        const boothText = estimate.assignedBoothLabel || 'the testing booth';
        const title = `Token #${estimate.tokenNumber} Called Now`;
        const body = `Proceed to ${boothText} at ${selectedCenter.name}.`;
        setAlertBanner({ title, body, urgent: true });
        if (soundEnabled) playTokenChime(true);
        sendBrowserNotification(title, body);
      }
    } else if (estimate.tokensAhead > 0 && estimate.tokensAhead <= alertThreshold) {
      const key = `approaching:${selectedCenter.id}:${estimate.tokenNumber}:${alertThreshold}`;
      if (lastAlertKeyRef.current !== key && !lastAlertKeyRef.current?.startsWith(`serving:${selectedCenter.id}:${estimate.tokenNumber}`)) {
        lastAlertKeyRef.current = key;
        const title = `Token #${estimate.tokenNumber} Approaching`;
        const body = `${estimate.tokensAhead} ${estimate.tokensAhead === 1 ? 'token' : 'tokens'} ahead (~${formatDurationCompact(estimate.estimatedWaitSec)} wait). Head toward the exam hall.`;
        setAlertBanner({ title, body, urgent: false });
        if (soundEnabled) playTokenChime(false);
        sendBrowserNotification(title, body);
      }
    }
  }, [estimate, selectedCenter, alertThreshold, soundEnabled]);

  const handleOpenTokenEntry = () => {
    if (activeView === 'staff') {
      setActiveView('board');
    }
    setIsEditingToken(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const res = await Notification.requestPermission();
      setBrowserNotifStatus(res);
    } catch {
      setBrowserNotifStatus('denied');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-12">
      <div className="md:sticky md:top-0 z-30">
        <Header
          activeView={activeView}
          onSelectView={setActiveView}
          trackedToken={trackedToken}
          onOpenTokenEntry={handleOpenTokenEntry}
        />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        {/* Live Alert Banner */}
        {alertBanner && (
          <div
            role="status"
            className={`rounded-xl border px-5 py-4 flex items-start justify-between gap-4 ${
              alertBanner.urgent
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <div className="flex items-start gap-3">
              {alertBanner.urgent ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
              ) : (
                <Bell className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-bold">{alertBanner.title}</p>
                <p className="text-xs mt-0.5 opacity-90">{alertBanner.body}</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Dismiss alert"
              onClick={() => setAlertBanner(null)}
              className="p-1.5 rounded-lg hover:bg-black/5 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Toast */}
        {lastError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-5 py-3.5 flex items-center justify-between gap-4 text-red-900"
          >
            <p className="text-sm font-medium">{lastError}</p>
            <button
              type="button"
              onClick={clearError}
              className="text-xs font-semibold text-red-800 hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Initial Loading Skeleton */}
        {!selectedCenter ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 h-80 bg-slate-200 rounded-2xl" />
              <div className="lg:col-span-5 h-80 bg-slate-200 rounded-2xl" />
            </div>
            <div className="h-28 bg-slate-200 rounded-2xl" />
          </div>
        ) : activeView === 'chat' ? (
          <QueueChatbot
            messages={chatMessages}
            onAddMessage={(msg) => setChatMessages((prev) => [...prev, msg])}
            onClearMessages={() => setChatMessages([])}
            selectedCenter={selectedCenter}
            trackedToken={trackedToken}
            variant="full"
          />
        ) : activeView === 'staff' ? (
          <StaffDeskView
            center={selectedCenter}
            centers={centers}
            onSelectCenter={setSelectedCenterId}
            now={now}
            onSendAction={sendAction}
          />
        ) : activeView === 'booths' ? (
          <>
            <WaitBreakdownStrip center={selectedCenter} />
            <BoothsAndQueuePanel
              center={selectedCenter}
              now={now}
              trackedToken={trackedToken}
              onSelectTokenToTrack={(token) => {
                setTrackedToken(token);
                setIsEditingToken(false);
                setActiveView('my_token');
              }}
            />
          </>
        ) : activeView === 'my_token' ? (
          <>
            <LiveTokenHero
              centers={centers}
              selectedCenter={selectedCenter}
              onSelectCenter={setSelectedCenterId}
              connectionState={connectionState}
              now={now}
              trackedToken={trackedToken}
              estimate={estimate}
              isEditingToken={isEditingToken}
              onSetEditingToken={setIsEditingToken}
              onSaveToken={(token) => {
                lastAlertKeyRef.current = null;
                setTrackedToken(token);
              }}
              onClearToken={() => {
                lastAlertKeyRef.current = null;
                setTrackedToken(null);
              }}
              onIssueWalkInToken={() =>
                sendAction({
                  type: 'token:issue',
                  centerId: selectedCenter.id,
                  requestId: String(Date.now()),
                })
              }
              onReportSighting={(tokenNumber, boothLabel) =>
                sendAction({
                  type: 'sighting:report',
                  centerId: selectedCenter.id,
                  tokenNumber,
                  boothLabel,
                })
              }
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((prev) => !prev)}
              alertThreshold={alertThreshold}
              onChangeAlertThreshold={setAlertThreshold}
              onRequestBrowserNotifications={handleRequestNotifications}
              browserNotifStatus={browserNotifStatus}
            />
            <QueueChatbot
              messages={chatMessages}
              onAddMessage={(msg) => setChatMessages((prev) => [...prev, msg])}
              onClearMessages={() => setChatMessages([])}
              selectedCenter={selectedCenter}
              trackedToken={trackedToken}
              variant="embedded"
            />
            <ChecklistAndPrep />
          </>
        ) : (
          /* Default 'board' view: Complete live workspace with always-visible chatbot */
          <>
            <LiveTokenHero
              centers={centers}
              selectedCenter={selectedCenter}
              onSelectCenter={setSelectedCenterId}
              connectionState={connectionState}
              now={now}
              trackedToken={trackedToken}
              estimate={estimate}
              isEditingToken={isEditingToken}
              onSetEditingToken={setIsEditingToken}
              onSaveToken={(token) => {
                lastAlertKeyRef.current = null;
                setTrackedToken(token);
              }}
              onClearToken={() => {
                lastAlertKeyRef.current = null;
                setTrackedToken(null);
              }}
              onIssueWalkInToken={() =>
                sendAction({
                  type: 'token:issue',
                  centerId: selectedCenter.id,
                  requestId: String(Date.now()),
                })
              }
              onReportSighting={(tokenNumber, boothLabel) =>
                sendAction({
                  type: 'sighting:report',
                  centerId: selectedCenter.id,
                  tokenNumber,
                  boothLabel,
                })
              }
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((prev) => !prev)}
              alertThreshold={alertThreshold}
              onChangeAlertThreshold={setAlertThreshold}
              onRequestBrowserNotifications={handleRequestNotifications}
              browserNotifStatus={browserNotifStatus}
            />
            <WaitBreakdownStrip center={selectedCenter} />
            <QueueChatbot
              messages={chatMessages}
              onAddMessage={(msg) => setChatMessages((prev) => [...prev, msg])}
              onClearMessages={() => setChatMessages([])}
              selectedCenter={selectedCenter}
              trackedToken={trackedToken}
              variant="embedded"
            />
            <BoothsAndQueuePanel
              center={selectedCenter}
              now={now}
              trackedToken={trackedToken}
              onSelectTokenToTrack={(token) => {
                lastAlertKeyRef.current = null;
                setTrackedToken(token);
                setIsEditingToken(false);
              }}
            />
            <ChecklistAndPrep />
          </>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <p>DriveLine — Learner&apos;s Driving Test Queue &amp; Token Tracker</p>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => setActiveView('board')}
            className="hover:text-slate-900 transition-colors"
          >
            Live Board
          </button>
          <button
            type="button"
            onClick={() => setActiveView('booths')}
            className="hover:text-slate-900 transition-colors"
          >
            Booths &amp; Pace
          </button>
          <button
            type="button"
            onClick={() => setActiveView('chat')}
            className="hover:text-slate-900 transition-colors"
          >
            Voice Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveView('staff')}
            className="hover:text-slate-900 transition-colors"
          >
            Staff Desk
          </button>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Natural Thumb Zone, <= 8% viewport height) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveView('board')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeView === 'board' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span>Board</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('my_token')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeView === 'my_token' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <ClipboardCheck className="w-4 h-4 mb-0.5" />
          <span>My Token</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('booths')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeView === 'booths' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <Monitor className="w-4 h-4 mb-0.5" />
          <span>Booths</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('chat')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeView === 'chat' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <MessageSquare className="w-4 h-4 mb-0.5" />
          <span>Chat</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('staff')}
          className={`flex flex-col items-center justify-center h-full text-[11px] font-medium ${
            activeView === 'staff' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <Sliders className="w-4 h-4 mb-0.5" />
          <span>Staff</span>
        </button>
      </nav>
    </div>
  );
}
