/**
 * Pausentimer mit Zeitstempeln statt laufendem Zähler. Auf dem iPhone wird eine
 * Web-App im Hintergrund pausiert; wer das Ende als Zeitpunkt speichert,
 * rechnet nach dem Entsperren trotzdem richtig.
 */

export function startRest(nowMs: number, seconds: number): number {
  if (seconds <= 0) throw new Error('Pausendauer muss größer als 0 sein');
  return nowMs + seconds * 1000;
}

export function remainingSeconds(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

export function isFinished(endsAtMs: number, nowMs: number): boolean {
  return nowMs >= endsAtMs;
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
