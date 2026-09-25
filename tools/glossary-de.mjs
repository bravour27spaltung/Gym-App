/**
 * Einfaches Glossar Englisch -> Deutsch für Übungsnamen. Die Wortstellung bleibt
 * englisch ("Barbell Bench Press" -> "Langhantel Bankdrücken"). Längere Wendungen
 * stehen vor kürzeren, damit sie zuerst greifen.
 */
const PHRASES = [
  ['wide-grip', 'weiter Griff'],
  ['wide grip', 'weiter Griff'],
  ['close-grip', 'enger Griff'],
  ['close grip', 'enger Griff'],
  ['medium-grip', 'mittlerer Griff'],
  ['medium grip', 'mittlerer Griff'],
  ['reverse-grip', 'Untergriff'],
  ['reverse grip', 'Untergriff'],
  ['underhand grip', 'Untergriff'],
  ['pull-ups', 'Klimmzüge'],
  ['pullups', 'Klimmzüge'],
  ['chin-ups', 'Klimmzüge im Untergriff'],
  ['push-ups', 'Liegestütze'],
  ['pushups', 'Liegestütze'],
  ['smith machine', 'Multipresse'],
  ['leg press', 'Beinpresse'],
  ['leg extension', 'Beinstrecker'],
  ['leg extensions', 'Beinstrecker'],
  ['leg curl', 'Beinbeuger'],
  ['leg curls', 'Beinbeuger'],
  ['calf raise', 'Wadenheben'],
  ['calf raises', 'Wadenheben'],
  ['lat pulldown', 'Latziehen'],
  ['pulldown', 'Latziehen'],
  ['pull-up', 'Klimmzug'],
  ['pullup', 'Klimmzug'],
  ['chin-up', 'Klimmzug im Untergriff'],
  ['chin up', 'Klimmzug im Untergriff'],
  ['push-up', 'Liegestütz'],
  ['push up', 'Liegestütz'],
  ['bench press', 'Bankdrücken'],
  ['overhead press', 'Schulterdrücken'],
  ['shoulder press', 'Schulterdrücken'],
  ['military press', 'Frontdrücken'],
  ['push press', 'Push Press'],
  ['lateral raise', 'Seitheben'],
  ['lateral raises', 'Seitheben'],
  ['front raise', 'Frontheben'],
  ['side lateral raise', 'Seitheben'],
  ['rear delt', 'hintere Schulter'],
  ['reverse flyes', 'Reverse Flys'],
  ['reverse fly', 'Reverse Fly'],
  ['flyes', 'Fliegende'],
  ['fly', 'Fliegende'],
  ['face pull', 'Face Pull'],
  ['romanian deadlift', 'Rumänisches Kreuzheben'],
  ['stiff-legged', 'mit gestreckten Beinen'],
  ['stiff legged', 'mit gestreckten Beinen'],
  ['deadlift', 'Kreuzheben'],
  ['hip thrust', 'Hip Thrust'],
  ['glute bridge', 'Beckenheben'],
  ['good morning', 'Good Morning'],
  ['split squat', 'Split Squat'],
  ['bulgarian', 'bulgarisch'],
  ['squat', 'Kniebeuge'],
  ['squats', 'Kniebeugen'],
  ['lunge', 'Ausfallschritt'],
  ['lunges', 'Ausfallschritte'],
  ['step-up', 'Step-up'],
  ['bent over', 'vorgebeugt'],
  ['bent-over', 'vorgebeugt'],
  ['row', 'Rudern'],
  ['rows', 'Rudern'],
  ['shrug', 'Schulterzucken'],
  ['shrugs', 'Schulterzucken'],
  ['pullover', 'Überzug'],
  ['skullcrusher', 'Stirndrücken'],
  ['skullcrushers', 'Stirndrücken'],
  ['pushdown', 'Trizepsdrücken'],
  ['kickback', 'Kickback'],
  ['dips', 'Dips'],
  ['dip', 'Dip'],
  ['crunch', 'Crunch'],
  ['crunches', 'Crunches'],
  ['sit-up', 'Sit-up'],
  ['plank', 'Unterarmstütze'],
  ['leg raise', 'Beinheben'],
  ['leg raises', 'Beinheben'],
  ['hanging', 'hängend'],
  ['clean and jerk', 'Umsetzen und Stoßen'],
  ['clean', 'Umsetzen'],
  ['snatch', 'Reißen'],
  ['jerk', 'Stoßen'],
  ['farmer\'s walk', 'Farmer\'s Walk'],
  ['curl', 'Curl'],
  ['curls', 'Curls'],
  ['preacher', 'Scott'],
  ['concentration', 'Konzentrations'],
  ['hammer', 'Hammer'],
  ['extension', 'Strecken'],
  ['extensions', 'Strecken'],
  ['press', 'Drücken'],
  ['presses', 'Drücken'],
  ['raise', 'Heben'],
  ['raises', 'Heben'],
];

