import { useEffect, useState } from 'react';
import {
  addStretchRounds,
  buildStretchPayload,
  clearQueue,
  consumeQueued,
  DEFAULT_HOLD_SECONDS,
  STRETCH_AUTO_PAUSE_SECONDS,
  itemSummary,
  plannedRounds,
  sideLabel,
  type StretchAmount,
  type StretchDraft,
  type StretchExerciseInput,
  type StretchRound,
  type StretchSide,
} from '../lib/stretch';
import type { StretchExerciseListItem } from '../lib/storage';
import { AddStretchExercise } from './AddStretchExercise';
import { AutoPause } from './AutoPause';
import { HoldTimer } from './HoldTimer';
import { RepsDone } from './RepsDone';
import { Icon, IconButton } from './ui';

interface Props {
  draft: StretchDraft;
  stretchExercises: StretchExerciseListItem[];
  onUpdate: (fn: (d: StretchDraft) => StretchDraft) => void;
  onFinish: (feelingAfter: number | null, note: string) => void;
  onDiscard: () => void;
  busy: boolean;
}

// Nur "beide Seiten" (nacheinander) oder "ohne Seite"; einzelne Seiten (links/rechts) werden nicht mehr angeboten.
const SIDES: StretchSide[] = ['beidseitig', 'mittig'];

/** Laufende Übung: Ziel (Haltezeit oder Wiederholungen), Seite(n) und bereits fertige Durchgänge. */
interface Running {
  input: StretchExerciseInput;
  /** Ziel-Haltezeit (Timer); null bei Wiederholungs-Übungen. */
  holdSeconds: number | null;
  /** Ziel-Wiederholungen (kein Timer); null bei Haltezeit-Übungen. */
  reps: number | null;
  side: StretchSide;
  sets: number;
  /** Aus einer Vorlage: wird nach den Durchgängen aus der Warteschlange genommen. */
  fromQueue: boolean;
  done: StretchRound[];
  /** Automatische Kurzpause vor dem nächsten Durchgang läuft (Timer/Wiederholungen noch nicht gestartet). */
  pausing: boolean;
}

function useElapsedMinutes(startedAt: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
}

