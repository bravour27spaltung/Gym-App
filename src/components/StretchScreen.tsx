import { useEffect, useState } from 'react';
import {
  addStretchItem,
  buildStretchPayload,
  sideLabel,
  type StretchDraft,
  type StretchExerciseInput,
  type StretchSide,
} from '../lib/stretch';
import type { StretchExerciseListItem } from '../lib/storage';
import { AddStretchExercise } from './AddStretchExercise';
import { HoldTimer } from './HoldTimer';
import { Icon, IconButton } from './ui';

interface Props {
  draft: StretchDraft;
  stretchExercises: StretchExerciseListItem[];
  onUpdate: (fn: (d: StretchDraft) => StretchDraft) => void;
  onFinish: (feelingAfter: number | null, note: string) => void;
  onDiscard: () => void;
  busy: boolean;
}

const SIDES: StretchSide[] = ['beidseitig', 'links', 'rechts'];

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
  // Übung gewählt, Haltezeit-Timer läuft; erst nach "Fertig" wird sie zur Session hinzugefügt.
  const [running, setRunning] = useState<{ input: StretchExerciseInput; holdSeconds: number; side: StretchSide } | null>(
    null,
  );
  const minutes = useElapsedMinutes(draft.startedAt);

  function handlePick(input: StretchExerciseInput, holdSeconds: number) {
    setAdding(false);
    setRunning({ input, holdSeconds, side: 'beidseitig' });
  }

  function handleTimerFinish(actualSeconds: number) {
    if (!running) return;
    onUpdate((d) => addStretchItem(d, running.input, running.side, actualSeconds));
    setRunning(null);
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

        {draft.items.length === 0 && !running && (
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
                    <small>
                      {sideLabel(it.side)} · {it.holdSeconds} s{it.sets > 1 ? ` × ${it.sets}` : ''}
                    </small>
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

        {running && (
          <div className="card">
            <h3>{running.input.name}</h3>
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
            <HoldTimer
              targetSeconds={running.holdSeconds}
              onFinish={handleTimerFinish}
              onCancel={() => setRunning(null)}
            />
          </div>
        )}

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
