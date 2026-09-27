import { useState } from 'react';
import { CONFIRM_WORD, isConfirmed, type ResetScope } from '../lib/reset';

interface Props {
  /** Gibt eine Fehlermeldung zurück oder null bei Erfolg. */
  onReset: (scope: ResetScope) => Promise<string | null>;
  onClose: () => void;
}

const OPTIONS: { scope: ResetScope; title: string; text: string }[] = [
  {
    scope: 'training',
    title: 'Nur Trainings',
    text: 'Löscht alle Trainings mit Sätzen, den Verlauf und Fußball-Einträge. Pläne, Vorlagen und eigene Übungen bleiben.',
  },
  {
    scope: 'all',
    title: 'Alles zurücksetzen',
    text: 'Löscht zusätzlich alle Pläne, Vorlagen und deine eigenen Übungen. Nur der Übungskatalog bleibt.',
  },
];

/** Bestätigungsdialog zum Zurücksetzen der Testdaten; gelöscht wird erst nach Eintippen des Wortes. */
export function ResetData({ onReset, onClose }: Props) {
  const [scope, setScope] = useState<ResetScope>('training');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const err = await onReset(scope);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Daten zurücksetzen">
      <div className="modal-card reset-card">
        <h2>Daten zurücksetzen</h2>
        <p className="muted">
          Das löscht Daten dauerhaft in der Datenbank und auf diesem Gerät. Es lässt sich nicht
          rückgängig machen.
        </p>

        <div className="reset-options" role="radiogroup" aria-label="Was soll gelöscht werden?">
          {OPTIONS.map((o) => (
            <button
              key={o.scope}
              type="button"
              role="radio"
              aria-checked={scope === o.scope}
              className={scope === o.scope ? 'reset-option on' : 'reset-option'}
              disabled={busy}
              onClick={() => setScope(o.scope)}
            >
              <strong>{o.title}</strong>
              <small>{o.text}</small>
            </button>
          ))}
        </div>

        <label className="reset-confirm">
          Zum Bestätigen „{CONFIRM_WORD}“ eintippen
          <input
            className="text"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={word}
            disabled={busy}
            onChange={(e) => setWord(e.target.value)}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn danger block"
          disabled={busy || !isConfirmed(word)}
          onClick={() => void run()}
        >
          {busy ? 'Lösche …' : 'Endgültig löschen'}
        </button>
        <button type="button" className="btn block" disabled={busy} onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
