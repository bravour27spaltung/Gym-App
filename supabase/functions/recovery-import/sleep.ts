/**
 * Schlaf: Zuordnung der Schlafabschnitte einer Uhr zu einer NACHT statt zu einem Zeitfenster.
 * Reine Logik ohne Browser- oder Datenbankzugriff.
 *
 * Warum das nötig ist: Eine Nacht beginnt am Vorabend und endet am Morgen des Folgetags.
 * Wird Schlaf stattdessen für einen Kalendertag ab 0 Uhr abgefragt (oder nach der Startzeit
 * eines festen Fensters gefiltert), fehlt der Teil vor Mitternacht bzw. es wird die Nacht des
 * Vortags mitgezählt. Apple Health ordnet Schlaf selbst dem Tag des Aufwachens zu; die App
 * macht es genauso: Eine Nacht gehört zu dem Kalendertag, an dem sie ENDET.
 *
 * Vorgehen:
 *  1. Abschnitte (Asleep*-Phasen) zu Intervallen vereinigen. Überlappen sich Quellen (Watch und
 *     iPhone), wird die Zeit nur einmal gezählt statt doppelt.
 *  2. Intervalle mit Lücken bis SESSION_GAP_MS zu einer Schlaf-Session verbinden (nächtliches
 *     Aufwachen, Toilettengang). Längere Lücken trennen Nacht und Nickerchen.
 *  3. Die Session mit dem längsten Schlaf, die am gesuchten Tag endet, ist die Hauptnacht.
 *     Nickerchen am selben Tag zählen nicht mit (Zielgröße ist die Nachtschlafdauer).
 *
 * Genauigkeit: Consumer-Wearables erkennen Schlaf mit hoher Sensitivität, aber Wachphasen mit
 * geringer Spezifität; die Gesamtschlafzeit wird dadurch tendenziell überschätzt (Chinoy et al.
 * 2021, Sleep 44(5), Laborvergleich mit Polysomnographie, n = 34, Apple Watch nicht darunter, die
 * Übertragbarkeit ist also indirekt). Die Dauer taugt als Trend, nicht als Absolutwert.
 */

/** Schlafphase eines Abschnitts; 'other' = nicht spezifiziert (z. B. iPhone ohne Phasen). */
export type SleepStage = 'deep' | 'rem' | 'core' | 'other';

/**
 * Phase aus dem Health-Wert (HealthKit "...AsleepDeep" oder die Texte des Kurzbefehls,
 * englisch wie deutsch: Deep/Tief, REM, Core/Kern).
 */
export function sleepStageOf(value: string): SleepStage {
  if (/deep|tief/i.test(value)) return 'deep';
  if (/asleeprem|(^|[^a-z])rem([^a-z]|$)/i.test(value)) return 'rem';
  if (/core|kern/i.test(value)) return 'core';
  return 'other';
}

export interface SleepSegment {
  startMs: number;
  endMs: number;
  /** Quelle ist eine Apple Watch; Watch-Daten haben Vorrang vor anderen Quellen. */
  isWatch?: boolean;
  /** Schlafphase, falls bekannt; ohne Angabe zählt der Abschnitt nur für die Gesamtdauer. */
  stage?: SleepStage;
}

export interface SleepNight {
  /** Datum des Aufwachens, "YYYY-MM-DD" (lokal). */
  date: string;
  /** Beginn des ersten und Ende des letzten Schlafabschnitts der Nacht. */
  startMs: number;
  endMs: number;
  /** Tatsächlich geschlafene Stunden (ohne Wachphasen innerhalb der Nacht), auf 0,01 gerundet. */
  hours: number;
  /**
   * Minuten in Tief- bzw. REM-Schlaf, null wenn die Nacht keine Phasen enthält (z. B. nur iPhone).
   * Bewusst nur diese beiden Phasen: Tief und REM erkennt die Uhr im Vergleich zu Wach und Leichtschlaf
   * am besten (Sleep Advances 2025, zpaf021); Wachzeit und Leichtschlaf werden nicht ausgewertet.
   */
  deepMin: number | null;
  remMin: number | null;
}

/** Lücke, bis zu der zwei Schlafabschnitte noch zur selben Nacht gehören. */
export const SESSION_GAP_MS = 2 * 3_600_000;
/** Kürzere Sessions gelten nicht als Nacht (kurzes Eindösen). */
const MIN_NIGHT_MS = 60 * 60_000;
/** Konsistenz mit der Datenbankgrenze (sleep_hours <= 16). */
const MAX_NIGHT_HOURS = 16;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Kalenderdatum eines Zeitpunkts. Ohne `offsetMinutes` gilt die Zeitzone des Geräts (inkl.
 * Sommerzeit), mit `offsetMinutes` ein fester UTC-Offset (z. B. 120 für +02:00), nötig auf
 * Servern und in Tests.
 */
