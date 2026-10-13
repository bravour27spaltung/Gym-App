/**
 * Apple-Watch-Werte für einen selbst gewählten Zeitraum (Tabelle fit_watch_ranges, von der Edge
 * Function football-import befüllt). Reine Logik ohne Browser-/DB-Zugriff.
 *
 * Ablauf: Die App startet den iOS-Kurzbefehl mit dem Zeitraum, der Kurzbefehl liest Ø/Max-Puls, Schritte
 * und Distanz aus Health und schickt sie an die Funktion; die App liest das Ergebnis und trägt es ins
 * Formular ein. Fehlt etwas, sagt diagnoseWatchRange, an welcher Stelle es hakt.
 */

/** Ein Ergebnis aus fit_watch_ranges. */
export interface WatchRangeRecord {
  fromAt: string;
  toAt: string;
  /** Wann die Funktion das Ergebnis gespeichert hat (Serverzeit). */
  receivedAt: string;
  hrSamples: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  steps: number | null;
  distanceKm: number | null;
}

/** Ø/Max-Puls, Schritte, Distanz (ohne Zeitangaben), zum Anzeigen und Übernehmen. */
export type WatchRangeSummary = Pick<
  WatchRangeRecord,
  'hrSamples' | 'avgHeartRate' | 'maxHeartRate' | 'steps' | 'distanceKm'
>;

/** Hat das Ergebnis überhaupt einen Wert, den die App übernehmen kann? */
export function hasWatchValues(r: WatchRangeSummary): boolean {
  return r.avgHeartRate !== null || r.distanceKm !== null || r.steps !== null;
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
 * Link, der den Kurzbefehl mit dem gewählten Zeitraum als Texteingabe startet:
 * "<Start>|<Ende>" als ISO 8601 in UTC (z. B. 2026-10-01T17:00:00Z|2026-10-01T18:30:00Z).
 * Der Kurzbefehl liest dann nur diese Zeitspanne aus Health und reicht den Text unverändert als
 * "range" an die Funktion zurück. Bewusst ohne x-callback-url: eine https-Rücksprungadresse würde in
 * Safari statt in der Home-Bildschirm-App landen (andere Anmeldung, anderer Speicher); stattdessen
 * wechselst du per Rücksprung-Link oben links zurück, die App holt das Ergebnis dann automatisch.
 */
export function watchShortcutUrl(fromMs: number, toMs: number): string {
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const text = encodeURIComponent(`${iso(fromMs)}|${iso(toMs)}`);
  return `shortcuts://run-shortcut?name=${encodeURIComponent(WATCH_SHORTCUT_NAME)}&input=text&text=${text}`;
}

export type WatchDiagnosisKind =
  /** Ergebnis für genau diesen Zeitraum, mit Werten. */
  | 'ok'
  /** Ergebnis angekommen, aber Health lieferte nichts. */
  | 'empty'
  /** Nur ein Ergebnis von vor dem Antippen (nichts Neues angekommen). */
  | 'stale'
  /** Kürzlich kam ein Ergebnis, aber für einen anderen Zeitraum. */
  | 'other-range'
  /** Nichts (Neues) angekommen. */
  | 'none';

export interface WatchDiagnosis {
  kind: WatchDiagnosisKind;
  text: string;
}

/** Ein Ergebnis ohne neuere Ankunft als so viele Millisekunden vor dem Antippen gilt als „nichts Neues“. */
export const WATCH_CLOCK_TOLERANCE_MS = 60_000;

const fmt = (iso: string | number): string =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Ordnet ein Ergebnis ein und erklärt, wo es hakt, wenn nichts übernommen werden kann.
 *
 * - `match`: Ergebnis für genau den gewählten Zeitraum (oder null)
 * - `latest`: das zuletzt eingegangene Ergebnis überhaupt (oder null, wenn noch nie eines kam)
 * - `sinceMs`: Zeitpunkt des Antippens; ein Ergebnis davor zählt nicht als Antwort auf diesen Lauf
 *   (sonst würden alte Werte oder ein alter Leer-Eintrag den neuen Lauf überdecken)
 */
export function diagnoseWatchRange(
  match: WatchRangeRecord | null,
  latest: WatchRangeRecord | null,
  fromMs: number,
  toMs: number,
  nowMs: number,
  sinceMs: number | null = null,
): WatchDiagnosis {
  const period = `${fmt(fromMs)}–${fmt(toMs)}`;
  const isStale = (r: WatchRangeRecord) =>
    sinceMs !== null && new Date(r.receivedAt).getTime() < sinceMs - WATCH_CLOCK_TOLERANCE_MS;

  if (match && !isStale(match)) {
    if (hasWatchValues(match)) return { kind: 'ok', text: `Übernommen: ${describeRangeSummary(match)}.` };
    return {
      kind: 'empty',
      text:
        'Der Kurzbefehl ist durchgelaufen und hat die Funktion erreicht, aber Health hat für ' +
        `${period} nichts geliefert. Prüfe: iPhone war entsperrt? Hat „Kurzbefehle“ in Health Zugriff auf ` +
        'Herzfrequenz, Schritte und Gehen + Laufen (Distanz)? Ist der Zeitraum richtig, und stammen die Werte von der Apple Watch?',
    };
  }

  if (match) {
    return {
      kind: 'stale',
      text:
        `Es kam nichts Neues an. Vorhanden ist nur ein älteres Ergebnis für ${period} (empfangen ${fmt(match.receivedAt)}). ` +
        'Der Kurzbefehl lief also nicht bis zum Senden. Öffne die Kurzbefehle-App und sieh nach, bei welcher Aktion er abbricht. ' +
        'Mit „Erneut prüfen“ kannst du das ältere Ergebnis trotzdem übernehmen.',
    };
  }

  if (latest) {
    const ageMin = Math.round((nowMs - new Date(latest.receivedAt).getTime()) / 60_000);
    const when = ageMin < 1 ? 'gerade eben' : ageMin < 120 ? `vor ${ageMin} min` : `am ${fmt(latest.receivedAt)}`;
    if (ageMin <= 15 && !isStale(latest)) {
      return {
        kind: 'other-range',
        text:
          `Es kam ${when} ein Ergebnis an, aber für ${fmt(latest.fromAt)}–${fmt(latest.toAt)} statt ${period}. ` +
          'Der Kurzbefehl hat den Zeitraum also verändert oder nicht aus der Eingabe gelesen. Er muss die Eingabe unverändert als „range“ zurückgeben.',
      };
    }
    return {
      kind: 'none',
      text:
        `Es ist nichts angekommen. Das letzte Ergebnis überhaupt kam ${when} (für ${fmt(latest.fromAt)}–${fmt(latest.toAt)}). ` +
        'Entweder brach der Kurzbefehl vor dem Senden ab (Kurzbefehle-App öffnen, Fehlermeldung ansehen, iPhone entsperrt lassen), ' +
        'oder die Funktion hat die Anfrage abgelehnt; der Kurzbefehl zeigt dann deren Meldung.',
    };
  }

  return {
    kind: 'none',
    text:
      'Es ist noch nie etwas angekommen. Teste zuerst die Verbindung mit dem Test-Kurzbefehl aus der README (Stufe 1), ' +
      'dann den vollständigen Kurzbefehl. Bricht er ab, zeigt die Kurzbefehle-App die Aktion mit dem Fehler.',
  };
}