/** Reihe zum Wählen einer Zahl 1 (locker) – 10 (sehr verspannt). */
function FeelingScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div className="feeling">
      <span className="feeling-label">{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
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

export function StretchScreen({ draft, stretchExercises, onUpdate, onFinish, onDiscard, busy }: Props) {
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feelingAfter, setFeelingAfter] = useState<number | null>(null);
  const [note, setNote] = useState('');
  // Übung gewählt, Durchgang läuft: je Seite (und Satz) ein eigener Timer bzw. eine eigene
  // Wiederholungs-Abfrage; erst nach dem letzten Durchgang wird die Übung zur Session
  // hinzugefügt. fromQueue: Übung stammt aus einer importierten Vorlage und wird danach aus
  // der Warteschlange genommen statt manuell über AddStretchExercise gewählt zu werden.
  const [running, setRunning] = useState<Running | null>(null);
  const minutes = useElapsedMinutes(draft.startedAt);
  const queue = draft.queue ?? [];

  // Nächste Übung aus einer Vorlage automatisch starten, sobald keine läuft.
  useEffect(() => {
    if (running || adding || queue.length === 0) return;
    const head = queue[0];
    setRunning({
      input: head.input,
      holdSeconds: head.reps != null ? null : (head.holdSeconds ?? DEFAULT_HOLD_SECONDS),
      reps: head.reps ?? null,
      side: head.side,
      sets: head.sets,
      fromQueue: true,
      done: [],
      // Zwischen zwei Übungen einer Vorlage kurz Luft holen; vor der ersten nicht.
      pausing: draft.items.length > 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, running, adding]);

  function handlePick(input: StretchExerciseInput, amount: StretchAmount) {
    setAdding(false);
    setRunning({
      input,
      holdSeconds: amount.holdSeconds,
      reps: amount.reps,
      side: 'beidseitig',
      sets: 1,
      fromQueue: false,
      done: [],
      pausing: false,
    });
  }

  /** Übung mit den bisher absolvierten Durchgängen abschließen (leer = überspringen). */
  function commit(r: Running, rounds: StretchRound[]) {
    if (r.fromQueue) onUpdate((d) => consumeQueued(d, rounds));
    else if (rounds.length > 0) onUpdate((d) => addStretchRounds(d, r.input, rounds));
    setRunning(null);
  }

  /** Durchgang beendet: gemessene Sekunden bzw. Wiederholungen verbuchen, dann nächste Seite/Satz. */
  function handleRoundFinish(value: number) {
    if (!running) return;
    const planned = plannedRounds(running.side, running.sets);
    const current = planned[running.done.length];
    if (!current) return;
    const round: StretchRound = {
      side: current.side,
      holdSeconds: running.reps == null ? value : null,
      reps: running.reps,
    };
    const done = [...running.done, round];
    if (done.length >= planned.length) commit(running, done);
    else setRunning({ ...running, done, pausing: true });
  }

  /** Abbrechen: schon fertige Durchgänge bleiben erhalten, der laufende zählt nicht. */
  function handleCancel() {
    if (running) commit(running, running.done);
  }

  const payloadPreview = buildStretchPayload(draft, new Date(), feelingAfter, note);

  return (
    <div className="workout">
      <header className="appbar workout-bar">
        <div className="workout-title">
          <h1>Stretching</h1>
          <p>
            {minutes} min · {draft.items.length} {draft.items.length === 1 ? 'Übung' : 'Übungen'}
          </p>
        </div>
        <button
          type="button"
          className="btn primary compact"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Beenden
        </button>
      </header>

      <div className="screen">
        <FeelingScale
          label="Verspannung vorher"
          value={draft.feelingBefore}
          onChange={(n) => onUpdate((d) => ({ ...d, feelingBefore: n }))}
        />

        {draft.planName && queue.length > 0 && (
          <p className="notice" role="status">
            Vorlage „{draft.planName}“ · noch {queue.length} {queue.length === 1 ? 'Übung' : 'Übungen'}{' '}
            <button type="button" className="link" onClick={() => onUpdate((d) => clearQueue(d))}>
              Vorlage abbrechen
            </button>
          </p>
        )}

        {draft.items.length === 0 && !running && queue.length === 0 && (
          <div className="empty-state">
            <Icon name="flame" size={32} />
            <p>Noch keine Dehnübung.</p>
            <p className="muted">Füge die erste Dehnübung hinzu.</p>
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={20} /> Dehnübung hinzufügen
            </button>
          </div>
        )}

        {draft.items.length > 0 && (
          <ul className="exlist">
            {draft.items.map((it) => (
              <li key={it.id}>
                <div className="exrow static">
                  <span className="exrow-text">
                    <strong>{it.name}</strong>
                    <small>{itemSummary(it.side, it.holdSeconds, it.reps, it.sets)}</small>
                  </span>
                  <IconButton
                    icon="trash"
                    label={`${it.name} entfernen`}
                    tone="danger"
                    onClick={() => onUpdate((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {running && (() => {
          const planned = plannedRounds(running.side, running.sets);
          const idx = Math.min(running.done.length, planned.length - 1);
          const current = planned[idx];
          const roundTitle = [
            current.side === 'mittig' ? null : sideLabel(current.side),
            running.sets > 1 ? `Satz ${current.set}/${running.sets}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div className="card">
              <h3>{running.input.name}</h3>
              {running.done.length === 0 && (
                <div className="chips" role="group" aria-label="Seite">
                  {SIDES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={running.side === s ? 'chip on' : 'chip'}
                      aria-pressed={running.side === s}
                      onClick={() => setRunning((r) => (r ? { ...r, side: s } : r))}
                    >
                      {sideLabel(s)}
                    </button>
                  ))}
                </div>
              )}
              {roundTitle !== '' && (
                <p className="round-head" aria-live="polite">
                  {roundTitle}
                  {planned.length > 1 && <small> · Durchgang {idx + 1} von {planned.length}</small>}
                </p>
              )}
              {running.pausing ? (
                <AutoPause
                  key={`pause-${idx}`}
                  seconds={STRETCH_AUTO_PAUSE_SECONDS}
                  onDone={() => setRunning((r) => (r ? { ...r, pausing: false } : r))}
                />
              ) : running.reps != null ? (
                <RepsDone
                  key={idx}
                  reps={running.reps}
                  onFinish={handleRoundFinish}
                  onCancel={handleCancel}
                />
              ) : (
                <HoldTimer
                  key={idx}
                  targetSeconds={running.holdSeconds ?? DEFAULT_HOLD_SECONDS}
                  onFinish={handleRoundFinish}
                  onCancel={handleCancel}
                />
              )}
            </div>
          );
        })()}

        {draft.items.length > 0 && !running && (
          <button type="button" className="addtile" onClick={() => setAdding(true)}>
            <Icon name="plus" size={20} /> Weitere Dehnübung
          </button>
        )}
      </div>

      {confirming && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Stretching beenden">
          <div className="modal-card">
            {payloadPreview ? (
              <>
                <h2>Stretching speichern?</h2>
                <p className="muted">
                  {draft.items.length} {draft.items.length === 1 ? 'Übung' : 'Übungen'} in {minutes} min.
                </p>
                <FeelingScale label="Verspannung nachher" value={feelingAfter} onChange={setFeelingAfter} />
                <label className="notefield">
                  Notiz (optional)
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </label>
                <button
                  type="button"
                  className="btn primary block"
                  disabled={busy}
                  onClick={() => onFinish(feelingAfter, note)}
                >
                  {busy ? 'Speichere …' : 'Speichern'}
                </button>
              </>
            ) : (
              <>
                <h2>Keine Übung erfasst</h2>
                <p className="muted">Ohne eine Dehnübung wird nichts gespeichert.</p>
              </>
            )}
            <button type="button" className="btn block" onClick={() => setConfirming(false)}>
              Weiter dehnen
            </button>
            <button type="button" className="textbtn danger" onClick={onDiscard}>
              Verwerfen
            </button>
          </div>
        </div>
      )}

      {adding && (
        <AddStretchExercise exercises={stretchExercises} onPick={handlePick} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
