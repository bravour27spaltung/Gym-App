#!/usr/bin/env node
/**
 * Erzeugt aus der offenen Übungsdatenbank free-exercise-db (gemeinfrei, Unlicense)
 * SQL-Dateien zum Einspielen in Supabase.
 *
 * Aufruf (auf deinem Rechner, Node 18 oder neuer):
 *   node tools/build-seed.mjs                 # lädt den Katalog selbst herunter
 *   node tools/build-seed.mjs exercises.json  # oder aus einer lokalen Datei
 *
 * Ergebnis: supabase/seed/exercises_seed_1.sql, _2.sql, ... mit je 200 Übungen, damit der
 * Supabase-SQL-Editor nicht ins Stocken gerät (der Reihe nach ausführen). Die Größe stellst du
 * mit --per-file=N ein, mit --per-file=0 entsteht eine einzige Datei exercises_seed.sql.
 *
 * Der Katalog enthält nur Details (Muskelgruppen, Gerät, Anleitung), keine Gewichte.
 *
 * Deutsche Namen, in dieser Reihenfolge:
 *   1. tools/names_de.json  { "<Übungs-ID>": "Deutscher Name" }  (Einzelkorrekturen)
 *   2. tools/names_de.txt   eine Zeile je Übung: "Englischer Name => Deutscher Name"
 *   3. Glossar-Ersatz (tools/glossary-de.mjs), nur für Übungen ohne Eintrag oben
 * Die Übersetzungen in names_de.txt sind von Hand erstellt, aber nicht von einer
 * Fachperson geprüft. Die Anleitungen bleiben zunächst englisch (instructions_en);
 * instructions_de ist leer.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateName } from './glossary-de.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const OUT = join(here, '..', 'supabase', 'seed', 'exercises_seed.sql');
const OVERRIDES = join(here, 'names_de.json');
const NAMES_TXT = join(here, 'names_de.txt');

// Nur Krafttraining; Dehnen, Cardio und Plyometrie sind für diese App nicht gedacht.
const CATEGORIES = new Set([
  'strength',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
]);

const MUSCLES = new Set([
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms',
  'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps',
  'shoulders', 'traps', 'triceps',
]);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (list) =>
  list.length === 0 ? `'{}'::text[]` : `array[${list.map(q).join(', ')}]::text[]`;

const args = process.argv.slice(2);
const perFileArg = args.find((a) => a.startsWith('--per-file='));
// Standard: Dateien mit je 200 Übungen, damit der Supabase-SQL-Editor nicht ins Stocken gerät.
// --per-file=0 schreibt eine einzige Datei.
const perFile = perFileArg ? Math.max(0, parseInt(perFileArg.split('=')[1], 10) || 0) : 200;
const fileArg = args.find((a) => !a.startsWith('--'));

async function loadCatalog() {
  const arg = fileArg;
  if (arg) return JSON.parse(readFileSync(arg, 'utf8'));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`);
  return res.json();
}

const catalog = await loadCatalog();
if (!Array.isArray(catalog)) throw new Error('Unerwartetes Format: Liste von Übungen erwartet.');

const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {};
const byEnglishName = new Map();
if (existsSync(NAMES_TXT)) {
  for (const line of readFileSync(NAMES_TXT, 'utf8').split('\n')) {
    const i = line.indexOf(' => ');
    if (i > 0) byEnglishName.set(line.slice(0, i).trim(), line.slice(i + 4).trim());
  }
}
let fromGlossary = 0;
const unknownMuscles = new Set();
const unknownWords = new Map();
const rows = [];

for (const ex of catalog) {
  if (!ex || !ex.id || !ex.name) continue;
  if (ex.category && !CATEGORIES.has(ex.category)) continue;

  const primary = (ex.primaryMuscles ?? []).filter((m) => (MUSCLES.has(m) ? true : (unknownMuscles.add(m), false)));
  const secondary = (ex.secondaryMuscles ?? []).filter((m) => (MUSCLES.has(m) ? true : (unknownMuscles.add(m), false)));
  if (primary.length === 0) continue; // ohne Hauptmuskel unbrauchbar für die Zuordnung

  let nameDe = overrides[ex.id] ?? byEnglishName.get(ex.name);
  if (!nameDe) {
    const t = translateName(ex.name);
    nameDe = t.text;
    fromGlossary += 1;
    for (const w of t.unknown) unknownWords.set(w, (unknownWords.get(w) ?? 0) + 1);
  }
  const equipment = ex.equipment ?? null;

  rows.push(
    `(${q(ex.id)}, ${q(ex.name)}, ${q(nameDe)}, ${arr(primary)}, ${arr(secondary)}, ` +
      `${equipment ? q(equipment) : 'null'}, ${arr(ex.instructions ?? [])})`,
  );
}

const CHUNK = 100;

function buildSql(list, note) {
  const chunks = [];
  for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));
  return `-- Übungskatalog aus free-exercise-db (gemeinfrei). Erzeugt von tools/build-seed.mjs.
-- ${list.length} Übungen${note}. Deutsche Namen sind maschinell erzeugt und dürfen angepasst werden.
--
-- Das Skript ist wiederholbar: bereits vorhandene Katalogübungen (source + source_id)
-- werden aktualisiert (Namen, Muskelgruppen, Gerät, englische Anleitung). Ihre IDs bleiben
-- gleich, Pläne und Trainings bleiben also verknüpft. Deine eigenen Übungen und deine
-- deutschen Anleitungen (instructions_de) bleiben unberührt.
-- Die Übungen gehören dem ersten (einzigen) Nutzer in auth.users. Lege dein Konto
-- deshalb an, bevor du dieses Skript ausführst.

do $seed$
declare uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise exception 'Kein Nutzer in auth.users. Lege zuerst dein Konto an (Authentication > Users).';
  end if;

${chunks
  .map(
    (c) => `  insert into fit_exercises
    (user_id, source, source_id, name_en, name_de, primary_muscles, secondary_muscles, equipment, instructions_en)
  select uid, 'free-exercise-db', v.source_id, v.name_en, v.name_de, v.primary_muscles, v.secondary_muscles, v.equipment, v.instructions_en
  from (values
    ${c.join(',\n    ')}
  ) as v(source_id, name_en, name_de, primary_muscles, secondary_muscles, equipment, instructions_en)
  on conflict (user_id, source, source_id) do update set
    name_en = excluded.name_en,
    name_de = excluded.name_de,
    primary_muscles = excluded.primary_muscles,
    secondary_muscles = excluded.secondary_muscles,
    equipment = excluded.equipment,
    instructions_en = excluded.instructions_en;
`,
  )
  .join('\n')}end
$seed$;
`;
}

mkdirSync(dirname(OUT), { recursive: true });
const written = [];
if (perFile > 0 && rows.length > perFile) {
  const parts = Math.ceil(rows.length / perFile);
  for (let p = 0; p < parts; p++) {
    const file = OUT.replace(/\.sql$/, `_${p + 1}.sql`);
    writeFileSync(file, buildSql(rows.slice(p * perFile, (p + 1) * perFile), `, Teil ${p + 1} von ${parts}`));
    written.push(file);
  }
} else {
  writeFileSync(OUT, buildSql(rows, ''));
  written.push(OUT);
}

console.log(`${rows.length} Übungen geschrieben:\n  ${written.join('\n  ')}`);
if (unknownMuscles.size) console.log('Unbekannte Muskelbezeichnungen (übersprungen):', [...unknownMuscles].join(', '));
console.log(`${rows.length - fromGlossary} Namen aus names_de.txt/names_de.json, ${fromGlossary} per Glossar-Ersatz.`);
const top = [...unknownWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
if (top.length) {
  console.log('Häufigste noch englische Wörter in glossar-übersetzten Namen (Zeile in names_de.txt ergänzen):');
  for (const [w, n] of top) console.log(`  ${w}: ${n}`);
}
