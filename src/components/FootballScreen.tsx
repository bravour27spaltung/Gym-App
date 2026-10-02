import { useEffect, useRef, useState } from 'react';
import { summarizeAppleHealthWindow } from '../lib/appleHealthImport';
import { fmtDay, todayIso } from '../lib/format';
import type { Result } from '../lib/api';
import {
  describeRangeSummary,
  describeWatchWindow,
  summarizeWatchSamples,
  watchShortcutUrl,
  watchWindowToForm,
  type WatchSample,
  type WatchWindow,
} from '../lib/footballWatch';
import {
  addMinutesToTime,
  FOOTBALL_KINDS,
  minutesBetweenTimes,
  footballKindLabel,
  footballLoad,
  type FootballEntryInput,
  type FootballKind,
  type FootballSource,
} from '../lib/football';
import type { HistFootballSession } from '../lib/storage';
import { Icon, IconButton, MetricField } from './ui';

interface Props {
  history: HistFootballSession[];
  /** Von der Apple Watch erkannte Trainingsfenster, die noch als Vorschlag angeboten werden. */
  watchWindows: WatchWindow[];
  onDismissWatchWindow: (id: string) => void;
  /** Lädt die Apple-Watch-Rohwerte, deren Start im gewählten Zeitraum liegt. */
  onLoadSamples: (fromMs: number, toMs: number) => Promise<Result<WatchSample[]>>;
  pending: number;
  busy: boolean;
  notice: string | null;
  onSave: (input: FootballEntryInput) => void;
  onSync: () => void;
  onDelete: (id: string) => void;
}

const DEFAULT_RPE = 5;
const DEFAULT_MINUTES = 90;

/**
 * Fußball: eigener, einfacher Bereich – anders als Training/Stretching kein Live-Timer,
 * sondern ein Formular, das nach der Einheit ausgefüllt wird (Dauer, Typ, subjektive
 * Belastung/RPE, Notiz). Optional lassen sich Distanz, Kalorien und Ø Herzfrequenz aus
 * einem Apple-Health-Export für den Zeitraum der Einheit übernehmen (Apple Health
 * sammelt diese Werte auch ohne eine aktiv gestartete Aufzeichnung auf der Uhr). Die
 * letzten Einträge stehen darunter zum Nachschauen und Löschen; die volle Auswertung
 * mit Diagramm ist im Verlauf-Tab.
 */
