import { useEffect, useRef, useState } from 'react';
import { summarizeAppleHealthWindow } from '../lib/appleHealthImport';
import { fmtDay, todayIso } from '../lib/format';
import type { Result } from '../lib/api';
import { describeArchiveMiss, type ArchiveLookup } from '../lib/healthArchive';
import {
  describeRangeSummary,
  diagnoseWatchRange,
  hasWatchValues,
  WATCH_CLOCK_TOLERANCE_MS,
  watchShortcutUrl,
  type WatchRangeRecord,
} from '../lib/footballWatch';
import {
  addMinutesToTime,
  CARDIO_ACTIVITIES,
  cardioActivityLabel,
  cardioIconName,
  cardioLoad,
  minutesBetweenTimes,
  rpeRequired,
  type CardioActivity,
  type CardioEntryInput,
  type CardioSource,
} from '../lib/cardio';
import type { HistCardioSession } from '../lib/storage';
import { Icon, IconButton, MetricField } from './ui';

interface Props {
  history: HistCardioSession[];
  /** Werte für einen Zeitraum aus dem Health-Archiv (automatisch gesicherte Apple-Watch-Rohwerte). */
  onLoadArchive: (fromMs: number, toMs: number) => Promise<Result<ArchiveLookup>>;
  /** Apple-Watch-Ergebnis für genau diesen Zeitraum (null: dafür ist nichts angekommen). */
  onLoadWatchRange: (fromMs: number, toMs: number) => Promise<Result<WatchRangeRecord | null>>;
  /** Zuletzt eingegangenes Apple-Watch-Ergebnis überhaupt, für die Fehlersuche. */
  onLoadLatestWatchRange: () => Promise<Result<WatchRangeRecord | null>>;
  pending: number;
  busy: boolean;
  notice: string | null;
  onSave: (input: CardioEntryInput) => void;
  onSync: () => void;
  onDelete: (id: string) => void;
}

const DEFAULT_RPE = 5;
const DEFAULT_MINUTES = 90;

/**
 * Cardio (Fußball, Laufen, Radfahren): eigener, einfacher Bereich – anders als Training/Stretching
 * kein Live-Timer, sondern ein Formular, das nach der Einheit ausgefüllt wird (Aktivität, Dauer,
 * subjektive Belastung/RPE, Notiz). RPE ist nur bei Fußball Pflicht. Optional lassen sich Distanz, Kalorien und Ø Herzfrequenz aus
 * einem Apple-Health-Export für den Zeitraum der Einheit übernehmen (Apple Health
 * sammelt diese Werte auch ohne eine aktiv gestartete Aufzeichnung auf der Uhr). Die
 * letzten Einträge stehen darunter zum Nachschauen und Löschen; die volle Auswertung
 * mit Diagramm ist im Verlauf-Tab.
 */
