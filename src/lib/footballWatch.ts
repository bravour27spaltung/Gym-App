import { fmtTime, isoDate } from './format';
import type { HistFootballSession } from './storage';

/**
 * Von der Apple Watch erkannte Trainingsfenster (Tabelle fit_football_watch_windows, von
 * der Edge Function football-import befüllt) als Vorschlag für einen Fußball-Eintrag.
 * Reine Logik ohne Browser-/DB-Zugriff.
 */
export interface WatchWindow {
  id: string;
  startedAt: string;
  endedAt: string;
  hrSamples: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  steps: number | null;
  distanceKm: number | null;
  /** Gesetzt, sobald der Vorschlag in einen Fußball-Eintrag übernommen wurde. */
  sessionId: string | null;
  dismissed: boolean;
}

/** Ein Rohwert aus fit_health_samples (hr: bpm, steps: Anzahl, distance: km). */
export interface WatchSample {
  kind: 'hr' | 'steps' | 'distance';
  startMs: number;
  endMs: number;
  value: number;
}

export interface WatchRangeSummary {
  hrSamples: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  steps: number | null;
  distanceKm: number | null;
}

/**
 * Wertet einen selbst gewählten Zeitraum [fromMs, toMs] aus den Rohwerten aus: Ø/Max-Puls
 * aus den Herzfrequenz-Messwerten (nur 30–220 bpm), Schritte und Distanz als Summe der
 * Samples, deren Start im Zeitraum liegt. Ohne passende Werte bleibt das Feld null.
 * Der Puls-Mittelwert ist der einfache Mittelwert der Einzelmessungen, nicht zeitgewichtet.
 */
export function summarizeWatchSamples(samples: WatchSample[], fromMs: number, toMs: number): WatchRangeSummary {
  const hr: number[] = [];
  let steps = 0;
  let stepCount = 0;
  let distance = 0;
  let distanceCount = 0;
  for (const s of samples) {
    if (s.startMs < fromMs || s.startMs > toMs) continue;
    if (s.kind === 'hr') {
      if (s.value >= 30 && s.value <= 220) hr.push(s.value);
    } else if (s.kind === 'steps' && s.startMs < toMs) {
      steps += s.value;
      stepCount += 1;
    } else if (s.kind === 'distance' && s.startMs < toMs) {
      distance += s.value;
      distanceCount += 1;
    }
  }
  return {
    hrSamples: hr.length,
    avgHeartRate: hr.length > 0 ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null,
    maxHeartRate: hr.length > 0 ? Math.round(Math.max(...hr)) : null,
    steps: stepCount > 0 ? Math.round(steps) : null,
    distanceKm: distanceCount > 0 ? Math.round(distance * 100) / 100 : null,
  };
}

/** "Ø 135 / max 168 bpm (7 Messwerte) · 5,1 km · 6.200 Schritte" (nur vorhandene Werte). */
export function describeRangeSummary(r: WatchRangeSummary): string {
  const parts: string[] = [];
  if (r.avgHeartRate !== null) {
    const max = r.maxHeartRate !== null ? ` / max ${r.maxHeartRate}` : '';
    parts.push(`Ø ${r.avgHeartRate}${max} bpm (${r.hrSamples} Messwerte)`);
  }
  if (r.distanceKm !== null) parts.push(`${r.distanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`);
  if (r.steps !== null) parts.push(`${r.steps.toLocaleString('de-DE')} Schritte`);
  return parts.join(' · ');
}

/** Name des iOS-Kurzbefehls, den der Button im Fußball-Tab startet (siehe supabase/functions/football-import/README.md). */
export const WATCH_SHORTCUT_NAME = 'Fussball-Import';

/**
 * Link, der den Kurzbefehl startet und danach zurück in die App springt (x-callback-url).
 * Die App ist dabei geöffnet und das iPhone entsperrt, wie es das Lesen der Health-Daten
 * verlangt. x-error/x-cancel führen ebenfalls zurück, damit man nicht in den Kurzbefehlen hängen bleibt.
 */
export function watchShortcutUrl(returnUrl: string): string {
  const back = encodeURIComponent(returnUrl);
  return `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(WATCH_SHORTCUT_NAME)}&x-success=${back}&x-cancel=${back}&x-error=${back}`;
}

/** Älter als so viele Tage werden Vorschläge nicht mehr angeboten. */
export const WATCH_WINDOW_MAX_AGE_DAYS = 14;

const DAY_MS = 86_400_000;

/** Bereits bestehende Einträge mit Startzeit belegen das Intervall [Start, Start + Dauer). */
function overlapsSession(w: WatchWindow, sessions: HistFootballSession[]): boolean {
  const from = new Date(w.startedAt).getTime();
  const to = new Date(w.endedAt).getTime();
  return sessions.some((s) => {
    if (!s.startedAt) return false;
    const sFrom = new Date(s.startedAt).getTime();
    const sTo = sFrom + s.minutes * 60_000;
    return sFrom < to && sTo > from;
  });
}

/**
 * Vorschläge, die noch angeboten werden: nicht übernommen, nicht ausgeblendet, nicht
 * älter als 14 Tage und ohne zeitlich überlappenden Eintrag (fängt den Fall ab, dass ein
 * Eintrag schon gespeichert, die Verknüpfung aber noch nicht geschrieben ist, z. B. offline).
 */
export function visibleWatchWindows(
  windows: WatchWindow[],
  sessions: HistFootballSession[],
  nowMs: number = Date.now(),
): WatchWindow[] {
  return windows
    .filter((w) => w.sessionId === null && !w.dismissed)
    .filter((w) => nowMs - new Date(w.endedAt).getTime() <= WATCH_WINDOW_MAX_AGE_DAYS * DAY_MS)
    .filter((w) => !overlapsSession(w, sessions))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export interface WatchFormValues {
  /** "YYYY-MM-DD" (lokale Zeitzone). */
  playedOn: string;
  /** "HH:MM" (lokale Zeitzone). */
  startedAtTime: string;
  minutes: number;
  avgHeartRate: number | null;
  distanceKm: number | null;
}

/** Werte, die ein Vorschlag ins Fußball-Formular übernimmt (Dauer auf 1–240 min begrenzt wie im Formular). */
export function watchWindowToForm(w: WatchWindow): WatchFormValues {
  const start = new Date(w.startedAt);
  const minutes = Math.round((new Date(w.endedAt).getTime() - start.getTime()) / 60_000);
  const hh = String(start.getHours()).padStart(2, '0');
  const mm = String(start.getMinutes()).padStart(2, '0');
  return {
    playedOn: isoDate(start),
    startedAtTime: `${hh}:${mm}`,
    minutes: Math.max(1, Math.min(240, minutes)),
    avgHeartRate: w.avgHeartRate,
    distanceKm: w.distanceKm,
  };
}

/** "19:12–20:58 · 106 min · Ø 132 / max 171 bpm (6 Messwerte) · 4,2 km" */
export function describeWatchWindow(w: WatchWindow): string {
  const minutes = Math.round((new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 60_000);
  const parts = [`${fmtTime(w.startedAt)}–${fmtTime(w.endedAt)}`, `${minutes} min`];
  if (w.avgHeartRate !== null) {
    const max = w.maxHeartRate !== null ? ` / max ${w.maxHeartRate}` : '';
    parts.push(`Ø ${w.avgHeartRate}${max} bpm (${w.hrSamples} Messwerte)`);
  }
  if (w.distanceKm !== null) parts.push(`${w.distanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`);
  return parts.join(' · ');
}
