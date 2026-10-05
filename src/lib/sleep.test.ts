import { describe, expect, it } from 'vitest';
import edgeCopy from '../../supabase/functions/recovery-import/sleep.ts?raw';
import source from './sleep.ts?raw';
import { groupSleepSessions, localDateOf, sleepMidpointMinutes, sleepNightForDate, sleepStageOf, startOfDayMs, type SleepSegment, type SleepStage } from './sleep';

const TZ = 120; // +02:00, wie in Deutschland im Oktober

/** Zeitstempel für "YYYY-MM-DD HH:MM" in +02:00. */
function at(s: string): number {
  return Date.parse(`${s.replace(' ', 'T')}:00+02:00`);
}

function seg(from: string, to: string, isWatch = true): SleepSegment {
  return { startMs: at(from), endMs: at(to), isWatch };
}

describe('localDateOf / startOfDayMs', () => {
  it('rechnet mit festem Offset, unabhängig von der Gerätezeitzone', () => {
    expect(localDateOf(at('2026-10-03 00:30'), TZ)).toBe('2026-10-03');
    expect(localDateOf(at('2026-10-02 23:59'), TZ)).toBe('2026-10-02');
    expect(startOfDayMs('2026-10-03', TZ)).toBe(at('2026-10-03 00:00'));
  });
});

describe('sleepNightForDate: Nacht statt Kalendertag', () => {
  // Regression: Schlaf "ab 0 Uhr" lieferte nur 6,5 h, obwohl um 23:00 eingeschlafen wurde.
  it('zählt den Teil vor Mitternacht mit und ordnet die Nacht dem Aufwachtag zu', () => {
    const night = sleepNightForDate(
      [seg('2026-10-02 23:00', '2026-10-03 03:00'), seg('2026-10-03 03:00', '2026-10-03 06:30')],
      '2026-10-03',
      TZ,
    );
    expect(night).not.toBeNull();
    expect(night!.hours).toBeCloseTo(7.5, 5);
    expect(night!.startMs).toBe(at('2026-10-02 23:00'));
    expect(night!.endMs).toBe(at('2026-10-03 06:30'));
  });

  it('ordnet dieselbe Nacht dem Vortag nicht zu', () => {
    const segments = [seg('2026-10-02 23:00', '2026-10-03 06:30')];
    expect(sleepNightForDate(segments, '2026-10-02', TZ)).toBeNull();
    expect(sleepNightForDate(segments, '2026-10-03', TZ)?.hours).toBeCloseTo(7.5, 5);
  });

  it('trennt zwei aufeinanderfolgende Nächte sauber', () => {
    const segments = [
      seg('2026-10-01 22:30', '2026-10-02 06:00'), // 7,5 h
      seg('2026-10-02 23:30', '2026-10-03 06:30'), // 7 h
    ];
    expect(sleepNightForDate(segments, '2026-10-02', TZ)?.hours).toBeCloseTo(7.5, 5);
    expect(sleepNightForDate(segments, '2026-10-03', TZ)?.hours).toBeCloseTo(7, 5);
  });

  it('findet auch Nächte, die erst nach Mitternacht beginnen', () => {
    const night = sleepNightForDate([seg('2026-10-03 01:15', '2026-10-03 08:15')], '2026-10-03', TZ);
    expect(night?.hours).toBeCloseTo(7, 5);
  });

  it('verbindet nächtliches Aufwachen bis 2 h und zählt die Wachzeit nicht mit', () => {
    const night = sleepNightForDate(
      [seg('2026-10-02 23:00', '2026-10-03 02:00'), seg('2026-10-03 02:45', '2026-10-03 06:45')],
      '2026-10-03',
      TZ,
    );
    expect(night!.hours).toBeCloseTo(7, 5); // 3 h + 4 h, 45 min wach nicht gezählt
    expect(night!.startMs).toBe(at('2026-10-02 23:00'));
    expect(night!.endMs).toBe(at('2026-10-03 06:45'));
  });

  it('wählt bei Nacht plus Nickerchen die längere Session (Hauptnacht)', () => {
    const night = sleepNightForDate(
      [seg('2026-10-02 23:00', '2026-10-03 06:30'), seg('2026-10-03 14:00', '2026-10-03 14:40')],
      '2026-10-03',
      TZ,
    );
    expect(night!.hours).toBeCloseTo(7.5, 5);
  });

  it('zählt überlappende Quellen nur einmal und bevorzugt die Watch', () => {
    const night = sleepNightForDate(
      [
        seg('2026-10-02 23:00', '2026-10-03 06:00', true),
        seg('2026-10-02 22:30', '2026-10-03 07:00', false), // iPhone-Schätzung, länger
      ],
      '2026-10-03',
      TZ,
    );
    expect(night!.hours).toBeCloseTo(7, 5);
  });

  it('verwendet andere Quellen, wenn keine Watch-Daten vorliegen', () => {
    const night = sleepNightForDate([seg('2026-10-02 23:00', '2026-10-03 06:00', false)], '2026-10-03', TZ);
    expect(night!.hours).toBeCloseTo(7, 5);
  });

  it('zählt innerhalb einer Quelle überlappende Phasen nicht doppelt', () => {
    const night = sleepNightForDate(
      [seg('2026-10-02 23:00', '2026-10-03 03:00'), seg('2026-10-03 02:00', '2026-10-03 06:00')],
      '2026-10-03',
      TZ,
    );
    expect(night!.hours).toBeCloseTo(7, 5);
  });

  it('liefert null ohne Daten oder bei weniger als 1 h Schlaf', () => {
    expect(sleepNightForDate([], '2026-10-03', TZ)).toBeNull();
    expect(sleepNightForDate([seg('2026-10-03 05:00', '2026-10-03 05:40')], '2026-10-03', TZ)).toBeNull();
  });

  it('verwirft Sessions über 16 h als unplausibel', () => {
    expect(sleepNightForDate([seg('2026-10-02 12:00', '2026-10-03 06:00')], '2026-10-03', TZ)).toBeNull();
  });
});