const WORDS = {
  barbell: 'Langhantel', dumbbell: 'Kurzhantel', dumbbells: 'Kurzhanteln',
  cable: 'Kabelzug', cables: 'Kabelzug', machine: 'Maschine', kettlebell: 'Kettlebell',
  kettlebells: 'Kettlebell', band: 'Band', bands: 'Bänder', bodyweight: 'Körpergewicht',
  'ez-bar': 'SZ-Stange', ez: 'SZ', bar: 'Stange', rope: 'Seil', plate: 'Scheibe',
  incline: 'Schräg', decline: 'Negativ', flat: 'Flach', standing: 'stehend',
  seated: 'sitzend', lying: 'liegend', kneeling: 'kniend', prone: 'Bauchlage',
  supine: 'Rückenlage', one: 'ein', 'one-arm': 'einarmig', 'single-arm': 'einarmig',
  'one-legged': 'einbeinig', single: 'einzeln', alternate: 'wechselseitig',
  alternating: 'wechselseitig', close: 'enger', wide: 'weiter', medium: 'mittlerer',
  narrow: 'enger', grip: 'Griff', reverse: 'Umgekehrter', underhand: 'Untergriff',
  overhand: 'Obergriff', neutral: 'neutraler', front: 'Front', rear: 'hintere',
  back: 'Rücken', side: 'Seite', behind: 'hinter', neck: 'Nacken', with: 'mit',
  and: 'und', to: 'zu', on: 'auf', the: '', of: 'von', a: '', over: 'über',
  high: 'hoch', low: 'tief', up: 'hoch', down: 'runter', pull: 'Zug', push: 'Druck',
  press: 'Drücken', chest: 'Brust', shoulder: 'Schulter', triceps: 'Trizeps',
  tricep: 'Trizeps', biceps: 'Bizeps', bicep: 'Bizeps', leg: 'Bein', legs: 'Beine',
  arm: 'Arm', arms: 'Arme', calf: 'Waden', glute: 'Gesäß', glutes: 'Gesäß',
  hip: 'Hüfte', lat: 'Latissimus', lats: 'Latissimus', upper: 'oberer', lower: 'unterer',
  full: 'volle', partial: 'partielle', weighted: 'mit Gewicht', assisted: 'assistiert',
  straight: 'gerade', bent: 'gebeugt',
  power: 'Power', hang: 'aus dem Hang', deficit: 'Defizit', pause: 'Pause',
  paused: 'mit Pause', cross: 'Über-Kreuz', crossover: 'Überkreuz', iron: 'Iron',
  olympic: 'olympisch', wrist: 'Handgelenk', wrists: 'Handgelenke',
  forearm: 'Unterarm', forearms: 'Unterarme', abdominal: 'Bauch', ab: 'Bauch',
  oblique: 'seitlich', twist: 'Drehung', rotation: 'Rotation', russian: 'russische',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASE_RES = PHRASES.map(([en, de]) => [new RegExp(`(?<![\\p{L}-])${escapeRe(en)}(?![\\p{L}-])`, 'giu'), de]);

/** Gibt { text, unknown } zurück; unknown = englische Wörter, die das Glossar nicht kennt. */
export function translateName(name) {
  let s = name.trim();
  // Phrasen zuerst, mit Platzhaltern, damit sie nicht erneut angefasst werden.
  const slots = [];
  for (const [re, de] of PHRASE_RES) {
    s = s.replace(re, () => {
      slots.push(de);
      return `\u0001${slots.length - 1}\u0002`;
    });
  }
  const unknown = [];
  const out = s
    .split(/(\s+|[-–()/,]+)/u)
    .map((tok) => {
      const slot = /^\u0001(\d+)\u0002$/u.exec(tok);
      if (slot) return slots[Number(slot[1])];
      const key = tok.toLowerCase();
      if (!/\p{L}/u.test(tok)) return tok;
      if (Object.prototype.hasOwnProperty.call(WORDS, key)) return WORDS[key];
      unknown.push(key);
      return tok;
    })
    .join('')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,)])/g, '$1')
    .trim();
  const text = out.charAt(0).toUpperCase() + out.slice(1);
  return { text, unknown };
}
