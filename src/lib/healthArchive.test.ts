import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_GAP_MS,
  archiveGap,
  buildArchive,
  describeArchive,
  findIdenticalFields,
} from '../../supabase/functions/football-import/parse';
import { describeArchiveMiss, summarizeArchive, type ArchiveRow } from './healthArchive';

const MIN = 60_000;
const NOW = Date.parse('2026-10-29T22:30:00+01:00');
const at = (hhmm: string) => `2026-10-29T${hhmm}:00+01:00`;

describe('buildArchive', () => {
  it('liest Puls, Schritte, Distanz und Energie und zählt je Art', () => {
    const r = buildArchive(
      {
        hr: `${at('19:10')}|128 count/min\n${at('19:15')}|141 count/min`,
        steps: `${at('19:10')}|${at('19:15')}|312 count|Apple Watch von Steffen`,
        distance: `${at('19:10')}|${at('19:15')}|0,25 km|Apple Watch von Steffen`,
        energy: `${at('19:10')}|${at('19:15')}|21 kcal|Apple Watch von Steffen`,
      },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.counts).toEqual({ hr: 2, steps: 1, distance: 1, energy: 1 });
    expect(r.invalid).toBe(0);
    expect(r.oldestHrMs).toBe(Date.parse(at('19:10')));
    expect(r.newestHrMs).toBe(Date.parse(at('19:15')));
    expect(r.rows.find((x) => x.kind === 'steps')?.source).toBe('Apple Watch von Steffen');
    expect(r.rows.find((x) => x.kind === 'hr')?.source).toBe('');
  });

  it('führt Dopplungen im selben Aufruf zusammen (sonst scheitert der Upsert in der Datenbank)', () => {
    const r = buildArchive({ hr: `${at('19:10')}|128\n${at('19:10')}|129` }, NOW);
    expect(r.ok && r.rows.length).toBe(1);
    expect(r.ok && r.duplicates).toBe(1);
    expect(r.ok && r.rows[0].value).toBe(129);
  });

  it('hält iPhone und Watch mit gleichem Zeitstempel auseinander (Quelle gehört zum Schlüssel)', () => {
    const r = buildArchive(
      { steps: `${at('19:10')}|${at('19:15')}|300|iPhone\n${at('19:10')}|${at('19:15')}|310|Apple Watch` },
      NOW,
    );
    expect(r.ok && r.rows.length).toBe(2);
  });

  it('verwirft Unplausibles und zählt es als ungültig', () => {
    const r = buildArchive(
      {
        hr: `${at('19:10')}|250\n${at('19:11')}|12\n${at('19:12')}|130\n19:13 ohne Datum|130`,
        distance: `${at('19:10')}|${at('19:15')}|150 km`,
        steps: `${at('19:10')}|${at('19:15')}|-5`,
      },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.counts.hr).toBe(1);
    expect(r.counts.distance).toBe(0);
    expect(r.counts.steps).toBe(0);
    expect(r.invalid).toBe(5);
  });

  it('verwirft Zeitstempel in der Zukunft und Intervalle über 24 h', () => {
    const r = buildArchive(
      {
        hr: `2026-10-30T09:00:00+01:00|130`,
        steps: `2026-10-27T10:00:00+01:00|2026-10-29T10:00:00+01:00|900`,
      },
      NOW,
    );
    expect(r.ok && r.rows.length).toBe(0);
    expect(r.ok && r.invalid).toBe(2);
  });

  it('lehnt identische Felder ab (eine Variable doppelt belegt)', () => {
    const same = `${at('19:10')}|130`;
    const r = buildArchive({ hr: same, distance: same }, NOW);
    expect(r.ok).toBe(false);
    expect(findIdenticalFields({ hr: same, distance: same })).toMatch(/identisch/);
    expect(findIdenticalFields({ hr: same, distance: `${at('19:11')}|1` })).toBeNull();
  });

  it('akzeptiert ein Array aus Textzeilen wie vom Kurzbefehl', () => {
    const r = buildArchive({ hr: [`${at('19:10')}|130`, `${at('19:11')}|131`] }, NOW);
    expect(r.ok && r.counts.hr).toBe(2);
  });
});

