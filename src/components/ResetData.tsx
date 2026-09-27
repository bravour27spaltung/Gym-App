import { useState } from 'react';
import { CONFIRM_WORD, isConfirmed } from '../lib/reset';

interface Props {
  /** Gibt eine Fehlermeldung zurück oder null bei Erfolg. */
  onReset: () => Promise<string | null>;
  onClose: () => void;
}

/**
 * Bestätigungsdialog zum Zurücksetzen der Testdaten. Löscht nur Trainings, Sätze,
 * Verlauf und Fußball-Einträge – Pläne, Vorlagen und eigene Übungen bleiben immer
 * erhalten. Gelöscht wird erst, nachdem das Bestätigungswort eingetippt wurde.
 */
export function ResetData({ onReset, onClose }: Props) {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const err = await onReset();
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Testdaten zurücksetzen">
      <div className="modal-card reset-card">
        <h2>Testdaten zurücksetzen</h2>
        <p className="muted">
          Löscht alle Trainings mit Sätzen, den Verlauf und Fußball-Einträge dauerhaft – in der
          Datenbank und auf diesem Gerät. Es lässt sich nicht rückgängig machen.
        </p>
        <p className="muted">Deine Pläne, Vorlagen und eigenen Übungen bleiben erhalten.</p>

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
