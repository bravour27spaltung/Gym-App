/**
 * Recovery-Eingang: Apple-Health-Werte, die der Kurzbefehl vor dem Tageseintrag geliefert hat
 * (Tabelle fit_recovery_health_inbox, Migration 0017). Reine Logik ohne Datenbankzugriff.
 */
import type { HistRecoveryEntry } from './storage';

export interface RecoveryInboxRow {
  date: string;
  hrvMs: number | null;
  restingHr: number | null;
  sleepHours: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
  deepSleepMin?: number | null;
  remSleepMin?: number | null;
}

export interface RecoveryInboxPatch {
  hrvMs?: number;
  restingHr?: number;
  sleepHours?: number;
  sleepStart?: string;
  sleepEnd?: string;
  deepSleepMin?: number;
  remSleepMin?: number;
}

/**
 * Welche Werte aus dem Eingang in den Eintrag übernommen werden. Vorhandene Werte werden nie
 * überschrieben. Ausnahme wie bei recovery-import: Ein Apple-Health-Schlafwert ohne Nachtfenster
 * stammt aus der alten Fenster-Methode und wird durch die Nacht ersetzt. Leeres Objekt = nichts zu tun.
 */
export function inboxPatchFor(entry: HistRecoveryEntry, inbox: RecoveryInboxRow): RecoveryInboxPatch {
  const patch: RecoveryInboxPatch = {};
  if (entry.hrvMs === null && inbox.hrvMs !== null) patch.hrvMs = inbox.hrvMs;
  if (entry.restingHr === null && inbox.restingHr !== null) patch.restingHr = inbox.restingHr;
  const legacy = entry.sleepHours !== null && entry.sleepStart === null && entry.source === 'apple_health';
  if ((entry.sleepHours === null || legacy) && inbox.sleepHours !== null) {
    patch.sleepHours = inbox.sleepHours;
    if (inbox.sleepStart !== null && inbox.sleepEnd !== null) {
      patch.sleepStart = inbox.sleepStart;
      patch.sleepEnd = inbox.sleepEnd;
    }
  }
  // Tief-/REM-Minuten ergänzen, solange noch nichts da ist (auch bei schon vorhandener Schlafdauer).
  if ((entry.deepSleepMin ?? null) === null && (inbox.deepSleepMin ?? null) !== null) patch.deepSleepMin = inbox.deepSleepMin as number;
  if ((entry.remSleepMin ?? null) === null && (inbox.remSleepMin ?? null) !== null) patch.remSleepMin = inbox.remSleepMin as number;
  return patch;
}

/**
 * Soll beim ersten Öffnen am Tag die Recovery-Abfrage erscheinen? Nur wenn für heute weder ein
 * Eintrag noch ein noch nicht gesendeter Eintrag im Ausgangskorb vorliegt, die Abfrage heute noch
 * nicht gezeigt wurde und gerade kein Training läuft.
 */
export function shouldPromptRecovery(args: {
  today: string;
  history: { date: string }[];
  outboxDates: string[];
  lastPromptDate: string | null;
  workoutRunning: boolean;
}): boolean {
  if (args.workoutRunning) return false;
  if (args.lastPromptDate === args.today) return false;
  if (args.history.some((h) => h.date === args.today)) return false;
  return !args.outboxDates.includes(args.today);
}
