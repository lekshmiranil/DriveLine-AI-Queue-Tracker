export type BoothStatus = 'active' | 'break';

export type QueueStage =
  | 'completed'
  | 'skipped'
  | 'serving'
  | 'on_deck'
  | 'approaching'
  | 'waiting';

export interface TestingBooth {
  id: string;
  label: string;
  examinerName: string;
  status: BoothStatus;
  pauseReason: string | null;
  currentToken: number | null;
  tokenStartedAt: number | null;
}

export interface CompletedTokenRecord {
  tokenNumber: number;
  boothId: string;
  boothLabel: string;
  completedAt: number;
  durationSec: number;
  outcome: 'passed' | 'completed' | 'skipped';
}

export interface QueueActivityEvent {
  id: string;
  timestamp: number;
  type: 'called' | 'skipped' | 'recalled' | 'booth_paused' | 'booth_resumed' | 'crowd_sighting' | 'issued';
  message: string;
  tokenNumber?: number;
  boothLabel?: string;
}

export interface TestingCenter {
  id: string;
  code: string;
  name: string;
  cityArea: string;
  operatingHours: string;
  currentToken: number;
  lastIssuedToken: number;
  defaultDurationSec: number;
  booths: TestingBooth[];
  skippedTokens: number[];
  completedHistory: CompletedTokenRecord[];
  activityFeed: QueueActivityEvent[];
  lastUpdatedAt: number;
}

export interface WaitEstimate {
  tokenNumber: number;
  centerId: string;
  currentToken: number;
  servingTokens: number[];
  tokensAhead: number;
  activeBoothCount: number;
  totalBoothCount: number;
  avgServiceSec: number;
  effectivePaceSec: number;
  estimatedWaitSec: number;
  estimatedCallTime: number;
  stage: QueueStage;
  assignedBoothLabel: string | null;
}

export type ClientSocketMessage =
  | { type: 'booth:next'; centerId: string; boothId: string }
  | { type: 'booth:skip'; centerId: string; boothId: string }
  | { type: 'booth:recall'; centerId: string; boothId: string; tokenNumber: number }
  | { type: 'booth:toggle_pause'; centerId: string; boothId: string; reason?: string }
  | { type: 'token:issue'; centerId: string; requestId?: string }
  | { type: 'sighting:report'; centerId: string; tokenNumber: number; boothLabel?: string }
  | { type: 'center:reset'; centerId: string };

export type ServerSocketMessage =
  | { type: 'state:sync'; centers: TestingCenter[]; serverTime: number }
  | { type: 'token:issued_ack'; centerId: string; tokenNumber: number; requestId?: string }
  | { type: 'action:error'; message: string };
