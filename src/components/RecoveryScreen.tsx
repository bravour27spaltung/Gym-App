import { useMemo, useState } from 'react';
import { parseRelevantRecords } from '../lib/appleHealthImport';
import { fmtDay, fmtTime, todayIso } from '../lib/format';
import { summarizeRecoveryDay } from '../lib/healthImport';
import { prsAnchor, type RecoveryEntryInput, type RecoverySource } from '../lib/recovery';
import { assessRecovery, trainingContext } from '../lib/recoveryAnalysis';
import type { HistWorkout } from '../lib/stats';
import type { HistFootballSession, HistRecoveryEntry } from '../lib/storage';
import { EvidenceDetails, RecoveryHero, SignalList, TrainingContextCard } from './RecoverySignals';
import { Icon, IconButton, MetricField } from './ui';

interface Props {
  history: HistRecoveryEntry[];
  /** Krafttrainings und Fußball-Einheiten für den Belastungskontext. */
  workouts: HistWorkout[];
  footballs: HistFootballSession[];
  pending: number;
  busy: boolean;
  notice: string | null;
  onSave: (input: RecoveryEntryInput) => void;
  onSync: () => void;
  onDelete: (id: string) => void;
}

const DEFAULT_PRS = 6;
const SCALE_1_TO_5_LABELS: Record<string, string> = {
  soreness: 'Muskelkater',
  stress: 'Stress',
  sleepQuality: 'Schlafqualität',
};
/** Pole der Skala: bei Schlafqualität ist 5 gut, bei den anderen beiden 5 schlecht. */
const SCALE_1_TO_5_ANCHORS: Record<string, string> = {
  soreness: '1 = keiner, 5 = sehr stark',
  stress: '1 = entspannt, 5 = sehr gestresst',
  sleepQuality: '1 = sehr schlecht, 5 = sehr gut',
};

