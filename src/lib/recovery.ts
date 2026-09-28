import { newId } from './workout';

/**
 * Recovery: eigener, bewusst einfacher Bereich – ein Eintrag pro Tag, im Kern eine
 * Ein-Item-Skala (Perceived Recovery Status), dazu optional ein paar kurze
 * Zusatzwerte und Health-Werte aus Apple Health. Reine Logik ohne Browser- oder
 * Datenbankzugriff, damit sie sich testen lässt und offline funktioniert.
 *
 * Warum PRS statt eines selbstgebauten Scores: Perceived Recovery Status (Laurent et
 * al. 2011, J Strength Cond Res) ist eine validierte Ein-Item-Skala 0-10, die mit
 * neuromuskulärer Leistungsfähigkeit und HRV korreliert und in Sekunden ausgefüllt
 * ist. Subjektive Wellness-Marker wie diese reagieren laut Saw, Main & Gastin (2016,
 * Br J Sports Med, systematisches Review) oft sensitiver auf Trainingsbelastung als
 * objektive Marker wie HRV/Ruhepuls – beide Datenarten ergänzen sich, siehe die
 * optionalen HRV/Ruhepuls/Schlaf-Felder unten (aus dem Apple-Health-Import,
 * healthImport.ts).
 */

export type RecoverySource = 'manual' | 'apple_health';

/** Anker der PRS-Skala (Laurent et al. 2011), zur Anzeige unter der Auswahl. */
const PRS_ANCHORS: Record<number, string> = {
  0: 'Extrem müde, keine Erholung',
  2: 'Sehr schlecht erholt',
  4: 'Etwas erholt',
  6: 'Ausreichend erholt',
  8: 'Gut erholt',
  10: 'Vollständig erholt',
};

/** Textanker zur nächstgelegenen Stufe (0, 2, 4, 6, 8 oder 10). */
export function prsAnchor(value: number): string {
  const nearest = Math.max(0, Math.min(10, Math.round(value / 2) * 2));
  return PRS_ANCHORS[nearest] ?? '';
}

export interface RecoveryEntryInput {
  /** Datum im Format "YYYY-MM-DD". */
  date: string;
  /** Perceived Recovery Status, 0-10. */
  perceivedRecovery: number;
  soreness?: number | null;
  stress?: number | null;
  sleepQuality?: number | null;
  note: string;
  /** Aus einem Apple-Health-Export übernommen oder manuell eingetragen; alle optional. */
  hrvMs?: number | null;
  restingHr?: number | null;
  sleepHours?: number | null;
  source?: RecoverySource;
}

export interface RecoveryPayload {
  entry: {
    id: string;
    date: string;
    perceived_recovery: number;
    soreness: number | null;
    stress: number | null;
    sleep_quality: number | null;
    note: string | null;
    hrv_ms: number | null;
    resting_hr: number | null;
    sleep_hours: number | null;
    source: RecoverySource;
  };
}

/** Ganzzahl im Bereich 1-5 oder null bei ungültiger/fehlender Eingabe. */
function scale1to5(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

function nonNegOrNull(n: number | null | undefined, max: number): number | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function restingHrOrNull(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 30 && r <= 120 ? r : null;
}

/**
 * Baut die Datenbankzeile aus der Formulareingabe. Ohne gültiges Datum oder PRS
 * außerhalb 0-10 wird nichts gespeichert (null); ungültige Zusatz-/Health-Werte werden
 * zu null statt die ganze Eingabe abzulehnen.
 */
export function buildRecoveryPayload(input: RecoveryEntryInput): RecoveryPayload | null {
  if (input.date.trim() === '') return null;
  const prs = Math.round(input.perceivedRecovery);
  if (!Number.isFinite(prs) || prs < 0 || prs > 10) return null;

  return {
    entry: {
      id: newId(),
      date: input.date,
      perceived_recovery: prs,
      soreness: scale1to5(input.soreness),
      stress: scale1to5(input.stress),
      sleep_quality: scale1to5(input.sleepQuality),
      note: input.note.trim() === '' ? null : input.note.trim(),
      hrv_ms: nonNegOrNull(input.hrvMs, 300),
      resting_hr: restingHrOrNull(input.restingHr),
      sleep_hours: nonNegOrNull(input.sleepHours, 16),
      source: input.source ?? 'manual',
    },
  };
}
