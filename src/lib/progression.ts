import { formatKg, fromQuarters, toQuarters } from './weight';

/**
 * Double Progression.
 *
 * Regel (nach Vorgabe):
 *  - Es gibt einen Wiederholungsbereich [min, max].
 *  - Das Wiederholungsziel ist immer die Obergrenze des Bereichs, egal ob
 *    gerade gehalten oder gesteigert wird: Man zielt jedes Mal auf die
 *    Obergrenze, das tatsächliche Ergebnis entscheidet dann, ob beim nächsten
 *    Mal das Gewicht steigt.
 *  - Gesteigert wird, wenn in MEHR ALS EINEM Arbeitssatz die obere Grenze
 *    erreicht wurde. Weitere Sätze darunter (z. B. 12 / 12 / 11) sind egal.
 *  - Sonst: Gewicht halten und weiter auf die Obergrenze zielen.
 *
 * Sprunggröße bei "Steigern" (Autoregulation über den Wiederholungs-
 * Überschuss):
 *  - RIR wird in dieser App nicht mehr abgefragt (siehe README), steht also
 *    für eine Autoregulation nicht zur Verfügung. Stattdessen wertet die
 *    Sprunggröße aus, wie weit die qualifizierenden Sätze (die die
 *    Obergrenze erreicht haben) im Schnitt über der Obergrenze lagen –
 *    eine Größe, die ohnehin ohne Zusatzeingabe aus den geloggten
 *    Wiederholungen vorliegt.
 *  - Genau an der Obergrenze (kein Überschuss) → kleiner Sprung (2,5 %).
 *    1–2 Wiederholungen darüber → mittlerer Sprung (5 %). 3 oder mehr
 *    darüber → größerer Sprung (7,5 %), das Gewicht war vermutlich zu
 *    leicht angesetzt. Das neue Gewicht wird direkt als Vorbelegung für
 *    den nächsten Satz übernommen, bleibt aber änderbar.
 *  - Das ist eine eigene, praktische Faustregel (kein Verweis auf eine
 *    einzelne Studie): Sie greift den Grundgedanken RIR-/RPE-basierter
 *    Autoregulation auf (u. a. Helms et al. 2018, "Application of the
 *    Repetitions in Reserve-Based Rating of Perceived Exertion Scale") –
 *    "deutlich über dem Zielbereich" als objektiv geloggtes Analogon zu
 *    "spürbar viel Reserve übrig" –, ist aber selbst nicht separat
 *    validiert. Wie Double Progression insgesamt ist das eine Praxisregel,
 *    keine Studienformel.
 *
 * Hinweis zur Evidenz: Double Progression ist eine Praxisregel und selbst
 * nicht in Studien getestet. Sie setzt progressive Überlastung um.
 */

export interface LoggedSet {
  type: 'warmup' | 'working';
  weightKg: number;
  reps: number;
  /**
   * Wiederholungen in Reserve; 0 = Muskelversagen. null = nicht erfasst.
   * Wird in dieser App nicht mehr abgefragt (siehe README) und deshalb für
   * die Progressionsvorschläge nicht ausgewertet; das Feld bleibt für alte
   * Datensätze bestehen.
   */
  rir: number | null;
}

export interface ProgressionInput {
  sets: LoggedSet[];
  repMin: number;
  repMax: number;
}

export type ProgressionAction = 'increase' | 'hold' | 'no-data';

export interface ProgressionSuggestion {
  action: ProgressionAction;
  weightKg: number | null;
  targetReps: number | null;
  reason: string;
  /**
   * Sprunggröße bei "Steigern", aus dem Wiederholungs-Überschuss über der
   * Obergrenze abgeleitet; null nur, wenn action nicht "increase" ist.
   * weightKg trägt bereits die Summe (bisheriges Gewicht + incrementKg).
   */
  incrementKg: number | null;
}

/** Rundet einen Sprung auf 0,25 kg, mindestens aber 0,25 kg (nie 0). */
function roundIncrement(raw: number): number {
  const q = Math.round(raw / 0.25);
  return fromQuarters(Math.max(1, q));
}

/**
 * Sprunggröße aus dem mittleren Wiederholungs-Überschuss der
 * qualifizierenden Sätze (die die Obergrenze erreicht haben) über dieser
 * Obergrenze. Größerer Überschuss = mehr Reserve = größerer Sprung.
 */
function incrementFromOvershoot(qualifying: LoggedSet[], repMax: number, workWeightKg: number): number {
  const overshoots = qualifying.map((s) => s.reps - repMax);
  const avg = overshoots.reduce((a, b) => a + b, 0) / overshoots.length;
  const pct = avg < 1 ? 0.025 : avg < 3 ? 0.05 : 0.075;
  return roundIncrement(workWeightKg * pct);
}

export function suggestProgression(input: ProgressionInput): ProgressionSuggestion {
  const { repMin, repMax } = input;
  if (repMin > repMax) throw new Error('repMin darf nicht größer als repMax sein');

  const working = input.sets.filter((s) => s.type === 'working');
  if (working.length === 0) {
    return {
      action: 'no-data',
      weightKg: null,
      targetReps: repMax,
      incrementKg: null,
      reason: `Keine Arbeitssätze vom letzten Training vorhanden. Ziel: ${repMax} Wiederholungen (Obergrenze).`,
    };
  }

  // Das Arbeitsgewicht ist das höchste Gewicht der Arbeitssätze.
  const workWeightQ = Math.max(...working.map((s) => toQuarters(s.weightKg)));
  const workWeight = fromQuarters(workWeightQ);
  const atWorkWeight = working.filter((s) => toQuarters(s.weightKg) === workWeightQ);

  const atTop = atWorkWeight.filter((s) => s.reps >= repMax);

  if (atTop.length > 1) {
    const incrementKg = incrementFromOvershoot(atTop, repMax, workWeight);
    const newWeight = fromQuarters(toQuarters(workWeight) + toQuarters(incrementKg));
    const reason =
      `${atTop.length} Sätze mit ${repMax} oder mehr Wiederholungen: Gewicht erhöhen. ` +
      `Vorschlag: ${formatKg(newWeight)} (+${formatKg(incrementKg)}). Änderbar.` +
      ` Ziel bleibt bei ${repMax} Wiederholungen.`;
    return { action: 'increase', weightKg: newWeight, targetReps: repMax, incrementKg, reason };
  }

  let reason: string;
  if (atTop.length === 1) {
    reason =
      `Obere Grenze nur in einem Satz erreicht. Für die Steigerung sind mehr ` +
      `als ein Satz nötig. Gewicht halten, weiter auf ${repMax} Wiederholungen zielen.`;
  } else {
    reason = `Obere Grenze (${repMax}) noch nicht erreicht. Gewicht halten, ${repMax} Wiederholungen anstreben.`;
  }

  return { action: 'hold', weightKg: workWeight, targetReps: repMax, incrementKg: null, reason };
}

/** Höchstes Gewicht der Arbeitssätze (das Arbeitsgewicht des letzten Trainings); null ohne Daten. */
export function lastWorkingWeightKg(sets: LoggedSet[]): number | null {
  const working = sets.filter((s) => s.type === 'working');
  if (working.length === 0) return null;
  return Math.max(...working.map((s) => s.weightKg));
}

export function lastWorkingSetCount(sets: LoggedSet[]): number {
  return sets.filter((s) => s.type === 'working').length;
}