export function localDateOf(ms: number, offsetMinutes?: number): string {
  if (offsetMinutes === undefined) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const d = new Date(ms + offsetMinutes * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Mitternacht (0 Uhr) des Datums als Zeitstempel, lokal oder mit festem Offset. */
export function startOfDayMs(dateIso: string, offsetMinutes?: number): number {
  if (offsetMinutes === undefined) return new Date(`${dateIso}T00:00:00`).getTime();
  return Date.parse(`${dateIso}T00:00:00Z`) - offsetMinutes * 60_000;
}

interface Interval {
  startMs: number;
  endMs: number;
}

/** Vereinigt überlappende oder aneinanderstoßende Intervalle. */
function mergeIntervals(segments: Interval[]): Interval[] {
  const sorted = segments
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)
    .map((s) => ({ startMs: s.startMs, endMs: s.endMs }))
    .sort((a, b) => a.startMs - b.startMs);
  const out: Interval[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.startMs <= last.endMs) last.endMs = Math.max(last.endMs, s.endMs);
    else out.push(s);
  }
  return out;
}

export interface SleepSession {
  startMs: number;
  endMs: number;
  /** Geschlafene Zeit (Summe der vereinigten Abschnitte) in ms. */
  asleepMs: number;
}

/** Fasst Schlafabschnitte zu Sessions zusammen (Lücken bis `gapMs` bleiben in derselben Session). */
export function groupSleepSessions(segments: SleepSegment[], gapMs: number = SESSION_GAP_MS): SleepSession[] {
  const sessions: SleepSession[] = [];
  for (const iv of mergeIntervals(segments)) {
    const last = sessions[sessions.length - 1];
    if (last && iv.startMs - last.endMs <= gapMs) {
      last.endMs = iv.endMs;
      last.asleepMs += iv.endMs - iv.startMs;
    } else {
      sessions.push({ startMs: iv.startMs, endMs: iv.endMs, asleepMs: iv.endMs - iv.startMs });
    }
  }
  return sessions;
}

/** Bevorzugt Watch-Abschnitte; nur wenn es keine gibt, werden alle Quellen verwendet. */
function preferWatch(segments: SleepSegment[]): SleepSegment[] {
  const watch = segments.filter((s) => s.isWatch);
  return watch.length > 0 ? watch : segments;
}

/**
 * Hauptnacht, die am Tag `dateIso` endet (Aufwachdatum), oder null ohne verwertbare Daten.
 * Berücksichtigt nur Abschnitte, die zwischen dem Vortag 10 Uhr und dem Tag selbst 20 Uhr
 * liegen; das reicht für jede Nacht, die am Tag `dateIso` endet, und hält die Suche klein.
 */
export function sleepNightForDate(
  segments: SleepSegment[],
  dateIso: string,
  offsetMinutes?: number,
): SleepNight | null {
  const dayStart = startOfDayMs(dateIso, offsetMinutes);
  const from = dayStart - 14 * 3_600_000;
  const to = dayStart + 20 * 3_600_000;
  const relevant = preferWatch(segments.filter((s) => s.endMs > from && s.startMs < to));

  let best: SleepSession | null = null;
  for (const s of groupSleepSessions(relevant)) {
    if (localDateOf(s.endMs, offsetMinutes) !== dateIso) continue;
    if (s.asleepMs < MIN_NIGHT_MS) continue;
    if (best === null || s.asleepMs > best.asleepMs) best = s;
  }
  if (best === null) return null;

  const hours = Math.round((best.asleepMs / 3_600_000) * 100) / 100;
  if (hours > MAX_NIGHT_HOURS) return null;
  const { deepMin, remMin } = stageMinutes(relevant, best);
  return { date: dateIso, startMs: best.startMs, endMs: best.endMs, hours, deepMin, remMin };
}

/**
 * Tief- und REM-Minuten innerhalb einer Session. Nur wenn die Nacht überhaupt Phasen enthält
 * (Deep, REM oder Core); sonst null statt einer irreführenden 0.
 */
function stageMinutes(
  segments: SleepSegment[],
  session: { startMs: number; endMs: number },
): { deepMin: number | null; remMin: number | null } {
  const inSession = segments.filter((s) => s.endMs > session.startMs && s.startMs < session.endMs);
  if (!inSession.some((s) => s.stage === 'deep' || s.stage === 'rem' || s.stage === 'core')) {
    return { deepMin: null, remMin: null };
  }
  const minutes = (stage: SleepStage): number => {
    const ms = mergeIntervals(
      inSession
        .filter((s) => s.stage === stage)
        .map((s) => ({ startMs: Math.max(s.startMs, session.startMs), endMs: Math.min(s.endMs, session.endMs) })),
    ).reduce((sum, iv) => sum + (iv.endMs - iv.startMs), 0);
    return Math.round(ms / 60_000);
  };
  return { deepMin: minutes('deep'), remMin: minutes('rem') };
}

/** Mittelpunkt der Nacht in Minuten seit Mitternacht des Aufwachtags (kann negativ sein). */
export function sleepMidpointMinutes(night: { startMs: number; endMs: number }, offsetMinutes?: number): number {
  const mid = (night.startMs + night.endMs) / 2;
  const dayStart = startOfDayMs(localDateOf(night.endMs, offsetMinutes), offsetMinutes);
  return (mid - dayStart) / 60_000;
}
