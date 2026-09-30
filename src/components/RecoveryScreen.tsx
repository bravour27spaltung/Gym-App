import { useState } from 'react';
import { parseRelevantRecords, summarizeWindow } from '../lib/appleHealthImport';
import { fmtDay, todayIso } from '../lib/format';
import { recoveryWindowForDate } from '../lib/healthImport';
import {
  computeRecoveryBaseline,
  computeRecoveryScore,
  prsAnchor,
  type RecoveryEntryInput,
  type RecoverySource,
} from '../lib/recovery';
import type { HistRecoveryEntry } from '../lib/storage';
import { Icon, IconButton, MetricField } from './ui';

interface Props {
  history: HistRecoveryEntry[];
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
      <span>{SCALE_1_TO_5_LABELS[field]} (1–5, optional)</span>
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
 * Recovery: eigener, bewusst einfacher Bereich – ein Eintrag pro Tag (kein Live-Timer),
 * im Kern eine Ein-Item-Skala (Perceived Recovery Status, Laurent et al. 2011, siehe
 * lib/recovery.ts). Darunter, eingeklappt, ein paar kurze subjektive Zusatzwerte und
 * optionale Health-Werte (HRV, Ruhepuls, Schlafdauer) aus einem Apple-Health-Export für
 * das Tagesfenster (Vorabend bis später Vormittag, siehe recoveryWindowForDate). Die
 * letzten Einträge stehen darunter zum Nachschauen und Löschen; die volle Auswertung
 * mit Diagramm ist im Verlauf-Tab.
 */
export function RecoveryScreen({ history, pending, busy, notice, onSave, onSync, onDelete }: Props) {
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
  const [source, setSource] = useState<RecoverySource>('manual');

  const [healthXml, setHealthXml] = useState<string | null>(null);
  const [healthFileName, setHealthFileName] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthNotice, setHealthNotice] = useState<string | null>(null);

  const valid = date.trim() !== '';
  const existingForDate = history.find((h) => h.date === date) ?? null;
  const alreadyLogged = existingForDate !== null;
  // Direktes Feedback für den bereits gespeicherten Tag, ohne extra in den Verlauf zu
  // wechseln – gleiche Berechnung wie im Verlauf-Tab (siehe lib/recovery.ts).
  const scoreForDate = existingForDate
    ? computeRecoveryScore(
        {
          perceivedRecovery: existingForDate.perceivedRecovery,
          hrvMs: existingForDate.hrvMs,
          restingHr: existingForDate.restingHr,
          sleepHours: existingForDate.sleepHours,
        },
        computeRecoveryBaseline(history, existingForDate.date),
      )
    : null;

  function resetForm() {
    setPerceivedRecovery(DEFAULT_PRS);
    setSoreness(null);
    setStress(null);
    setSleepQuality(null);
    setNote('');
    setHrvMs(null);
    setRestingHr(null);
    setSleepHours(null);
    setSource('manual');
    setHealthNotice(null);
  }

