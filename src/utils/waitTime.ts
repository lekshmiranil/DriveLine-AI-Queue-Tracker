import type { QueueStage, TestingCenter, WaitEstimate } from '../types/queue.ts';

export function computeAvgServiceSec(center: TestingCenter): number {
  const validDurations = center.completedHistory
    .filter((record) => record.outcome !== 'skipped' && record.durationSec >= 45 && record.durationSec <= 1200)
    .slice(0, 12)
    .map((record) => record.durationSec);

  if (validDurations.length === 0) {
    return center.defaultDurationSec;
  }

  const total = validDurations.reduce((sum, sec) => sum + sec, 0);
  return Math.round(total / validDurations.length);
}

export function computeWaitEstimate(
  center: TestingCenter,
  tokenNumber: number,
  now: number = Date.now(),
): WaitEstimate {
  const activeBooths = center.booths.filter((b) => b.status === 'active');
  const activeBoothCount = activeBooths.length;
  const totalBoothCount = center.booths.length;
  const avgServiceSec = computeAvgServiceSec(center);

  const servingBooth = center.booths.find((b) => b.currentToken === tokenNumber);
  const servingTokens = center.booths
    .map((b) => b.currentToken)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  const maxServing = servingTokens.length > 0 ? Math.max(...servingTokens) : center.currentToken;
  const referenceCurrent = Math.max(center.currentToken, maxServing);
  const isSkipped = center.skippedTokens.includes(tokenNumber);

  // Determine queue stage
  let stage: QueueStage = 'waiting';
  let tokensAhead = 0;

  if (servingBooth) {
    stage = 'serving';
    tokensAhead = 0;
  } else if (isSkipped) {
    stage = 'skipped';
    tokensAhead = 0;
  } else if (tokenNumber < referenceCurrent) {
    stage = 'completed';
    tokensAhead = 0;
  } else {
    tokensAhead = Math.max(1, tokenNumber - referenceCurrent);
    if (tokensAhead <= 3) {
      stage = 'on_deck';
    } else if (tokensAhead <= 10) {
      stage = 'approaching';
    } else {
      stage = 'waiting';
    }
  }

  // Effective throughput accounts for parallel active booths
  const divisor = Math.max(1, activeBoothCount);
  const effectivePaceSec = Math.round(avgServiceSec / divisor);

  // Account for how long current booths have already been serving their current candidates
  let currentElapsedOffsetSec = 0;
  if (activeBoothCount > 0 && tokensAhead > 0) {
    const remainingForFirstSlot = activeBooths
      .map((b) => {
        if (!b.tokenStartedAt) return avgServiceSec;
        const elapsed = Math.max(0, Math.floor((now - b.tokenStartedAt) / 1000));
        return Math.max(20, avgServiceSec - elapsed);
      })
      .sort((a, b) => a - b);

    const fastestRemaining = remainingForFirstSlot[0] ?? avgServiceSec;
    currentElapsedOffsetSec = Math.max(0, avgServiceSec - fastestRemaining);
  }

  let estimatedWaitSec = 0;
  if (stage === 'serving' || stage === 'completed' || stage === 'skipped') {
    estimatedWaitSec = 0;
  } else if (activeBoothCount === 0) {
    // All booths on break — assume 10 min pause buffer plus normal pace
    estimatedWaitSec = 600 + tokensAhead * Math.round(avgServiceSec / Math.max(1, totalBoothCount));
  } else {
    const rawWait = tokensAhead * effectivePaceSec - Math.min(currentElapsedOffsetSec, effectivePaceSec - 15);
    estimatedWaitSec = Math.max(30, Math.round(rawWait));
  }

  return {
    tokenNumber,
    centerId: center.id,
    currentToken: referenceCurrent,
    servingTokens,
    tokensAhead,
    activeBoothCount,
    totalBoothCount,
    avgServiceSec,
    effectivePaceSec,
    estimatedWaitSec,
    estimatedCallTime: now + estimatedWaitSec * 1000,
    stage,
    assignedBoothLabel: servingBooth ? servingBooth.label : null,
  };
}

export function formatDurationCompact(seconds: number): string {
  if (seconds <= 0) return 'Now';
  const totalMins = Math.round(seconds / 60);
  if (totalMins < 1) return '< 1 min';
  if (totalMins < 60) return `${totalMins} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

export function formatServiceDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatElapsedTimer(startedAt: number | null, now: number): string {
  if (!startedAt) return '00:00';
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
