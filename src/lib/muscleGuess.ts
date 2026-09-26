import type { MuscleKey } from './muscles';

/**
 * Schlägt Muskelgruppen anhand des Übungsnamens vor (deutsche und englische Begriffe).
 * Das ist eine einfache Stichwort-Zuordnung nach gängiger Einteilung von Krafttrainingsübungen,
 * keine gemessene Größe: Der Vorschlag spart Tipparbeit, du prüfst und korrigierst ihn.
 * Die erste passende Regel gilt, deshalb stehen Spezialfälle vor den allgemeinen Regeln
 * (z. B. "Beinbeugen" vor "Curl", "Aufrechtes Rudern" vor "Rudern").
 */

export interface MuscleGuess {
  primary: MuscleKey[];
  secondary: MuscleKey[];
}

interface Rule {
  test: RegExp;
  primary: MuscleKey[];
  secondary: MuscleKey[];
}

const RULES: Rule[] = [
  { test: /beinbeug|leg curl|hamstring curl|nordic/, primary: ['hamstrings'], secondary: ['calves'] },
  { test: /beinstreck|leg extension/, primary: ['quadriceps'], secondary: [] },
  { test: /wadenheb|calf|waden/, primary: ['calves'], secondary: [] },
  { test: /adduktor|adductor/, primary: ['adductors'], secondary: [] },
  { test: /abduktor|abductor|hip abduction/, primary: ['abductors'], secondary: ['glutes'] },
  {
    test: /kreuzheb|deadlift|rum(ä|ae|a)nisch|romanian|good ?morning|stiff/,
    primary: ['hamstrings', 'glutes'],
    secondary: ['lower back'],
  },
  {
    test: /beinpress|leg press|kniebeug|squat|hackenschmidt|ausfallschritt|lunge|step-?up/,
    primary: ['quadriceps'],
    secondary: ['glutes', 'hamstrings'],
  },
  { test: /hip ?thrust|h(ü|ue|u)ft ?sto|glute|ges(ä|ae|a)(ß|ss|s)/, primary: ['glutes'], secondary: ['hamstrings'] },
  {
    test: /crunch|sit-?up|bauch|plank|unterarmst(ü|ue|u)tz|beinheb|leg raise|knieheb|russian twist|ab-?roller|ab wheel/,
    primary: ['abdominals'],
    secondary: [],
  },
  {
    test: /r(ü|ue|u)ckenstreck|hyperextension|hyper extension|back extension/,
    primary: ['lower back'],
    secondary: ['glutes', 'hamstrings'],
  },
  { test: /aufrecht\w* rudern|upright row|shrug|schulterzuck|nackenzieh/, primary: ['traps'], secondary: ['shoulders'] },
  {
    test: /face ?pull|reverse fl|hintere schulter|rear delt|reverse butterfly/,
    primary: ['shoulders'],
    secondary: ['middle back', 'traps'],
  },
  {
    test: /schulterdr(ü|ue|u)ck|shoulder press|military|overhead press|arnold/,
    primary: ['shoulders'],
    secondary: ['triceps'],
  },
  { test: /seithe?b|lateral raise|frontheb|front raise/, primary: ['shoulders'], secondary: [] },
  { test: /enge?s? bankdr|close.?grip bench/, primary: ['triceps'], secondary: ['chest', 'shoulders'] },
  { test: /dips/, primary: ['triceps', 'chest'], secondary: ['shoulders'] },
  {
    test: /trizeps|triceps|skull|french press|pushdown|stirndr|kickback/,
    primary: ['triceps'],
    secondary: [],
  },
  {
    test: /bankdr(ü|ue|u)ck|bench|brustpress|chest press|fliegende|butterfly|pec ?deck|cable cross|liegest(ü|ue|u)tz|push-?up|schr(ä|ae|a)gbank|incline|decline/,
    primary: ['chest'],
    secondary: ['triceps', 'shoulders'],
  },
  {
    test: /latzug|latzieh|lat ?pull|klimmz|pull-?up|chin-?up|pulldown|pullover/,
    primary: ['lats'],
    secondary: ['biceps', 'middle back'],
  },
  { test: /rudern|\brow\b|t-bar/, primary: ['middle back'], secondary: ['lats', 'biceps'] },
  { test: /bizeps|biceps|curl|hammer/, primary: ['biceps'], secondary: ['forearms'] },
  { test: /unterarm|handgelenk|wrist|forearm/, primary: ['forearms'], secondary: [] },
  { test: /nacken|neck/, primary: ['neck'], secondary: [] },
];

/** Vorschlag für den Namen oder null, wenn kein Stichwort passt. */
export function guessMuscles(name: string): MuscleGuess | null {
  const text = name.trim().toLowerCase().normalize('NFC');
  if (text.length < 3) return null;
  const rule = RULES.find((r) => r.test.test(text));
  return rule ? { primary: [...rule.primary], secondary: [...rule.secondary] } : null;
}
