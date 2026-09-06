/**
 * Temporal and calendar modifier calculations aligned with SafeRoute AI scoring spec.
 */

export interface TemporalResult {
  timeModifier: number;
  weekendModifier: number;
  totalAdjustment: number;
  timeWindowLabel: string;
}

export function computeTemporalModifier(timeStr: string, isWeekend: boolean): TemporalResult {
  // Parse "HH:MM"
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr || '12', 10);
  const m = parseInt(mStr || '0', 10);
  const totalMinutes = h * 60 + m;

  let timeModifier = 0;
  let timeWindowLabel = 'Transition Window (Neutral)';

  // 07:00 to 11:59 -> Morning Peak (+8.0)
  if (totalMinutes >= 420 && totalMinutes <= 719) {
    timeModifier = 8.0;
    timeWindowLabel = 'Morning Peak (+8.0)';
  }
  // 12:00 to 16:59 -> Daytime Peak (+5.0)
  else if (totalMinutes >= 720 && totalMinutes <= 1019) {
    timeModifier = 5.0;
    timeWindowLabel = 'Daytime Peak (+5.0)';
  }
  // 17:00 to 19:59 -> Evening Transition (0.0)
  else if (totalMinutes >= 1020 && totalMinutes <= 1199) {
    timeModifier = 0.0;
    timeWindowLabel = 'Evening Transition (0.0)';
  }
  // 20:00 to 22:59 -> Late Evening (-10.0)
  else if (totalMinutes >= 1200 && totalMinutes <= 1379) {
    timeModifier = -10.0;
    timeWindowLabel = 'Late Evening (-10.0)';
  }
  // 23:00 to 04:59 -> Dead of Night (-20.0)
  else if (totalMinutes >= 1380 || totalMinutes < 300) {
    timeModifier = -20.0;
    timeWindowLabel = 'Dead of Night (-20.0)';
  }
  // 05:00 to 06:59 -> Early Morning (0.0)
  else {
    timeModifier = 0.0;
    timeWindowLabel = 'Early Morning Transition (0.0)';
  }

  const weekendModifier = isWeekend ? -3.0 : 0.0;
  const totalAdjustment = timeModifier + weekendModifier;

  return {
    timeModifier,
    weekendModifier,
    totalAdjustment,
    timeWindowLabel,
  };
}

export function adjustRouteRSS(rawRss: number, timeStr: string, isWeekend: boolean): number {
  const { totalAdjustment } = computeTemporalModifier(timeStr, isWeekend);
  const finalScore = rawRss + totalAdjustment;
  return Math.round(Math.max(0, Math.min(100, finalScore)) * 10) / 10;
}
