/** Anzeige von Zahlen und Datumsangaben auf Deutsch. */

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export const num0 = (n: number): string => nf0.format(n);
export const num1 = (n: number): string => nf1.format(n);

/** "62,5 kg" (höchstens zwei Nachkommastellen). */
export const fmtKg = (kg: number): string => `${nf2.format(kg)} kg`;

/** Volumen in kg mit Tausenderpunkt, z. B. "5.240 kg". */
export const fmtVolume = (kg: number): string => `${num0(kg)} kg`;

/** Volumen kompakt: ab 1.000 kg in Tonnen ("7,9 t"), sonst in kg. */
export const fmtVolumeShort = (kg: number): string => (kg >= 1000 ? `${num1(kg / 1000)} t` : `${num0(kg)} kg`);

/** "+8 %" bzw. "−3 %" (echtes Minuszeichen), "±0 %" bei null. */
export function fmtPercent(pct: number): string {
  if (pct === 0) return '±0 %';
  return `${pct > 0 ? '+' : '−'}${num0(Math.abs(pct))} %`;
}

/** "Do., 25.09." */
export function fmtDay(iso: string | number): string {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** "Donnerstag, 25. September 2026" */
export function fmtDayLong(iso: string | number): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "25.09." */
export function fmtShort(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/** "25.09.26" */
export function fmtShortYear(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** "10:05" */
export function fmtTime(iso: string | number): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Schöne Achsenteilung: liefert Werte von unten nach oben, deren Abstand 1, 2, 2,5 oder 5 mal Zehnerpotenz ist. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max === min) {
    const pad = Math.max(1, Math.abs(max) * 0.1);
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pow;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
