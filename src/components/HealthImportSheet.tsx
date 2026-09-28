import { useMemo, useState } from 'react';
import { parseRelevantRecords, type HealthRecord } from '../lib/appleHealthImport';
import { fmtDay, fmtTime } from '../lib/format';
import {
  buildHealthImportCandidates,
  matchHealthImportCandidates,
  withData,
  type HealthImportKind,
  type HealthImportMatch,
} from '../lib/healthImport';
import type { HistWorkout } from '../lib/stats';
import type { HistFootballSession, HistStretchSession } from '../lib/storage';
import { Icon, IconButton, type IconName } from './ui';

interface Props {
  workouts: HistWorkout[];
  stretches: HistStretchSession[];
  footballs: HistFootballSession[];
  onClose: () => void;
  /** Übernimmt die ausgewählten Treffer (schreibt in die Datenbank) und synchronisiert danach. */
  onApply: (matches: HealthImportMatch[]) => Promise<void>;
}

const KIND_ICON: Record<HealthImportKind, IconName> = {
  workout: 'dumbbell',
  stretch: 'flame',
  football: 'football',
};

function unit(field: 'distanceKm' | 'calories' | 'avgHeartRate'): string {
  return field === 'distanceKm' ? 'km' : field === 'calories' ? 'kcal' : 'bpm';
}

function fieldLabel(field: 'distanceKm' | 'calories' | 'avgHeartRate'): string {
  return field === 'distanceKm' ? 'Distanz' : field === 'calories' ? 'Kalorien' : 'Ø Puls';
}

function formatValue(field: 'distanceKm' | 'calories' | 'avgHeartRate', value: number): string {
  return field === 'distanceKm' ? value.toFixed(1) : String(value);
}

/**
 * Bereichsübergreifender Apple-Health-Import: eine export.xml wählen, dann werden alle
 * noch unvollständigen Trainings, Stretching-Sessions und Fußball-Einträge gegen ihr
 * bekanntes Zeitfenster abgeglichen (Training/Stretching haben ein exaktes Fenster aus
 * der Live-Aufzeichnung, Fußball nur mit eingetragener Startzeit). Bereits vorhandene
 * Werte werden nie überschrieben.
 */
export function HealthImportSheet({ workouts, stretches, footballs, onClose, onApply }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<HealthImportMatch[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const matchKey = (m: HealthImportMatch) => `${m.candidate.kind}-${m.candidate.id}`;

  function handleFile(file: File) {
    setError(null);
    setMatches(null);
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const xml = typeof reader.result === 'string' ? reader.result : '';
      // Kurz aus dem Event-Loop raus, damit "Verarbeite …" noch gerendert wird, bevor der
      // bei großen Exporten spürbar langsame Text-Scan das Hauptthema blockiert.
      window.setTimeout(() => {
        try {
          const records: HealthRecord[] = parseRelevantRecords(xml);
          const candidates = buildHealthImportCandidates(workouts, stretches, footballs);
          const found = withData(matchHealthImportCandidates(records, candidates));
          setMatches(found);
          setSelected(new Set(found.map(matchKey)));
          if (found.length === 0) {
            setError(
              candidates.length === 0
                ? 'Es gibt gerade keine Einträge, denen Health-Werte fehlen.'
                : 'Für die offenen Einträge wurden im gewählten Zeitraum keine passenden Health-Daten gefunden.',
            );
          }
        } catch {
          setError('Export konnte nicht gelesen werden (ungültige oder beschädigte Datei?).');
        } finally {
          setBusy(false);
        }
      }, 0);
    };
    reader.onerror = () => {
      setError('Datei konnte nicht gelesen werden.');
      setBusy(false);
    };
    setFileName(file.name);
    reader.readAsText(file);
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedMatches = useMemo(
    () => (matches ?? []).filter((m) => selected.has(matchKey(m))),
    [matches, selected],
  );

  async function handleApply() {
    if (selectedMatches.length === 0) return;
    setApplying(true);
    try {
      await onApply(selectedMatches);
      onClose();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Apple Health importieren">
      <header className="sheet-head">
        <IconButton icon="x" label="Schließen" onClick={onClose} />
        <h2>Apple Health importieren</h2>
        <span className="appbar-spacer" />
      </header>

      <div className="sheet-scroll">
        <div className="card">
          <p className="muted newex-hint">
            Ergänzt Kalorien, Ø Herzfrequenz (und bei Fußball die Distanz) für bereits gespeicherte
            Einträge in Training, Stretching und Fußball – anhand des jeweils bekannten Zeitfensters.
            Bereits vorhandene Werte werden nie überschrieben. Export in der Health-App unter Profil →
            „Alle Gesundheitsdaten exportieren“, ZIP entpacken und hier die enthaltene{' '}
            <code>export.xml</code> wählen. Die Datei kann mehrere hundert MB groß sein; das Verarbeiten
            dauert dann einen Moment.
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
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {fileName && <span className="muted">{fileName}{busy ? ' – wird verarbeitet …' : ''}</span>}
          </div>
          {error && (
            <p className="notice" role="status">
              {error}
            </p>
          )}
        </div>

        {matches && matches.length > 0 && (
          <>
            <h3 className="section-title">
              {selected.size} von {matches.length} ausgewählt
            </h3>
            <ul className="exlist">
              {matches.map((m) => {
                const key = matchKey(m);
                const on = selected.has(key);
                const fields = (['distanceKm', 'calories', 'avgHeartRate'] as const).filter(
                  (f) => m.patch[f] !== undefined,
                );
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="exrow"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(key)}
                    >
                      <Icon name={KIND_ICON[m.candidate.kind]} size={18} />
                      <span className="exrow-text">
                        <strong>
                          {fmtDay(m.candidate.fromMs)} · {fmtTime(m.candidate.fromMs)} · {m.candidate.label}
                        </strong>
                        <small>
                          {fields
                            .map((f) => `${fieldLabel(f)} ${formatValue(f, m.patch[f]!)} ${unit(f)}`)
                            .join(' · ')}
                        </small>
                      </span>
                      <Icon name={on ? 'check' : 'plus'} size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {matches && matches.length > 0 && (
        <div className="sheet-foot">
          <button
            type="button"
            className="btn primary block"
            disabled={selectedMatches.length === 0 || applying}
            onClick={() => void handleApply()}
          >
            {applying ? 'Übernehme …' : `${selectedMatches.length} Eintrag/Einträge übernehmen`}
          </button>
        </div>
      )}
    </div>
  );
}