  function submit() {
    if (!valid) return;
    onSave({ date, perceivedRecovery, soreness, stress, sleepQuality, note, hrvMs, restingHr, sleepHours, source });
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
        const { fromMs, toMs } = recoveryWindowForDate(date);
        const res = summarizeWindow(parseRelevantRecords(healthXml), fromMs, toMs);
        setHrvMs(res.hrvMs);
        setRestingHr(res.restingHr);
        setSleepHours(res.sleepHours);
        setSource('apple_health');
        if (res.hrvMs === null && res.restingHr === null && res.sleepHours === null) {
          setHealthNotice('Keine passenden Health-Daten für die Nacht/den Morgen dieses Tages gefunden.');
        } else {
          setHealthNotice('Werte aus Apple Health übernommen – bei Bedarf oben noch anpassen.');
        }
      } catch {
        setHealthNotice('Export konnte nicht gelesen werden (ungültige oder beschädigte Datei?).');
      } finally {
        setHealthBusy(false);
      }
    }, 0);
  }

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
          {pending} Recovery-Eintrag/Einträge noch nicht gespeichert. Sie werden gesendet, sobald eine
          Verbindung besteht.{' '}
          <button type="button" className="link" onClick={onSync}>
            Jetzt versuchen
          </button>
        </p>
      )}

      <div className="card">
        <label className="field stack">
          <span>Datum</span>
          <input
            className="text"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {alreadyLogged && (
          <p className="muted newex-hint">
            Für diesen Tag gibt es bereits einen Eintrag
            {scoreForDate ? (
              <>
                {' '}
                · Recovery Score <strong>{scoreForDate.score}/100</strong>
              </>
            ) : null}
            . Ein zweiter würde beim Speichern abgelehnt – lösche den bestehenden zuerst weiter unten, wenn du
            ihn korrigieren willst.
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

        <details className="equipment">
          <summary>Zusatzwerte (optional)</summary>
          <Scale1to5 field="soreness" value={soreness} onChange={setSoreness} />
          <Scale1to5 field="stress" value={stress} onChange={setStress} />
          <Scale1to5 field="sleepQuality" value={sleepQuality} onChange={setSleepQuality} />
          <label className="notefield">
            Notiz (optional)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </label>
        </details>

        <details className="equipment">
          <summary>Health-Werte (HRV, Ruhepuls, Schlaf) – optional, aus Apple Health</summary>

          <p className="muted newex-hint">
            Deckt den Vorabend bis zum späten Vormittag dieses Tages ab, damit sowohl der nächtliche
            Schlaf als auch eine morgendliche HRV-/Ruhepuls-Messung der Uhr erfasst werden. Export in
            der Health-App unter Profil → „Alle Gesundheitsdaten exportieren", ZIP entpacken und hier
            die enthaltene <code>export.xml</code> wählen. Die Datei kann mehrere hundert MB groß sein;
            das Verarbeiten dauert dann einen Moment. Genauigkeit: HRV wird von der Uhr meist nur ein-
            bis zweimal täglich gemessen, aussagekräftig ist der Trend über mehrere Tage, nicht der
            Einzelwert; Schlafphasen sind bei Consumer-Wearables nur mäßig genau, die Gesamtdauer ist
            verlässlicher.
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
            <button
              type="button"
              className="btn compact"
              disabled={!healthXml || healthBusy}
              onClick={applyHealthImport}
            >
              {healthBusy ? 'Verarbeite …' : 'Werte übernehmen'}
            </button>
          </div>
          {healthNotice && <p className="muted">{healthNotice}</p>}

          <MetricField label="HRV (SDNN)" unit="ms" step={0.1} value={hrvMs} onChange={setHrvMs} />
          <MetricField label="Ruhepuls" unit="bpm" value={restingHr} onChange={setRestingHr} />
          <MetricField label="Schlafdauer" unit="h" step={0.1} value={sleepHours} onChange={setSleepHours} />
        </details>

        <button type="button" className="btn primary block" disabled={!valid || busy} onClick={submit}>
          <Icon name="plus" size={18} /> {busy ? 'Speichere …' : 'Eintrag speichern'}
        </button>
      </div>

      {history.length > 0 && (
        <>
          <h2 className="section-title">Letzte Einträge</h2>
          <ul className="exlist">
            {history.slice(0, 8).map((h) => {
              const s = computeRecoveryScore(
                { perceivedRecovery: h.perceivedRecovery, hrvMs: h.hrvMs, restingHr: h.restingHr, sleepHours: h.sleepHours },
                computeRecoveryBaseline(history, h.date),
              );
              return (
              <li key={h.id}>
                <div className="exrow static">
                  <span className="exrow-text">
                    <strong>
                      {fmtDay(h.date)} · {s.score}/100 · Recovery {h.perceivedRecovery}/10
                    </strong>
                    <small>
                      {prsAnchor(h.perceivedRecovery)}
                      {h.hrvMs !== null ? ` · HRV ${h.hrvMs.toFixed(1)} ms` : ''}
                      {h.restingHr !== null ? ` · Ruhepuls ${h.restingHr} bpm` : ''}
                      {h.sleepHours !== null ? ` · ${h.sleepHours.toFixed(1)} h Schlaf` : ''}
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
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
