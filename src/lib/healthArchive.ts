/**
 * Health-Archiv (Tabelle fit_health_samples, Migration 0022): Rohwerte der Apple Watch, die ein automatischer
 * Kurzbefehl über die Edge Function football-import?archive=1 ablegt. Aus dem Archiv rechnet die App Ø/Max-Puls,
 * Schritte, Distanz und aktive Energie für jeden frei gewählten Zeitraum, auch Tage nach der Einheit.
 *
 * Die Rechenregeln stammen aus supabase/functions/football-import/parse.ts (summarizeRange), damit Archiv-Weg und
 * Kurzbefehl-Weg dieselben Zahlen liefern. Reine Logik ohne Browser-/DB-Zugriff.
 */
import { summarizeRange, type Sample, type RangeResult } from '../../supabase/functions/football-import/parse';
import type { WatchRangeSummary } from './footballWatch';

/** Eine Zeile aus fit_health_samples, wie die App sie liest. */
export interface ArchiveRow {
  kind: 'hr' | 'steps' | 'distance' | 'energy';
  start_at: string;
  end_at: string;
  value: number | string;
  source: string | null;
}

export interface ArchiveLookup {
  summary: WatchRangeSummary;
  /** Zeitpunkt des neuesten archivierten Pulswerts überhaupt (ISO), null wenn das Archiv leer ist. */
  lastHrAt: string | null;
}

function toSamples(rows: ArchiveRow[], kind: ArchiveRow['kind']): Sample[] {
  const out: Sample[] = [];
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const startMs = Date.parse(r.start_at);
    const endMs = Date.parse(r.end_at);
    const value = Number(r.value);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(value)) continue;
    out.push(r.source ? { startMs, endMs, value, source: r.source } : { startMs, endMs, value });
  }
  return out;
}

/** Ø/Max-Puls, Schritte, Distanz und Energie für [fromMs, toMs] aus Archiv-Zeilen. */
export function summarizeArchive(rows: ArchiveRow[], fromMs: number, toMs: number): RangeResult {
  return summarizeRange(
    toSamples(rows, 'hr'),
    toSamples(rows, 'steps'),
    toSamples(rows, 'distance'),
    fromMs,
    toMs,
    toSamples(rows, 'energy'),
  );
}

/**
 * Erklärt, warum das Archiv für den Zeitraum nichts liefert, damit „leer“ nicht wie ein Fehler der App wirkt:
 * Archiv noch leer, Zeitraum liegt nach dem letzten archivierten Wert (Kurzbefehl lief noch nicht), oder
 * davor (Archiv reicht nicht so weit zurück bzw. Uhr nicht getragen).
 */
export function describeArchiveMiss(lookup: ArchiveLookup, fromMs: number): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (lookup.lastHrAt === null) {
    return 'Das Archiv ist noch leer. Sobald der automatische Kurzbefehl einmal gelaufen ist, stehen die Werte hier zur Verfügung.';
  }
  const last = Date.parse(lookup.lastHrAt);
  if (last < fromMs) {
    return (
      `Im Archiv liegt für diesen Zeitraum nichts, der neueste archivierte Puls ist von ${fmt(last)}. ` +
      'Der automatische Kurzbefehl ist seither nicht gelaufen: iPhone entsperren oder den Kurzbefehl einmal von Hand starten.'
    );
  }
  return (
    'Im Archiv liegt für diesen Zeitraum nichts. Entweder lag die Uhr nicht am Handgelenk, oder die Werte sind älter, ' +
    'als der Kurzbefehl zurückreichte (er erreicht nur die ~250 neuesten Pulswerte). Alternativ unten „Apple-Watch-Daten holen“ oder den Health-Export nutzen.'
  );
}
