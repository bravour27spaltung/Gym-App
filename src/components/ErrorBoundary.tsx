import { Component, type ReactNode } from 'react';
import { browserStore } from '../lib/storage';

interface Props {
  children?: ReactNode;
}

interface State {
  message: string | null;
}

/**
 * Fängt Fehler beim Zeichnen ab und zeigt sie an, statt eine leere Seite zu lassen.
 * Lokale Daten (laufendes Training, Ausgangskorb) werden dabei nicht angerührt.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown): void {
    console.error('Gym-Log Fehler:', error);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <main className="screen">
        <h1>Gym-Log</h1>
        <p className="error" role="alert">
          Etwas ist schiefgelaufen: {this.state.message}
        </p>
        <p className="muted">
          Dein laufendes Training und ungesendete Trainings bleiben auf dem Gerät gespeichert.
        </p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Neu laden
        </button>
        <p className="muted">
          Kommt der Fehler nach dem Neuladen wieder, hilft es meist, das laufende Training zu
          verwerfen (ungesendete, abgeschlossene Trainings bleiben erhalten).
        </p>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            browserStore().clearDraft();
            window.location.reload();
          }}
        >
          Laufendes Training verwerfen und neu laden
        </button>
      </main>
    );
  }
}
