/**
 * Pulszonen und Zeit je Zone. Reine Logik ohne Browser- oder Datenbankzugriff.
 *
 * Fünf Zonen in Prozent von 50 bis 100 (Schrittweite 10). Zwei Modelle:
 *  - 'hrr': Herzfrequenzreserve (Karvonen): Ruhepuls + Anteil × (Maximalpuls − Ruhepuls). Nutzt den Ruhepuls, den die App
 *    ohnehin aus Recovery kennt.
 *  - 'max': Anteil vom Maximalpuls.
 * Die Zonenaufteilung in Fünfer-Stufen ist eine Konvention, keine harte Evidenz; Einordnung der Quellen steht in der README.
 *
 * Die Zonenzeiten werden aus den Pulswerten des Health-Archivs genähert: Ohne gestartete Aufzeichnung liegen nur alle paar
 * Minuten Werte vor. Jeder Wert gilt deshalb nur für die Zeit bis zur Mitte zum Nachbarwert, höchstens aber maxGapSec / 2
 * in jede Richtung. Lücken bleiben als „nicht abgedeckt“ stehen, statt erfunden zu werden, und die Ausgabe sagt, wie dicht
 * die Daten waren.
 */

export type ZoneModel = 'hrr' | 'max';

export const ZONE_COUNT = 5;
/** Untergrenzen der Zonen 1–5 und Obergrenze von Zone 5, als Anteil. */
export const ZONE_PERCENTS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const;

const HR_MIN = 30;
const HR_MAX = 220;

export interface ZoneSettings {
  model: ZoneModel;
  /** Maximalpuls in bpm. */
  maxHr: number;
  /** Ruhepuls in bpm; nur für das Modell 'hrr' nötig. */
  restHr: number | null;
}

function validHr(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= HR_MIN && n <= HR_MAX;
}

/** Höchster gültiger Wert (Vorschlag für den Maximalpuls); null ohne gültigen Wert. */
export function observedMaxHr(values: Array<number | null | undefined>): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (validHr(v) && (max === null || v > max)) max = Math.round(v);
  }
  return max;
}

/** Mittelwert der gültigen Ruhepulswerte, gerundet; null ohne gültigen Wert. */
export function averageRestHr(values: Array<number | null | undefined>): number | null {
  const ok = values.filter(validHr);
  if (ok.length === 0) return null;
  return Math.round(ok.reduce((a, b) => a + b, 0) / ok.length);
}

export interface ResolvedZoneSettings extends ZoneSettings {
  /** true, wenn 'hrr' gewünscht war, aber kein brauchbarer Ruhepuls vorlag und deshalb mit 'max' gerechnet wird. */
  fellBack: boolean;
}

/**
 * Wählt die Einstellungen, mit denen wirklich gerechnet wird. Fehlt der Ruhepuls oder liegt er nicht unter dem
 * Maximalpuls, wird auf das Modell 'max' zurückgefallen. Ohne gültigen Maximalpuls gibt es keine Zonen (null).
 */
export function resolveZoneSettings(
  preferred: ZoneModel,
  maxHr: number | null | undefined,
  restHr: number | null | undefined,
): ResolvedZoneSettings | null {
  if (!validHr(maxHr)) return null;
  const max = Math.round(maxHr);
  const rest = validHr(restHr) && restHr < max ? Math.round(restHr) : null;
  if (preferred === 'hrr' && rest !== null) return { model: 'hrr', maxHr: max, restHr: rest, fellBack: false };
  return { model: 'max', maxHr: max, restHr: rest, fellBack: preferred === 'hrr' };
}

/** Sechs Grenzen in bpm (Untergrenze Zone 1 bis Obergrenze Zone 5), auf ganze bpm gerundet. */
export function zoneBounds(s: ZoneSettings): number[] {
  if (s.model === 'hrr' && s.restHr !== null) {
    const rest = s.restHr;
    return ZONE_PERCENTS.map((p) => Math.round(rest + p * (s.maxHr - rest)));
  }
  return ZONE_PERCENTS.map((p) => Math.round(p * s.maxHr));
}

/** Zone 0–4 für Zone 1–5; −1 unterhalb von Zone 1. Werte über dem Maximalpuls zählen zu Zone 5. */
export function zoneIndex(bpm: number, bounds: number[]): number {
  if (bpm < bounds[0]) return -1;
  for (let i = ZONE_COUNT - 1; i >= 0; i--) if (bpm >= bounds[i]) return i;
  return -1;
}

export interface HrPoint {
  tMs: number;
  bpm: number;
}

/** Eine Zeile des Health-Archivs (fit_health_samples), nur die hier gebrauchten Felder. */
export interface ArchiveHrRow {
  kind: string;
  start_at: string;
  end_at: string;
  value: number | string;
}

/** Pulswerte aus Archiv-Zeilen; Zeitpunkt = Mitte von Start und Ende. Ungültige Zeilen werden übersprungen. */
export function hrPointsFromArchive(rows: ArchiveHrRow[]): HrPoint[] {
  const out: HrPoint[] = [];
  for (const r of rows) {
    if (r.kind !== 'hr') continue;
    const a = Date.parse(r.start_at);
    const b = Date.parse(r.end_at);
    const bpm = Number(r.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !validHr(bpm)) continue;
    out.push({ tMs: (a + b) / 2, bpm });
  }
  return out;
}