describe('archiveGap / describeArchive', () => {
  const last = Date.parse(at('18:00'));
  it('meldet eine Lücke erst ab der Toleranz', () => {
    expect(archiveGap(last, last + ARCHIVE_GAP_MS)).toBeNull();
    expect(archiveGap(last, last + ARCHIVE_GAP_MS + MIN)).toEqual({ fromMs: last, toMs: last + ARCHIVE_GAP_MS + MIN });
    expect(archiveGap(null, last)).toBeNull();
    expect(archiveGap(last, null)).toBeNull();
    // Überlappung (ältester neuer Wert vor dem letzten gespeicherten): lückenlos
    expect(archiveGap(last, last - 3 * MIN)).toBeNull();
  });

  it('beschreibt Anzahl, Pulsbereich und Lücke im Klartext', () => {
    const r = buildArchive({ hr: `${at('19:10')}|128\n${at('21:00')}|141` }, NOW);
    if (!r.ok) throw new Error('unerwartet');
    const text = describeArchive(r, archiveGap(last, r.oldestHrMs), false);
    expect(text).toMatch(/^Archiviert: 2 Puls/);
    expect(text).toMatch(/Hinweis: zwischen .* fehlen Pulswerte/);
    expect(describeArchive(r, null, true)).toMatch(/^Würde archivieren/);
    expect(describeArchive(r, null, false)).not.toMatch(/Hinweis/);
  });

  it('sagt es klar, wenn nichts Verwertbares ankam', () => {
    const r = buildArchive({ hr: '' }, NOW);
    if (!r.ok) throw new Error('unerwartet');
    expect(describeArchive(r, null, false)).toMatch(/ohne verwertbare Werte/);
  });
});

describe('summarizeArchive (App-Seite)', () => {
  const rows: ArchiveRow[] = [
    { kind: 'hr', start_at: at('19:00'), end_at: at('19:00'), value: 120, source: null },
    { kind: 'hr', start_at: at('19:05'), end_at: at('19:05'), value: 160, source: '' },
    { kind: 'hr', start_at: at('20:30'), end_at: at('20:30'), value: 90, source: null },
    { kind: 'steps', start_at: at('19:00'), end_at: at('19:10'), value: '600', source: 'Apple Watch von Steffen' },
    { kind: 'steps', start_at: at('19:00'), end_at: at('19:10'), value: '590', source: 'iPhone von Steffen' },
    { kind: 'distance', start_at: at('19:00'), end_at: at('19:10'), value: '0.5', source: 'Apple Watch von Steffen' },
    { kind: 'energy', start_at: at('19:00'), end_at: at('19:10'), value: 40, source: 'Apple Watch von Steffen' },
  ];

  it('rechnet Ø/Max-Puls nur im Zeitraum und zählt Schritte nur von der Watch', () => {
    const s = summarizeArchive(rows, Date.parse(at('19:00')), Date.parse(at('20:00')));
    expect(s.hrSamples).toBe(2);
    expect(s.avgHeartRate).toBe(140);
    expect(s.maxHeartRate).toBe(160);
    expect(s.steps).toBe(600);
    expect(s.distanceKm).toBe(0.5);
    expect(s.energyKcal).toBe(40);
  });

  it('rechnet Intervalle an der Grenze anteilig', () => {
    const s = summarizeArchive(rows, Date.parse(at('19:05')), Date.parse(at('19:30')));
    expect(s.steps).toBe(300);
  });

  it('liefert lauter null für einen Zeitraum ohne Werte', () => {
    const s = summarizeArchive(rows, Date.parse(at('12:00')), Date.parse(at('13:00')));
    expect(s).toEqual({ hrSamples: 0, avgHeartRate: null, maxHeartRate: null, steps: null, distanceKm: null, energyKcal: null });
  });
});

describe('describeArchiveMiss', () => {
  const from = Date.parse(at('19:00'));
  it('unterscheidet leeres Archiv, zu altes Archiv und Zeitraum ohne Werte', () => {
    expect(describeArchiveMiss({ summary: {} as never, lastHrAt: null }, from)).toMatch(/noch leer/);
    expect(describeArchiveMiss({ summary: {} as never, lastHrAt: at('08:00') }, from)).toMatch(/nicht gelaufen/);
    expect(describeArchiveMiss({ summary: {} as never, lastHrAt: at('22:00') }, from)).toMatch(/Uhr nicht am Handgelenk/);
  });
});
