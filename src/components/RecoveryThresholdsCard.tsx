import { useState } from 'react';
import { applyThresholdChange, DEFAULT_RECOVERY_THRESHOLDS, type RecoveryThresholds } from '../lib/recoveryAnalysis';
import { MetricField } from './ui';

interface Props {
  value: RecoveryThresholds;
  onChange: (t: RecoveryThresholds) => void;
}

const dec = (n: number): string => String(n).replace('.', ',');

/**
 * Eigene Schwellen für Schlaf und gefühlte Erholung. Die Voreinstellungen sind eigene Setzungen der
 * App, keine Studienwerte (Walsh et al. 2021 rät beim Schlaf zu individuellem Bedarf). Eingaben, die
 * sich widersprechen (z. B. Minimum über dem Ziel), werden nicht übernommen; die anderen Werte
 * bleiben unverändert. Die Werte gelten nur auf diesem Gerät.
 */
export function RecoveryThresholdsCard({ value, onChange }: Props) {
  // Die Zahlenfelder halten ihren Text selbst; nach dem Zurücksetzen mit neuem Key neu aufbauen.
  const [resetKey, setResetKey] = useState(0);
  const isDefault = (Object.keys(DEFAULT_RECOVERY_THRESHOLDS) as (keyof RecoveryThresholds)[]).every(
    (k) => value[k] === DEFAULT_RECOVERY_THRESHOLDS[k],
  );

  function set(field: keyof RecoveryThresholds, n: number | null) {
    if (n === null) return;
    const next = applyThresholdChange(value, field, n);
    if (next) onChange(next);
  }

  return (
    <details className="equipment">
      <summary>Eigene Schwellen{isDefault ? '' : ' (angepasst)'}</summary>
      <p className="muted newex-hint">
        Die Voreinstellungen sind eigene Setzungen der App und keine Studienwerte. Beim Schlaf rät der Expertenkonsens
        (Walsh et al. 2021) zu einem individuellen Bedarf statt eines pauschalen Ziels; als Marker für unzureichenden
        Schlaf nennt er habituell unter 7 Stunden. Ändere Werte nicht ständig: Nur was einige Wochen gleich bleibt, lässt
        sich später auswerten. Die Werte gelten nur auf diesem Gerät.
      </p>
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Schlaf (Stunden)
      </h3>
      <MetricField key={`sleepTargetHours-${resetKey}`} label="Schlafziel (für die Schlafschuld)" unit="h" step={0.5} value={value.sleepTargetHours} onChange={(n) => set('sleepTargetHours', n)} />
      <MetricField key={`sleepMinHours-${resetKey}`} label="Einzelnacht unter … = beobachten" unit="h" step={0.5} value={value.sleepMinHours} onChange={(n) => set('sleepMinHours', n)} />
      <MetricField key={`sleepLowHours-${resetKey}`} label="Einzelnacht unter … = auffällig" unit="h" step={0.5} value={value.sleepLowHours} onChange={(n) => set('sleepLowHours', n)} />
      <h3 className="section-title">Gefühlte Erholung (0–10)</h3>
      <MetricField key={`prsWatch-${resetKey}`} label="Unter … = beobachten" unit="/10" step={1} value={value.prsWatch} onChange={(n) => set('prsWatch', n)} />
      <MetricField key={`prsLow-${resetKey}`} label="Unter … = auffällig" unit="/10" step={1} value={value.prsLow} onChange={(n) => set('prsLow', n)} />
      <p className="muted newex-hint">
        Gilt zusätzlich zu deinem eigenen Verlauf: Auch wenn der Wert über der Grenze liegt, wird ein deutlicher Abfall
        gegenüber deinem Schnitt markiert. Aktuell: Schlafziel {dec(value.sleepTargetHours)} h, beobachten unter{' '}
        {dec(value.sleepMinHours)} h, auffällig unter {dec(value.sleepLowHours)} h.
      </p>
      {!isDefault && (
        <button type="button" className="btn compact" onClick={() => {
            onChange(DEFAULT_RECOVERY_THRESHOLDS);
            setResetKey((k) => k + 1);
          }}>
          Auf Voreinstellung zurücksetzen
        </button>
      )}
    </details>
  );
}