/** Fünfstufige Chip-Auswahl (1–5), für die kurzen Zusatzwerte. */
function Scale1to5({
  field,
  value,
  onChange,
}: {
  field: 'soreness' | 'stress' | 'sleepQuality';
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div className="field stack">
      <span>
        {SCALE_1_TO_5_LABELS[field]} (optional) · {SCALE_1_TO_5_ANCHORS[field]}
      </span>
      <div className="chips" role="group" aria-label={SCALE_1_TO_5_LABELS[field]}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={value === n ? 'chip on' : 'chip'}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Recovery: oben das Gesamturteil mit den einzelnen Signalen, jeweils gegen die eigene
 * Baseline eingeordnet (siehe lib/recoveryAnalysis.ts), dazu die Belastung der letzten Tage.
 * Darunter die Tageserfassung: gefühlte Erholung (PRS, Laurent et al. 2011) und drei kurze
 * Wellness-Items, optional Health-Werte (HRV, Ruhepuls, Schlaf) aus einem Apple-Health-Export.
 * Der Schlaf wird der Nacht zugeordnet, die am Eintragsdatum endet (siehe lib/sleep.ts).
 * Ist für heute noch nichts eingetragen, steht die Erfassung oben, sonst die Auswertung.
 * Die Diagramme sind im Verlauf-Tab.
 */
export function RecoveryScreen({ history, workouts, footballs, pending, busy, notice, onSave, onSync, onDelete }: Props) {
  const [date, setDate] = useState(() => todayIso());
  const [perceivedRecovery, setPerceivedRecovery] = useState(DEFAULT_PRS);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [hrvMs, setHrvMs] = useState<number | null>(null);
  const [restingHr, setRestingHr] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [sleepStart, setSleepStart] = useState<string | null>(null);
  const [sleepEnd, setSleepEnd] = useState<string | null>(null);
  const [deepSleepMin, setDeepSleepMin] = useState<number | null>(null);
  const [remSleepMin, setRemSleepMin] = useState<number | null>(null);
  const [source, setSource] = useState<RecoverySource>('manual');
  // Die Zahlenfelder halten ihren Text selbst; nach einem Import mit neuem Key neu aufbauen.
  const [importKey, setImportKey] = useState(0);

  const [healthXml, setHealthXml] = useState<string | null>(null);
  const [healthFileName, setHealthFileName] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthNotice, setHealthNotice] = useState<string | null>(null);

  const valid = date.trim() !== '';
  const today = todayIso();
  const existingForDate = history.find((h) => h.date === date) ?? null;
  const alreadyLogged = existingForDate !== null;
  const loggedToday = history.some((h) => h.date === today);

  // Bezugstag der Auswertung: heute, sonst der letzte eingetragene Tag.
  const asOf = loggedToday ? today : (history[0]?.date ?? today);
  const assessment = useMemo(() => assessRecovery(history, asOf), [history, asOf]);
  const context = useMemo(() => trainingContext(workouts, footballs, Date.now()), [workouts, footballs]);

  function resetForm() {
    setPerceivedRecovery(DEFAULT_PRS);
    setSoreness(null);
    setStress(null);
    setSleepQuality(null);
    setNote('');
    setHrvMs(null);
    setRestingHr(null);
    setSleepHours(null);
    setSleepStart(null);
    setSleepEnd(null);
    setDeepSleepMin(null);
    setRemSleepMin(null);
    setSource('manual');
    setHealthNotice(null);
    setImportKey((k) => k + 1);
  }

  function submit() {
    if (!valid) return;
    onSave({ date, perceivedRecovery, soreness, stress, sleepQuality, note, hrvMs, restingHr, sleepHours, sleepStart, sleepEnd, deepSleepMin, remSleepMin, source });
    resetForm();
  }

  function handleHealthFile(file: File) {
    setHealthNotice(null);
    const reader = new FileReader();
    reader.onload = () => {
      setHealthXml(typeof reader.result === 'string' ? reader.result : null);
      setHealthFileName(file.name);
    };
    reader.onerror = () => setHealthNotice('Datei konnte nicht gelesen werden.');
    reader.readAsText(file);
  }

  function applyHealthImport() {
    if (!healthXml) return;
    setHealthBusy(true);
    setHealthNotice(null);
    // Kurz aus dem Event-Loop raus, damit "Verarbeite …" noch gerendert wird, bevor
    // der (bei großen Exporten spürbar langsame) Text-Scan das Hauptthema blockiert.
    window.setTimeout(() => {
      try {
        const res = summarizeRecoveryDay(parseRelevantRecords(healthXml), date);
        setHrvMs(res.hrvMs);
        setRestingHr(res.restingHr);
        setSleepHours(res.sleepHours);
        setSleepStart(res.sleepStartMs !== null ? new Date(res.sleepStartMs).toISOString() : null);
        setSleepEnd(res.sleepEndMs !== null ? new Date(res.sleepEndMs).toISOString() : null);
        setDeepSleepMin(res.deepSleepMin);
        setRemSleepMin(res.remSleepMin);
        setImportKey((k) => k + 1);
        setSource('apple_health');
        if (res.hrvMs === null && res.restingHr === null && res.sleepHours === null) {
          setHealthNotice('Keine passenden Health-Daten für die Nacht, die an diesem Tag endet, gefunden.');
        } else {
          setHealthNotice(
            res.sleepStartMs !== null && res.sleepEndMs !== null
              ? `Werte aus Apple Health übernommen. Schlaf: Nacht von ${fmtTime(res.sleepStartMs)} bis ${fmtTime(res.sleepEndMs)} Uhr.`
              : 'Werte aus Apple Health übernommen (keine Schlafnacht gefunden).',
          );
        }
      } catch {
        setHealthNotice('Export konnte nicht gelesen werden (ungültige oder beschädigte Datei?).');
      } finally {
        setHealthBusy(false);
      }
    }, 0);
  }

  const formCard = (
    <div className="card">
      <label className="field stack">
        <span>Datum (Tag des Aufwachens)</span>
        <input className="text" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </label>
      {alreadyLogged && (
        <p className="muted newex-hint">
          Für diesen Tag gibt es bereits einen Eintrag. Ein zweiter würde beim Speichern abgelehnt – lösche den
          bestehenden zuerst weiter unten, wenn du ihn korrigieren willst.
        </p>
      )}

      <div className="feeling">
        <span className="feeling-label">Wie erholt fühlst du dich? (0–10)</span>
        <div className="chips" role="group" aria-label="Perceived Recovery Status">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              className={perceivedRecovery === n ? 'chip on' : 'chip'}
              aria-pressed={perceivedRecovery === n}
              onClick={() => setPerceivedRecovery(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="muted">{prsAnchor(perceivedRecovery)}</p>
      </div>

      <Scale1to5 field="soreness" value={soreness} onChange={setSoreness} />
      <Scale1to5 field="stress" value={stress} onChange={setStress} />
      <Scale1to5 field="sleepQuality" value={sleepQuality} onChange={setSleepQuality} />

      <details className="equipment">
        <summary>Notiz (optional)</summary>
        <label className="notefield">
          Notiz
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </label>
      </details>

      <details className="equipment">
        <summary>Health-Werte (HRV, Ruhepuls, Schlaf) – optional, aus Apple Health</summary>

        <p className="muted newex-hint">
          Schlaf: die Nacht, die an diesem Tag endet, als Ganzes (auch der Teil vor Mitternacht). HRV: Messungen
          der Uhr während dieser Nacht. Ruhepuls: Tageswert der Uhr. Export in der Health-App unter Profil →
          „Alle Gesundheitsdaten exportieren“, ZIP entpacken und hier die enthaltene <code>export.xml</code>{' '}
          wählen. Die Datei kann mehrere hundert MB groß sein; das Verarbeiten dauert dann einen Moment.
          Genauigkeit: Die Uhr misst HRV nur gelegentlich und im Absolutwert ungenau, aussagekräftig ist der Trend
          über mehrere Tage. Die Schlafdauer wird tendenziell etwas überschätzt, weil Wachphasen schlecht erkannt
          werden; Schlafphasen (Tief/REM) werden bewusst nicht verwendet.
        </p>

        <div className="row wrap">
          <label className="btn compact" style={{ cursor: 'pointer' }}>
            <Icon name="folder" size={16} /> export.xml wählen
            <input
              type="file"
              accept=".xml,text/xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleHealthFile(file);
                e.target.value = '';
              }}
            />
          </label>
          {healthFileName && <span className="muted">{healthFileName} geladen</span>}
          <button type="button" className="btn compact" disabled={!healthXml || healthBusy} onClick={applyHealthImport}>
            {healthBusy ? 'Verarbeite …' : 'Werte übernehmen'}
          </button>
        </div>
        {healthNotice && <p className="muted">{healthNotice}</p>}

        <MetricField key={`hrv-${importKey}`} label="HRV (SDNN)" unit="ms" step={0.1} value={hrvMs} onChange={setHrvMs} />
        <MetricField key={`rhr-${importKey}`} label="Ruhepuls" unit="bpm" value={restingHr} onChange={setRestingHr} />
        <MetricField
          key={`sleep-${importKey}`}
          label="Schlafdauer"
          unit="h"
          step={0.1}
          value={sleepHours}
          onChange={(n) => {
            // Manuelle Änderung: das übernommene Nachtfenster passt dann nicht mehr zum Wert.
            setSleepHours(n);
            setSleepStart(null);
            setSleepEnd(null);
            setDeepSleepMin(null);
            setRemSleepMin(null);
          }}
        />
      </details>

      <button type="button" className="btn primary block" disabled={!valid || busy} onClick={submit}>
        <Icon name="plus" size={18} /> {busy ? 'Speichere …' : 'Eintrag speichern'}
      </button>
    </div>
  );

  const analysis = (
    <>
      <RecoveryHero a={assessment} loggedToday={loggedToday} />
      <SignalList a={assessment} />
      <TrainingContextCard ctx={context} />
    </>
  );

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Recovery</h1>
      </header>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending > 0 && (
        <p className="notice" role="status">
          {pending} Recovery-Eintrag/Einträge noch nicht gespeichert. Sie werden gesendet, sobald eine Verbindung
          besteht.{' '}
          <button type="button" className="link" onClick={onSync}>
            Jetzt versuchen
          </button>
        </p>
      )}

      {loggedToday ? (
        <>
          {analysis}
          <details className="equipment">
            <summary>Weiteren Tag eintragen oder Werte nachtragen</summary>
            {formCard}
          </details>
        </>
      ) : (
        <>
          {formCard}
          {analysis}
        </>
      )}

      <EvidenceDetails />

      {history.length > 0 && (
        <>
          <h2 className="section-title">Letzte Einträge</h2>
          <ul className="exlist">
            {history.slice(0, 8).map((h) => (
              <li key={h.id}>
                <div className="exrow static">
                  <span className="exrow-text">
                    <strong>
                      {fmtDay(h.date)} · Erholung {h.perceivedRecovery}/10
                    </strong>
                    <small>
                      {prsAnchor(h.perceivedRecovery)}
                      {h.soreness !== null ? ` · Muskelkater ${h.soreness}/5` : ''}
                      {h.stress !== null ? ` · Stress ${h.stress}/5` : ''}
                      {h.sleepQuality !== null ? ` · Schlafqualität ${h.sleepQuality}/5` : ''}
                      {h.hrvMs !== null ? ` · HRV ${h.hrvMs.toFixed(1)} ms` : ''}
                      {h.restingHr !== null ? ` · Ruhepuls ${h.restingHr} bpm` : ''}
                      {h.sleepHours !== null ? ` · ${h.sleepHours.toFixed(1)} h Schlaf` : ''}
                      {h.sleepStart && h.sleepEnd ? ` (${fmtTime(h.sleepStart)}–${fmtTime(h.sleepEnd)})` : ''}
                      {h.note ? ` · ${h.note}` : ''}
                    </small>
                  </span>
                  <IconButton
                    icon="trash"
                    label={`Eintrag vom ${fmtDay(h.date)} löschen`}
                    tone="danger"
                    onClick={() => setConfirmDeleteId(h.id)}
                  />
                </div>
                {confirmDeleteId === h.id && (
                  <div className="banner" role="alertdialog" aria-label="Eintrag löschen">
                    <p>Diesen Recovery-Eintrag endgültig löschen?</p>
                    <div className="row">
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onDelete(h.id);
                        }}
                      >
                        Löschen
                      </button>
                      <button type="button" className="btn compact" onClick={() => setConfirmDeleteId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