export interface ZoneDistribution {
  /** Sekunden in Zone 1–5. */
  seconds: number[];
  /** Sekunden unterhalb von Zone 1. */
  belowSeconds: number;
  /** Von Pulswerten abgedeckte Zeit (Summe aller Zonen plus unterhalb). */
  coveredSeconds: number;
  /** Länge des Zeitraums. */
  totalSeconds: number;
  /** Anteil der abgedeckten Zeit, 0–1. */
  coverage: number;
  sampleCount: number;
  /** Median des Abstands zweier aufeinanderfolgender Werte in Sekunden; null bei weniger als zwei Werten. */
  medianGapSec: number | null;
  /** true, wenn die Zeiten nur grob stimmen: dünne Daten (Median-Abstand über 30 s) oder weniger als 80 % abgedeckt. */
  approximate: boolean;
}

/**
 * Zeit je Zone im Zeitraum [fromMs, toMs]. maxGapSec: größte Lücke, über die ein Wert fortgeschrieben wird (Standard
 * 6 Minuten, je Wert also höchstens 3 Minuten in jede Richtung).
 */
export function zoneDistribution(
  points: HrPoint[],
  fromMs: number,
  toMs: number,
  bounds: number[],
  maxGapSec = 360,
): ZoneDistribution {
  const totalSeconds = Math.max(0, (toMs - fromMs) / 1000);
  const pts = points
    .filter((p) => Number.isFinite(p.tMs) && p.tMs >= fromMs && p.tMs <= toMs && validHr(p.bpm))
    .sort((a, b) => a.tMs - b.tMs);
  const seconds = new Array<number>(ZONE_COUNT).fill(0);
  let below = 0;
  const reach = (maxGapSec * 1000) / 2;

  pts.forEach((p, i) => {
    const prev = i > 0 ? (pts[i - 1].tMs + p.tMs) / 2 : p.tMs - reach;
    const next = i < pts.length - 1 ? (p.tMs + pts[i + 1].tMs) / 2 : p.tMs + reach;
    const left = Math.max(prev, p.tMs - reach, fromMs);
    const right = Math.min(next, p.tMs + reach, toMs);
    const sec = Math.max(0, right - left) / 1000;
    const z = zoneIndex(p.bpm, bounds);
    if (z < 0) below += sec;
    else seconds[z] += sec;
  });

  const covered = below + seconds.reduce((a, b) => a + b, 0);
  const gaps: number[] = [];
  for (let i = 1; i < pts.length; i++) gaps.push((pts[i].tMs - pts[i - 1].tMs) / 1000);
  gaps.sort((a, b) => a - b);
  const medianGapSec =
    gaps.length === 0
      ? null
      : gaps.length % 2 === 1
        ? gaps[(gaps.length - 1) / 2]
        : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  const coverage = totalSeconds > 0 ? Math.min(1, covered / totalSeconds) : 0;
  return {
    seconds,
    belowSeconds: below,
    coveredSeconds: covered,
    totalSeconds,
    coverage,
    sampleCount: pts.length,
    medianGapSec,
    approximate: medianGapSec === null || medianGapSec > 30 || coverage < 0.8,
  };
}

export interface IntensityShares {
  /** Zone 1–2 und alles unterhalb von Zone 1. */
  easy: number;
  /** Zone 3. */
  moderate: number;
  /** Zone 4–5. */
  hard: number;
}

/** Anteile locker/mittel/hart an der abgedeckten Zeit (Summe 1); null, wenn keine Zeit abgedeckt ist. */
export function intensityShares(d: Pick<ZoneDistribution, 'seconds' | 'belowSeconds' | 'coveredSeconds'>): IntensityShares | null {
  if (d.coveredSeconds <= 0) return null;
  const easy = (d.belowSeconds + d.seconds[0] + d.seconds[1]) / d.coveredSeconds;
  const moderate = d.seconds[2] / d.coveredSeconds;
  const hard = (d.seconds[3] + d.seconds[4]) / d.coveredSeconds;
  return { easy, moderate, hard };
}

/** Gespeicherte Wahl der Zonenberechnung (nur die Einstellung, nicht die berechneten Zonen). */
export interface ZonePrefs {
  model: ZoneModel;
  /** Eigener Maximalpuls; null = höchster gemessener Wert aus den Einträgen. */
  maxHrOverride: number | null;
}

export const DEFAULT_ZONE_PREFS: ZonePrefs = { model: 'hrr', maxHrOverride: null };

/** Macht aus gespeicherten (evtl. veralteten oder beschädigten) Werten gültige Einstellungen. */
export function normalizeZonePrefs(raw: unknown): ZonePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ZonePrefs, unknown>>;
  const model: ZoneModel = r.model === 'max' ? 'max' : 'hrr';
  const o = typeof r.maxHrOverride === 'number' ? Math.round(r.maxHrOverride) : null;
  return { model, maxHrOverride: o !== null && validHr(o) ? o : null };
}