export function CardioScreen({
  history,
  onLoadArchive,
  onLoadWatchRange,
  onLoadLatestWatchRange,
  pending,
  busy,
  notice,
  onSave,
  onSync,
  onDelete,
}: Props) {
  const [playedOn, setPlayedOn] = useState(() => todayIso());
  const [startedAtTime, setStartedAtTime] = useState('');
  const [activity, setActivity] = useState<CardioActivity>('football');
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [rpe, setRpe] = useState<number | null>(DEFAULT_RPE);
  const [note, setNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [calories, setCalories] = useState<number | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [avgHeartRate, setAvgHeartRate] = useState<number | null>(null);
  const [maxHeartRate, setMaxHeartRate] = useState<number | null>(null);
  const [source, setSource] = useState<CardioSource>('manual');
  const [watchRangeBusy, setWatchRangeBusy] = useState(false);
  const [watchRangeNotice, setWatchRangeNotice] = useState<string | null>(null);
  /** Zeitpunkt des Antippens von „Apple-Watch-Daten holen“, solange der Kurzbefehl läuft; null sonst. */
  const awaitingWatchSince = useRef<number | null>(null);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || awaitingWatchSince.current === null) return;
      const since = awaitingWatchSince.current;
      awaitingWatchSince.current = null;
      void applyWatchRange(since);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  /** Stand der Archiv-Abfrage für den gewählten Zeitraum: Treffer, oder eine Erklärung, warum nichts da ist. */
  const [archive, setArchive] = useState<
    { state: 'idle' | 'loading' } | { state: 'hit'; lookup: ArchiveLookup } | { state: 'miss'; text: string }
  >({ state: 'idle' });

  const [healthXml, setHealthXml] = useState<string | null>(null);
  const [healthFileName, setHealthFileName] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthNotice, setHealthNotice] = useState<string | null>(null);

  const valid = playedOn.trim() !== '' && minutes > 0 && (!rpeRequired(activity) || rpe !== null);
  const rangeFromMs = new Date(`${playedOn}T${startedAtTime}:00`).getTime();
  const rangeReady = startedAtTime.trim() !== '' && minutes > 0 && Number.isFinite(rangeFromMs);

  // Sobald ein Zeitraum steht, im Archiv nachsehen (kurz verzögert, damit Tippen in Zeitfeldern nicht jede Ziffer abfragt).
  // Das Ergebnis wird nur vorgeschlagen, nie ungefragt ins Formular geschrieben.
  const minutesKey = Number.isFinite(minutes) ? minutes : 0;
  useEffect(() => {
    if (!rangeReady) {
      setArchive({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setArchive({ state: 'loading' });
    const timer = window.setTimeout(() => {
      void onLoadArchive(rangeFromMs, rangeFromMs + minutesKey * 60_000).then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setArchive({ state: 'miss', text: `Archiv nicht abrufbar: ${res.error}` });
        } else if (hasWatchValues(res.data.summary)) {
          setArchive({ state: 'hit', lookup: res.data });
        } else {
          setArchive({ state: 'miss', text: describeArchiveMiss(res.data, rangeFromMs) });
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rangeReady, rangeFromMs, minutesKey, onLoadArchive]);

  function resetForm() {
    setMinutes(DEFAULT_MINUTES);
    setRpe(rpeRequired(activity) ? DEFAULT_RPE : null);
    setNote('');
    setStartedAtTime('');
    setDistanceKm(null);
    setCalories(null);
    setSteps(null);
    setAvgHeartRate(null);
    setMaxHeartRate(null);
    setSource('manual');
    setWatchRangeNotice(null);
    setHealthNotice(null);
  }

  function submit() {
    if (!valid) return;
    onSave({
      playedOn,
      activity,
      startedAtTime,
      minutes,
      rpe,
      note,
      distanceKm,
      calories,
      steps,
      avgHeartRate,
      maxHeartRate,
      source,
    });
    resetForm();
  }

  /**
   * Holt das Apple-Watch-Ergebnis für den im Formular gewählten Zeitraum (Datum, Startzeit, Dauer) und trägt
   * Ø Puls und Distanz ein. Mit `since` (Zeitpunkt des Antippens, direkt nach der Rückkehr aus dem Kurzbefehl)
   * wird bis zu ~45 s erneut geprüft, weil der Kurzbefehl das Ergebnis oft erst sendet, wenn man schon zurück
   * in der App ist, und nur ein Ergebnis NACH dem Antippen zählt. Kommt nichts an, erklärt die Meldung, an
   * welcher Stelle es hakt (siehe diagnoseWatchRange).
   */
  async function applyWatchRange(since: number | null = null) {
    if (!rangeReady) return;
    setWatchRangeBusy(true);
    setWatchRangeNotice(since !== null ? 'Warte auf die Daten vom Kurzbefehl …' : null);
    const fromMs = rangeFromMs;
    const toMs = fromMs + minutes * 60_000;
    const attempts = since !== null ? 10 : 1;
    let match: WatchRangeRecord | null = null;
    for (let i = 0; i < attempts; i++) {
      const res = await onLoadWatchRange(fromMs, toMs);
      if (!res.ok) {
        setWatchRangeBusy(false);
        setWatchRangeNotice(`Abruf fehlgeschlagen: ${res.error}`);
        return;
      }
      match = res.data;
      // Ein Ergebnis von vor dem Antippen ist keine Antwort auf diesen Lauf: weiter warten.
      const fresh = match !== null && (since === null || new Date(match.receivedAt).getTime() >= since - WATCH_CLOCK_TOLERANCE_MS);
      if (fresh) break;
      if (i < attempts - 1) await new Promise((r) => window.setTimeout(r, 4500));
    }
    const latest = await onLoadLatestWatchRange();
    setWatchRangeBusy(false);
    const diag = diagnoseWatchRange(match, latest.ok ? latest.data : null, fromMs, toMs, Date.now(), since);
    if (diag.kind === 'ok' && match) {
      setAvgHeartRate(match.avgHeartRate);
      setMaxHeartRate(match.maxHeartRate);
      setDistanceKm(match.distanceKm);
      setCalories(match.energyKcal);
      setSteps(match.steps);
      setSource('apple_health');
      setWatchRangeNotice(`${diag.text} Bei Bedarf unten anpassen.`);
      return;
    }
    setWatchRangeNotice(diag.text);
  }

  /** Übernimmt die Archiv-Werte für den gewählten Zeitraum ins Formular. */
  function applyArchive() {
    if (archive.state !== 'hit') return;
    const r = archive.lookup.summary;
    setAvgHeartRate(r.avgHeartRate);
    setMaxHeartRate(r.maxHeartRate);
    setDistanceKm(r.distanceKm);
    setCalories(r.energyKcal);
    setSteps(r.steps);
    setSource('apple_health');
    setWatchRangeNotice('Aus dem Archiv übernommen. Bei Bedarf unten anpassen.');
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
        setSteps(null);
        setAvgHeartRate(res.avgHeartRate);
        setMaxHeartRate(null);
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
        <h1>Cardio</h1>
      </header>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending > 0 && (
        <p className="notice" role="status">
          {pending} Cardio-Eintrag/Einträge noch nicht gespeichert. Sie werden gesendet, sobald eine
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
          <span>Aktivität</span>
          <div className="chips" role="group" aria-label="Aktivität">
            {CARDIO_ACTIVITIES.map((a) => (
              <button
                key={a}
                type="button"
                className={activity === a ? 'chip on' : 'chip'}
                aria-pressed={activity === a}
                onClick={() => {
                  setActivity(a);
                  // Fußball braucht RPE: nie ohne Wert stehen lassen.
                  if (rpeRequired(a) && rpe === null) setRpe(DEFAULT_RPE);
                }}
              >
                <Icon name={cardioIconName(a)} size={16} /> {cardioActivityLabel(a)}
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
          <span className="feeling-label">
            Subjektive Belastung (RPE 0–10){rpeRequired(activity) ? '' : ' – optional'}
          </span>
          <div className="chips" role="group" aria-label="Subjektive Belastung (RPE)">
            {!rpeRequired(activity) && (
              <button
                type="button"
                className={rpe === null ? 'chip on' : 'chip'}
                aria-pressed={rpe === null}
                onClick={() => setRpe(null)}
              >
                –
              </button>
            )}
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

          {archive.state === 'loading' && <p className="muted">Suche im Archiv …</p>}
          {archive.state === 'hit' && (
            <div className="row wrap">
              <span>
                Im Archiv gefunden: {describeRangeSummary(archive.lookup.summary)}.
              </span>
              <button type="button" className="btn compact primary" onClick={applyArchive}>
                <Icon name="heart" size={16} /> Werte übernehmen
              </button>
            </div>
          )}
          {archive.state === 'miss' && <p className="muted">{archive.text}</p>}

          <div className="row wrap">
            {rangeReady ? (
              <a
                className="btn compact primary"
                href={watchShortcutUrl(rangeFromMs, rangeFromMs + minutes * 60_000)}
                onClick={() => {
                  awaitingWatchSince.current = Date.now();
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
              {watchRangeBusy ? 'Prüfe …' : 'Erneut prüfen'}
            </button>
          </div>
          <p className="muted newex-hint">
            Läuft der automatische Archiv-Kurzbefehl, findest du die Werte oben im Archiv, auch Tage später. Fehlt dort
            etwas, stelle Datum und Zeitraum (Von/Bis oder Dauer) frei ein und tippe auf „Apple-Watch-Daten holen“: Der
            Kurzbefehl liest nur diesen Zeitraum aus Health (iPhone entsperrt lassen). Danach kommst du über den
            Rücksprung-Link oben links in der Statusleiste zurück, die App holt Ø-Puls und Distanz dann automatisch.
            Ohne gestartete Aufzeichnung misst die Uhr die Herzfrequenz nur alle paar Minuten, Ø und Max beruhen daher auf
            wenigen Messwerten; deine RPE bleibt die Hauptgröße. „Erneut prüfen“ holt das Ergebnis noch einmal ab.
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
          <MetricField label="Aktive Energie" unit="kcal" value={calories} onChange={setCalories} />
          <MetricField label="Schritte" unit="" value={steps} onChange={setSteps} />
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
                      {fmtDay(s.playedOn)} · {cardioActivityLabel(s.activity)}
                    </strong>
                    <small>
                      {s.minutes} min
                      {s.rpe !== null ? ` · RPE ${s.rpe} · Belastung ${cardioLoad(s.minutes, s.rpe)}` : ''}
                      {s.distanceKm !== null ? ` · ${s.distanceKm.toFixed(s.distanceKm < 1 ? 2 : 1)} km` : ''}
                      {s.steps != null ? ` · ${s.steps.toLocaleString('de-DE')} Schritte` : ''}
                      {s.calories !== null ? ` · ${s.calories} kcal` : ''}
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
                    <p>Diesen Eintrag endgültig löschen?</p>
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
