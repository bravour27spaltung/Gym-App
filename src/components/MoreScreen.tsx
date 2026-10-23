import { THEMES, type ThemeId } from '../lib/theme';
import { Icon, type IconName } from './ui';

type Area = 'stretch' | 'football' | 'recovery';

interface Props {
  email: string;
  theme: ThemeId;
  onTheme: (id: ThemeId) => void;
  onOpen: (area: Area) => void;
  onSignOut: () => void;
  onReset: () => void;
}

const AREAS: { key: Area; title: string; sub: string; icon: IconName }[] = [
  { key: 'stretch', title: 'Stretching', sub: 'Dehnprogramme mit Haltezeit', icon: 'flame' },
  { key: 'football', title: 'Fußball', sub: 'Dauer, Belastung und Watch-Import', icon: 'football' },
  { key: 'recovery', title: 'Recovery', sub: 'Schlaf, HRV und Ruhepuls', icon: 'heart' },
];

/** Selten gebrauchte Bereiche, Darstellung (Farbschema) und Konto an einem Ort. */
export function MoreScreen({ email, theme, onTheme, onOpen, onSignOut, onReset }: Props) {
  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Mehr</h1>
      </header>

      <ul className="tiles more-areas">
        {AREAS.map((a) => (
          <li key={a.key}>
            <button type="button" className="tile" onClick={() => onOpen(a.key)}>
              <span className={`tile-ico ico-${a.key}`}>
                <Icon name={a.icon} size={22} />
              </span>
              <span className="tile-title">
                <strong>{a.title}</strong>
                <small>{a.sub}</small>
              </span>
              <Icon name="forward" size={18} />
            </button>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Farbschema</h2>
      <div className="theme-grid" role="radiogroup" aria-label="Farbschema">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            className={theme === t.id ? 'theme-opt on' : 'theme-opt'}
            onClick={() => onTheme(t.id)}
          >
            <span className="theme-swatch" aria-hidden="true" style={{ background: t.base }}>
              <span style={{ background: t.bright }} />
            </span>
            <strong>{t.name}</strong>
            <small>{t.hint}</small>
          </button>
        ))}
      </div>

      <p className="muted footnote">
        Angemeldet als {email} ·{' '}
        <button type="button" className="link" onClick={onSignOut}>
          Abmelden
        </button>
      </p>
      <p className="muted footnote footnote-danger">
        <button type="button" className="link danger" onClick={onReset}>
          Testdaten zurücksetzen
        </button>
      </p>
    </div>
  );
}
