import { useState } from 'react';
import { fmtDay, todayIso } from '../lib/format';
import {
  FOOTBALL_KINDS,
  footballKindLabel,
  footballLoad,
  type FootballEntryInput,
  type FootballKind,
} from '../lib/football';
import type { HistFootballSession } from '../lib/storage';
import { Icon, IconButton } from './ui';

interface Props {
  history: HistFootballSession[];
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
 * Belastung/RPE, Notiz). Die letzten Einträge stehen darunter zum Nachschauen und
 * Löschen; die volle Auswertung mit Diagramm ist im Verlauf-Tab.
 */
export function FootballScreen({ history, pending, busy, notice, onSave, onSync, onDelete }: Props) {
  const [playedOn, setPlayedOn] = useState(() => todayIso());
  const [kind, setKind] = useState<FootballKind>('training');
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [rpe, setRpe] = useState(DEFAULT_RPE);
  const [note, setNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const valid = playedOn.trim() !== '' && minutes > 0;

  function submit() {
    if (!valid) return;
    onSave({ playedOn, kind, minutes, rpe, note });
    setKind('training');
    setMinutes(DEFAULT_MINUTES);
    setRpe(DEFAULT_RPE);
    setNote('');
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
