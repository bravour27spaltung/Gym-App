import { describe, expect, it } from 'vitest';
import { MUSCLES } from './muscles';
import { STRETCH_CATALOG, STRETCH_PLAN_CATALOG, catalogPlanDose } from './stretchCatalog';

const MUSCLE_KEYS = new Set<string>(MUSCLES.map((m) => m.key));

describe('STRETCH_CATALOG', () => {
  it('hat eindeutige IDs', () => {
    const ids = STRETCH_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('verwendet nur gültige Muskel-Schlüssel', () => {
    for (const s of STRETCH_CATALOG) {
      for (const m of s.muscles) {
        expect(MUSCLE_KEYS.has(m)).toBe(true);
      }
    }
  });

  it('hat je Übung genau eine Standardmenge: Haltezeit (Timer) oder Wiederholungen', () => {
    for (const s of STRETCH_CATALOG) {
      const hold = s.holdSeconds ?? 0;
      const reps = s.reps ?? 0;
      expect(hold > 0 !== reps > 0).toBe(true);
    }
  });

  it('nennt Wiederholungen nicht mehr im Namen (eigenes Feld)', () => {
    for (const s of STRETCH_CATALOG) {
      expect(s.name).not.toMatch(/Wdh/);
    }
  });

  it('hat zu jeder Übung eine Anleitung aus 2 bis 4 nicht leeren Schritten', () => {
    for (const s of STRETCH_CATALOG) {
      expect(s.instructions.length, s.name).toBeGreaterThanOrEqual(2);
      expect(s.instructions.length, s.name).toBeLessThanOrEqual(4);
      for (const step of s.instructions) {
        expect(step.trim(), s.name).not.toBe('');
        expect(step, s.name).toBe(step.trim());
        expect(step, s.name).toMatch(/[.!?]$/);
      }
    }
  });

  it('deckt jeden Muskelschlüssel mit mindestens einer Dehnübung ab', () => {
    const used = new Set(STRETCH_CATALOG.flatMap((s) => s.muscles));
    for (const m of MUSCLES) expect(used.has(m.key), m.key).toBe(true);
  });

  it('führt Hüftbeuger-Dehnungen unter dem Hüftbeuger, nicht unter dem Quadrizeps', () => {
    for (const s of STRETCH_CATALOG.filter((x) => /Hüftbeuger/.test(x.name))) {
      expect(s.muscles).toContain('hip flexors');
      expect(s.muscles).not.toContain('quadriceps');
    }
  });
});

describe('STRETCH_PLAN_CATALOG', () => {
  const catalogIds = new Set(STRETCH_CATALOG.map((s) => s.id));

  it('hat eindeutige Plan-IDs', () => {
    const ids = STRETCH_PLAN_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('verweist nur auf Übungen aus dem Katalog', () => {
    for (const p of STRETCH_PLAN_CATALOG) {
      expect(p.items.length).toBeGreaterThan(0);
      for (const it of p.items) {
        expect(catalogIds.has(it.stretchId)).toBe(true);
      }
    }
  });

  it('lässt Vorlagen-Einträge mit Wiederholungen ohne Haltezeit und umgekehrt', () => {
    for (const p of STRETCH_PLAN_CATALOG) {
      for (const it of p.items) {
        const ex = STRETCH_CATALOG.find((s) => s.id === it.stretchId)!;
        expect(it.side).toBe(ex.side);
        if (ex.reps != null) expect(it.holdSeconds).toBeUndefined();
      }
    }
  });

  it('teilt keine Plan-IDs mit den Übungs-IDs', () => {
    for (const p of STRETCH_PLAN_CATALOG) {
      expect(catalogIds.has(p.id)).toBe(false);
    }
  });
});

describe('Oberkörper- und Unterkörper-Vorlagen', () => {
  // Der untere Rücken ist Rumpf und gehört zu keiner Seite eindeutig; geprüft wird deshalb,
  // dass keine Muskeln der jeweils anderen Körperhälfte vorkommen.
  const UPPER = new Set(['neck', 'traps', 'shoulders', 'chest', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'abdominals']);
  const LOWER = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'hip flexors', 'shins', 'feet']);
  const byName = (name: string) => STRETCH_PLAN_CATALOG.find((p) => p.name === name)!;
  const musclesOf = (planName: string) =>
    byName(planName).items.flatMap((it) => STRETCH_CATALOG.find((s) => s.id === it.stretchId)!.muscles);

  it('gibt es beide Vorlagen genau einmal', () => {
    expect(STRETCH_PLAN_CATALOG.filter((p) => p.name === 'Oberkörper-Dehnung')).toHaveLength(1);
    expect(STRETCH_PLAN_CATALOG.filter((p) => p.name === 'Unterkörper-Dehnung')).toHaveLength(1);
  });

  it('Oberkörper-Dehnung enthält keine Beinmuskeln und deckt Nacken bis Rumpf ab', () => {
    const muscles = musclesOf('Oberkörper-Dehnung');
    for (const m of muscles) expect(LOWER.has(m)).toBe(false);
    for (const m of ['neck', 'shoulders', 'chest', 'triceps', 'biceps', 'forearms', 'lats']) {
      expect(muscles).toContain(m);
    }
  });

  it('Unterkörper-Dehnung enthält keine Arm-/Schulter-/Brustmuskeln und deckt die großen Gruppen ab', () => {
    const muscles = musclesOf('Unterkörper-Dehnung');
    for (const m of muscles) expect(UPPER.has(m)).toBe(false);
    for (const m of ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'hip flexors']) {
      expect(muscles).toContain(m);
    }
  });

  it('wiederholt keine Übung innerhalb einer Vorlage', () => {
    for (const name of ['Oberkörper-Dehnung', 'Unterkörper-Dehnung']) {
      const ids = byName(name).items.map((it) => it.stretchId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('hält Haltezeiten unter 60 s je Übung (Behm et al. 2016)', () => {
    for (const name of ['Oberkörper-Dehnung', 'Unterkörper-Dehnung']) {
      for (const it of byName(name).items) {
        const ex = STRETCH_CATALOG.find((s) => s.id === it.stretchId)!;
        const hold = it.holdSeconds ?? ex.holdSeconds;
        if (hold != null) expect(hold).toBeLessThan(60);
      }
    }
  });
});

describe('Dosierung der Oberkörper- und Unterkörper-Vorlagen', () => {
  // Ingram et al. 2024 (Sports Med): kein zusätzlicher Nutzen über 4 min je Muskelgruppe und Einheit.
  const MAX_SECONDS_PER_MUSCLE = 240;
  // Kernmuskeln sollen pro Einheit mindestens 1,5 min bekommen, sonst reichen auch 5 Einheiten
  // pro Woche nicht an ca. 7 min je Muskelgruppe heran.
  const MIN_SECONDS_CORE = 90;
  const CORE: Record<string, string[]> = {
    'Oberkörper-Dehnung': ['neck', 'traps', 'shoulders', 'chest', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'abdominals'],
    'Unterkörper-Dehnung': ['lower back', 'glutes', 'hip flexors', 'quadriceps', 'hamstrings', 'adductors', 'abductors', 'calves'],
  };
  const byName = (name: string) => STRETCH_PLAN_CATALOG.find((p) => p.name === name)!;

  it('überschreitet pro Muskelgruppe nie 4 min je Einheit', () => {
    for (const name of Object.keys(CORE)) {
      const { perMuscleSeconds } = catalogPlanDose(byName(name));
      for (const [m, sec] of Object.entries(perMuscleSeconds)) {
        expect(sec, `${name}: ${m}`).toBeLessThanOrEqual(MAX_SECONDS_PER_MUSCLE);
      }
    }
  });

  it('gibt jeder Kernmuskelgruppe mindestens 1,5 min je Einheit', () => {
    for (const [name, core] of Object.entries(CORE)) {
      const { perMuscleSeconds } = catalogPlanDose(byName(name));
      for (const m of core) {
        expect(perMuscleSeconds[m] ?? 0, `${name}: ${m}`).toBeGreaterThanOrEqual(MIN_SECONDS_CORE);
      }
    }
  });

  it('setzt Haltezeit und Satzzahl explizit und hält jede Haltezeit zwischen 30 und 45 s', () => {
    for (const name of Object.keys(CORE)) {
      for (const it of byName(name).items) {
        expect(it.holdSeconds, name).toBeDefined();
        expect(it.sets, name).toBeGreaterThanOrEqual(1);
        expect(it.sets, name).toBeLessThanOrEqual(2);
        expect(it.holdSeconds!, name).toBeGreaterThanOrEqual(30);
        expect(it.holdSeconds!, name).toBeLessThanOrEqual(45);
      }
    }
  });

  it('bleibt je Vorlage unter 25 min reiner Haltezeit', () => {
    for (const name of Object.keys(CORE)) {
      expect(catalogPlanDose(byName(name)).totalSeconds, name).toBeLessThanOrEqual(25 * 60);
    }
  });

  it('rechnet beidseitige Übungen doppelt und Wiederholungs-Übungen gar nicht', () => {
    const hold = STRETCH_CATALOG.find((x) => x.holdSeconds != null && x.side === 'beidseitig')!;
    const reps = STRETCH_CATALOG.find((x) => x.reps != null)!;
    const dose = catalogPlanDose({
      id: 'x',
      name: 'x',
      items: [
        { stretchId: hold.id, side: 'beidseitig', holdSeconds: 30, sets: 2 },
        { stretchId: reps.id, side: reps.side },
      ],
    });
    expect(dose.totalSeconds).toBe(30 * 2 * 2);
  });
});