describe('sleepStageOf', () => {
  it('erkennt HealthKit- und Kurzbefehl-Namen, englisch und deutsch', () => {
    expect(sleepStageOf('HKCategoryValueSleepAnalysisAsleepDeep')).toBe('deep');
    expect(sleepStageOf('Tief')).toBe('deep');
    expect(sleepStageOf('HKCategoryValueSleepAnalysisAsleepREM')).toBe('rem');
    expect(sleepStageOf('REM')).toBe('rem');
    expect(sleepStageOf('HKCategoryValueSleepAnalysisAsleepCore')).toBe('core');
    expect(sleepStageOf('Kern')).toBe('core');
    expect(sleepStageOf('HKCategoryValueSleepAnalysisAsleepUnspecified')).toBe('other');
    expect(sleepStageOf('Schlaf (nicht spezifiziert)')).toBe('other');
  });
});

describe('Tief- und REM-Minuten der Nacht', () => {
  const st = (from: string, to: string, stage: SleepStage): SleepSegment => ({ ...seg(from, to), stage });
  it('summiert Tief und REM nur innerhalb der Nacht und zählt überlappende Abschnitte einmal', () => {
    const night = sleepNightForDate(
      [
        st('2026-10-04 23:00', '2026-10-05 00:30', 'core'),
        st('2026-10-05 00:30', '2026-10-05 01:30', 'deep'),
        st('2026-10-05 01:00', '2026-10-05 01:30', 'deep'), // doppelt gemeldet
        st('2026-10-05 01:30', '2026-10-05 02:00', 'rem'),
        st('2026-10-05 02:00', '2026-10-05 05:00', 'core'),
      ],
      '2026-10-05',
      TZ,
    );
    expect(night?.deepMin).toBe(60);
    expect(night?.remMin).toBe(30);
  });
  it('liefert null statt 0, wenn die Nacht keine Phasen enthält (nur Gesamtschlaf)', () => {
    const night = sleepNightForDate([seg('2026-10-04 23:00', '2026-10-05 06:00')], '2026-10-05', TZ);
    expect(night?.hours).toBe(7);
    expect(night?.deepMin).toBeNull();
    expect(night?.remMin).toBeNull();
  });
  it('0 Minuten, wenn Phasen vorliegen, aber keine Tief-/REM-Phase', () => {
    const night = sleepNightForDate([st('2026-10-04 23:00', '2026-10-05 06:00', 'core')], '2026-10-05', TZ);
    expect(night?.deepMin).toBe(0);
    expect(night?.remMin).toBe(0);
  });
});

describe('groupSleepSessions', () => {
  it('trennt bei Lücken über der Schwelle', () => {
    const sessions = groupSleepSessions([seg('2026-10-03 01:00', '2026-10-03 02:00'), seg('2026-10-03 05:30', '2026-10-03 07:00')]);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].asleepMs).toBe(90 * 60_000);
  });
});

describe('sleepMidpointMinutes', () => {
  it('liefert die Schlafmitte in Minuten seit Mitternacht des Aufwachtags', () => {
    const mid = sleepMidpointMinutes({ startMs: at('2026-10-02 23:00'), endMs: at('2026-10-03 07:00') }, TZ);
    expect(mid).toBe(180); // 03:00
  });
});

describe('Edge-Function-Kopie', () => {
  it('ist identisch mit src/lib/sleep.ts (die Funktion kann nicht aus src importieren)', () => {
    expect(edgeCopy).toBe(source);
  });
});