export function FootballScreen({
  history,
  watchWindows,
  onDismissWatchWindow,
  onLoadSamples,
  pending,
  busy,
  notice,
  onSave,
  onSync,
  onDelete,
}: Props) {
  const [playedOn, setPlayedOn] = useState(() => todayIso());
  const [startedAtTime, setStartedAtTime] = useState('');
  const [kind, setKind] = useState<FootballKind>('training');
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [rpe, setRpe] = useState(DEFAULT_RPE);
  const [note, setNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [calories, setCalories] = useState<number | null>(null);
  const [avgHeartRate, setAvgHeartRate] = useState<number | null>(null);
  const [source, setSource] = useState<FootballSource>('manual');
  const [watchWindowId, setWatchWindowId] = useState<string | null>(null);
  const [watchNotice, setWatchNotice] = useState<string | null>(null);
  const [watchRangeBusy, setWatchRangeBusy] = useState(false);
  const [watchRangeNotice, setWatchRangeNotice] = useState<string | null>(null);
  /** true, solange der Kurzbefehl läuft: beim Zurückkehren in die App wird automatisch gerechnet. */
  const awaitingWatch = useRef(false);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !awaitingWatch.current) return;
      awaitingWatch.current = false;
      void applyWatchRange();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const [healthXml, setHealthXml] = useState<string | null>(null);
  const [healthFileName, setHealthFileName] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthNotice, setHealthNotice] = useState<string | null>(null);

  const valid = playedOn.trim() !== '' && minutes > 0;
  const rangeFromMs = new Date(`${playedOn}T${startedAtTime}:00`).getTime();
  const rangeReady = startedAtTime.trim() !== '' && minutes > 0 && Number.isFinite(rangeFromMs);

  function resetForm() {
    setKind('training');
    setMinutes(DEFAULT_MINUTES);
    setRpe(DEFAULT_RPE);
    setNote('');
    setStartedAtTime('');
    setDistanceKm(null);
    setCalories(null);
    setAvgHeartRate(null);
    setSource('manual');
    setWatchWindowId(null);
    setWatchNotice(null);
    setWatchRangeNotice(null);
    setHealthNotice(null);
  }

  /** Übernimmt Startzeit, Dauer, Ø Puls und Distanz eines Apple-Watch-Vorschlags ins Formular. */
  function applyWatchWindow(w: WatchWindow) {
    const v = watchWindowToForm(w);
    setPlayedOn(v.playedOn);
    setStartedAtTime(v.startedAtTime);
    setMinutes(v.minutes);
    setAvgHeartRate(v.avgHeartRate);
    setDistanceKm(v.distanceKm);
    setCalories(null);
    setSource('apple_health');
    setWatchWindowId(w.id);
    setWatchNotice(
      `Von der Apple Watch übernommen: ${describeWatchWindow(w)}. Jetzt noch Art der Einheit und RPE eintragen.`,
    );
  }

  function submit() {
    if (!valid) return;
    onSave({
      playedOn,
      startedAtTime,
      kind,
      minutes,
      rpe,
      note,
      distanceKm,
      calories,
      avgHeartRate,
      source,
      watchWindowId,
    });
    resetForm();
  }

  /** Berechnet Ø Puls und Distanz für den im Formular gewählten Zeitraum (Datum, Startzeit, Dauer). */
  async function applyWatchRange() {
    if (startedAtTime.trim() === '' || !(minutes > 0)) return;
    setWatchRangeBusy(true);
    setWatchRangeNotice(null);
    const fromMs = new Date(`${playedOn}T${startedAtTime}:00`).getTime();
    const res = await onLoadSamples(fromMs, fromMs + minutes * 60_000);
    setWatchRangeBusy(false);
    if (!res.ok) {
      setWatchRangeNotice(`Abruf fehlgeschlagen: ${res.error}`);
      return;
    }
    const sum = summarizeWatchSamples(res.data, fromMs, fromMs + minutes * 60_000);
    if (sum.avgHeartRate === null && sum.distanceKm === null) {
      setWatchRangeNotice(
        'Für diesen Zeitraum liegen keine Apple-Watch-Daten vor. Zuerst „Apple-Watch-Daten abrufen“ antippen und Datum, Startzeit und Dauer prüfen.',
      );
      return;
    }
    setAvgHeartRate(sum.avgHeartRate);
    setDistanceKm(sum.distanceKm);
    setCalories(null);
    setSource('apple_health');
    setWatchRangeNotice(`Übernommen: ${describeRangeSummary(sum)}. Bei Bedarf unten anpassen.`);
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
    if (!healthXml || startedAtTime.trim() === '' || minutes <= 0) return;
    setHealthBusy(true);
    setHealthNotice(null);
    // Kurz aus dem Event-Loop raus, damit "Verarbeite …" noch gerendert wird, bevor
    // der (bei großen Exporten spürbar langsame) Text-Scan das Hauptthema blockiert.
    window.setTimeout(() => {
      try {
        const startedAt = new Date(`${playedOn}T${startedAtTime}:00`);
        const res = summarizeAppleHealthWindow(healthXml, startedAt, minutes);
        setDistanceKm(res.distanceKm);
        setCalories(res.calories);
        setAvgHeartRate(res.avgHeartRate);
        setSource('apple_health');
        if (res.distanceKm === null && res.calories === null && res.avgHeartRate === null) {
          setHealthNotice('Keine passenden Health-Daten in diesem Zeitfenster gefunden.');
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
        <h1>Fußball</h1>
      </header>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending > 0 && (
        <p className="notice" role="status">
          {pending} Fußball-Eintrag/Einträge noch nicht gespeichert. Sie werden gesendet, sobald eine
          Verbindung besteht.{' '}
          <button type="button" className="link" onClick={onSync}>
            Jetzt versuchen
          </button>
        </p>
      )}

      {watchWindows.length > 0 && (
        <>
          <h2 className="section-title">Apple Watch erkannt</h2>
          <ul className="exlist">
            {watchWindows.map((w) => (
              <li key={w.id}>
                <div className="exrow static">
                  <span className="exrow-text">
                    <strong>{fmtDay(w.startedAt)}</strong>
                    <small>{describeWatchWindow(w)}</small>
                  </span>
                  <button
                    type="button"
                    className={watchWindowId === w.id ? 'btn compact primary' : 'btn compact'}
                    onClick={() => applyWatchWindow(w)}
                  >
                    Übernehmen
                  </button>
                  <IconButton
                    icon="x"
                    label={`Vorschlag vom ${fmtDay(w.startedAt)} ausblenden`}
                    onClick={() => onDismissWatchWindow(w.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="muted newex-hint">
            Ohne gestartete Aufzeichnung misst die Uhr die Herzfrequenz nur alle paar Minuten; Ø und Max
            beruhen auf wenigen Messwerten, Dauer und Distanz sind Näherungen. Deine RPE bleibt die Hauptgröße.
          </p>
        </>
      )}

      <div className="card">
        {watchNotice && (
          <p className="notice" role="status">
            {watchNotice}
          </p>
        )}
        <label className="field stack">
          <span>Datum</span>
          <input
            className="text"
            type="date"
            value={playedOn}
            max={todayIso()}
            onChange={(e) => setPlayedOn(e.target.value)}
          />
        </label>

        <div className="field stack">
          <span>Zeitraum</span>
          <div className="row wrap">
            <label className="row">
              <span className="unit">Von</span>
              <input
                className="text"
                type="time"
                aria-label="Startzeit"
                value={startedAtTime}
                onChange={(e) => setStartedAtTime(e.target.value)}
              />
            </label>
            <label className="row">
              <span className="unit">Bis</span>
              <input
                className="text"
                type="time"
                aria-label="Endzeit"
                value={startedAtTime ? addMinutesToTime(startedAtTime, minutes) : ''}
                disabled={startedAtTime.trim() === ''}
                onChange={(e) => {
                  const diff = minutesBetweenTimes(startedAtTime, e.target.value);
                  if (Number.isFinite(diff) && diff > 0) setMinutes(Math.min(240, diff));
                }}
              />
            </label>
          </div>
        </div>

        <div className="field stack">
          <span>Art der Einheit</span>
          <div className="chips" role="group" aria-label="Art der Einheit">
            {FOOTBALL_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={kind === k ? 'chip on' : 'chip'}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {footballKindLabel(k)}
              </button>
            ))}
          </div>
        </div>

        <div className="field stack">
          <span>Dauer</span>
          <div className="equip-input">
            <input
              className="cellinput"
              type="number"
              inputMode="numeric"
              min={0}
              max={240}
              aria-label="Dauer in Minuten"
              value={Number.isFinite(minutes) ? minutes : ''}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setMinutes(Number.isFinite(n) ? Math.max(0, Math.min(240, n)) : NaN);
              }}
            />
            <span className="unit">min</span>
          </div>
        </div>

        <div className="feeling">
          <span className="feeling-label">Subjektive Belastung (RPE 0–10)</span>
          <div className="chips" role="group" aria-label="Subjektive Belastung (RPE)">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button
                key={n}
                type="button"
                className={rpe === n ? 'chip on' : 'chip'}
                aria-pressed={rpe === n}
                onClick={() => setRpe(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <label className="notefield">
          Notiz (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </label>

        <details className="equipment" open>
          <summary>Zusatzwerte (Distanz, Ø Puls) – optional, aus Apple Watch oder Health-Export</summary>

          <div className="row wrap">
            {rangeReady ? (
              <a
                className="btn compact primary"
                href={watchShortcutUrl(rangeFromMs, rangeFromMs + minutes * 60_000)}
                onClick={() => {
                  awaitingWatch.current = true;
                }}
              >
                <Icon name="heart" size={16} /> Apple-Watch-Daten holen
              </a>
            ) : (
              <button type="button" className="btn compact" disabled>
                <Icon name="heart" size={16} /> Apple-Watch-Daten holen
              </button>
            )}
            <button
              type="button"
              className="btn compact"
              disabled={!rangeReady || watchRangeBusy}
              onClick={() => void applyWatchRange()}
            >
              {watchRangeBusy ? 'Berechne …' : 'Nur berechnen'}
            </button>
          </div>
          <p className="muted newex-hint">
            Stelle oben Datum und Zeitraum (Von/Bis oder Dauer) frei ein und tippe auf „Apple-Watch-Daten holen“: Der
            Kurzbefehl lädt nur diesen Zeitraum aus Health. Danach kommst du über den Rücksprung-Link oben links in der Statusleiste
            zurück, die App rechnet Ø/Max-Puls, Distanz und Schritte dann automatisch. „Nur berechnen“ nutzt bereits
            abgerufene Daten.
          </p>
          {watchRangeNotice && <p className="muted">{watchRangeNotice}</p>}

          <p className="muted newex-hint">
            Trägst du die Einheit nur nachträglich ein, ohne eine Aufzeichnung auf der Uhr zu starten? Health
            sammelt Distanz, Kalorien und Herzfrequenz trotzdem im Hintergrund. Exportiere in der
            Health-App unter Profil → „Alle Gesundheitsdaten exportieren“, entpacke das ZIP und wähle hier
            die enthaltene <code>export.xml</code>. Die Datei kann mehrere hundert MB groß sein; das
            Verarbeiten dauert dann einen Moment. Genauigkeit: Distanz/Kalorien/Puls sind Schätzungen der
            Uhr, kein Ersatz für eine gestartete Trainingsaufzeichnung.
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
              disabled={!healthXml || startedAtTime.trim() === '' || minutes <= 0 || healthBusy}
              onClick={applyHealthImport}
            >
              {healthBusy ? 'Verarbeite …' : 'Werte übernehmen'}
            </button>
          </div>
          {healthNotice && <p className="muted">{healthNotice}</p>}

          <MetricField label="Distanz" unit="km" step={0.1} value={distanceKm} onChange={setDistanceKm} />
          <MetricField label="Kalorien" unit="kcal" value={calories} onChange={setCalories} />
          <MetricField label="Ø Herzfrequenz" unit="bpm" value={avgHeartRate} onChange={setAvgHeartRate} />
        </details>

        <button type="button" className="btn primary block" disabled={!valid || busy} onClick={submit}>
          <Icon name="plus" size={18} /> {busy ? 'Speichere …' : 'Eintrag speichern'}
        </button>
      </div>

      {history.length > 0 && (
        <>
          <h2 className="section-title">Letzte Einträge</h2>
          <ul className="exlist">
            {history.slice(0, 8).map((s) => (
              <li key={s.id}>
                <div className="exrow static">
                  <span className="exrow-text">
                    <strong>
                      {fmtDay(s.playedOn)} · {footballKindLabel(s.kind)}
                    </strong>
                    <small>
                      {s.minutes} min · RPE {s.rpe} · Belastung {footballLoad(s.minutes, s.rpe)}
                      {s.distanceKm !== null ? ` · ${s.distanceKm.toFixed(1)} km` : ''}
                      {s.avgHeartRate !== null ? ` · Ø ${s.avgHeartRate} bpm` : ''}
                      {s.note ? ` · ${s.note}` : ''}
                    </small>
                  </span>
                  <IconButton
                    icon="trash"
                    label={`Eintrag vom ${fmtDay(s.playedOn)} löschen`}
                    tone="danger"
                    onClick={() => setConfirmDeleteId(s.id)}
                  />
                </div>
                {confirmDeleteId === s.id && (
                  <div className="banner" role="alertdialog" aria-label="Eintrag löschen">
                    <p>Diesen Fußball-Eintrag endgültig löschen?</p>
                    <div className="row">
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onDelete(s.id);
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
