/**
 * Mitgelieferter Katalog häufiger Dehnübungen plus fertiger Routinen ("Vorlagen").
 * Fest vergebene IDs (keine zufälligen), damit ein erneuter Import dieselben Zeilen
 * trifft (Upsert) statt sie zu verdoppeln. Die Muskel-Schlüssel entsprechen denen aus
 * muscles.ts, wie beim Kraft-Übungskatalog.
 */

export interface CatalogStretch {
  id: string;
  name: string;
  muscles: string[];
  /** Standard-Haltezeit (Timer); bei Wiederholungs-Übungen nicht gesetzt. */
  holdSeconds?: number;
  /** Standard-Wiederholungen; gesetzt = Übung ohne Timer. */
  reps?: number;
  /**
   * 'beidseitig' = beide Seiten nacheinander (je Seite ein eigener Durchgang),
   * 'mittig' = symmetrische Übung ohne Seite (ein Durchgang).
   */
  side: 'beidseitig' | 'mittig';
}

export interface CatalogPlanItem {
  stretchId: string;
  side: 'links' | 'rechts' | 'beidseitig' | 'mittig';
  holdSeconds?: number;
  reps?: number;
  sets?: number;
}

export interface CatalogPlan {
  id: string;
  name: string;
  items: CatalogPlanItem[];
}

function id(n: number): string {
  return `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function planId(n: number): string {
  return `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const STRETCH_CATALOG: CatalogStretch[] = [
  { id: id(1), name: 'Nackendehnung seitlich', muscles: ['neck'], holdSeconds: 20, side: 'beidseitig' },
  { id: id(2), name: 'Nackendehnung nach vorne', muscles: ['neck'], holdSeconds: 20, side: 'mittig' },
  { id: id(3), name: 'Trapezdehnung', muscles: ['traps'], holdSeconds: 20, side: 'beidseitig' },
  { id: id(4), name: 'Schulterdehnung über die Brust', muscles: ['shoulders'], holdSeconds: 20, side: 'beidseitig' },
  { id: id(5), name: 'Schulterdehnung hinter dem Rücken', muscles: ['shoulders'], holdSeconds: 20, side: 'mittig' },
  { id: id(6), name: 'Brustdehnung im Türrahmen', muscles: ['chest'], holdSeconds: 25, side: 'beidseitig' },
  { id: id(7), name: 'Trizepsdehnung über Kopf', muscles: ['triceps'], holdSeconds: 20, side: 'beidseitig' },
  { id: id(8), name: 'Bizepsdehnung an der Wand', muscles: ['biceps'], holdSeconds: 20, side: 'beidseitig' },
  { id: id(9), name: 'Unterarmdehnung (Handfläche)', muscles: ['forearms'], holdSeconds: 15, side: 'beidseitig' },
  { id: id(10), name: 'Latissimusdehnung seitlich', muscles: ['lats'], holdSeconds: 20, side: 'beidseitig' },
  { id: id(11), name: 'Oberer-Rücken-Dehnung (Katzenbuckel)', muscles: ['middle back'], holdSeconds: 25, side: 'mittig' },
  { id: id(12), name: 'Unterer-Rücken-Dehnung (Knie zur Brust)', muscles: ['lower back'], holdSeconds: 25, side: 'mittig' },
  { id: id(13), name: 'Bauchdehnung (Kobra)', muscles: ['abdominals'], holdSeconds: 20, side: 'mittig' },
  { id: id(14), name: 'Quadrizepsdehnung im Stehen', muscles: ['quadriceps'], holdSeconds: 30, side: 'beidseitig' },
  { id: id(15), name: 'Hüftbeugerdehnung im Ausfallschritt', muscles: ['quadriceps'], holdSeconds: 30, side: 'beidseitig' },
  { id: id(16), name: 'Beinbeugerdehnung im Sitzen', muscles: ['hamstrings'], holdSeconds: 30, side: 'beidseitig' },
  { id: id(17), name: 'Beinbeugerdehnung im Stehen', muscles: ['hamstrings'], holdSeconds: 30, side: 'beidseitig' },
  { id: id(18), name: 'Gesäßdehnung (Figure Four)', muscles: ['glutes'], holdSeconds: 30, side: 'beidseitig' },
  { id: id(19), name: 'Wadendehnung an der Wand (Knie gestreckt)', muscles: ['calves'], holdSeconds: 30, side: 'beidseitig' },
  { id: id(20), name: 'Wadendehnung an der Wand (Knie gebeugt)', muscles: ['calves'], holdSeconds: 30, side: 'beidseitig' },
  { id: id(21), name: 'Adduktorendehnung (Schmetterling)', muscles: ['adductors'], holdSeconds: 30, side: 'mittig' },
  { id: id(22), name: 'Adduktorendehnung im breiten Stand', muscles: ['adductors'], holdSeconds: 30, side: 'mittig' },
  { id: id(23), name: 'IT-Band-Dehnung im Überkreuzstand', muscles: ['abductors'], holdSeconds: 25, side: 'beidseitig' },

  // Mobility-Flow: Wiederholungs-Übungen laufen ohne Timer (nur "Abgeschlossen"),
  // einseitige Übungen bekommen je Seite einen eigenen Durchgang.
  { id: id(24), name: 'Foam-Roller-Extension (Brustwirbelsäule)', muscles: ['middle back'], reps: 10, side: 'mittig' },
  { id: id(25), name: 'Thoracic Rotation im Vierfüßlerstand', muscles: ['middle back'], reps: 8, side: 'beidseitig' },
  { id: id(26), name: 'Cat-Cow (Katze-Kuh) im Vierfüßlerstand', muscles: ['lower back', 'middle back'], reps: 10, side: 'mittig' },
  { id: id(27), name: 'Armkreisen groß (vorwärts/rückwärts)', muscles: ['shoulders'], reps: 12, side: 'mittig' },
  { id: id(28), name: 'Hüftbeuger im Halbkniestand', muscles: ['quadriceps'], holdSeconds: 45, side: 'beidseitig' },
  { id: id(29), name: '90/90-Hip-Rotation (Seitenwechsel, langsam)', muscles: ['glutes'], reps: 8, side: 'mittig' },
  { id: id(30), name: 'Deep Squat Hold', muscles: ['quadriceps', 'glutes'], holdSeconds: 60, side: 'mittig' },
  { id: id(31), name: 'Adduktoren: Frog Stretch', muscles: ['adductors'], holdSeconds: 60, side: 'mittig' },
  { id: id(32), name: 'Knee-to-Wall', muscles: ['calves'], reps: 10, side: 'beidseitig' },
  { id: id(33), name: 'Wadendehnung im Ausfallschritt', muscles: ['calves'], holdSeconds: 45, side: 'beidseitig' },
  { id: id(34), name: 'Hamstring-PNF im Liegen mit Band', muscles: ['hamstrings'], holdSeconds: 60, side: 'beidseitig' },
];

function item(n: number): CatalogPlanItem {
  const x = STRETCH_CATALOG.find((s) => s.id === id(n));
  if (!x) throw new Error(`Dehnübung ${n} fehlt im Katalog`);
  return { stretchId: x.id, side: x.side };
}

export const STRETCH_PLAN_CATALOG: CatalogPlan[] = [
  {
    id: planId(1),
    name: 'Ganzkörper-Dehnung',
    items: [
      item(1), item(3), item(4), item(6), item(10), item(11), item(12),
      item(14), item(16), item(18), item(19), item(21),
    ],
  },
  {
    id: planId(2),
    name: 'Nach dem Oberkörpertraining',
    items: [item(4), item(5), item(6), item(7), item(8), item(9), item(10), item(11), item(3)],
  },
  {
    id: planId(3),
    name: 'Nach dem Beintraining',
    items: [
      item(14), item(15), item(16), item(17), item(18),
      item(19), item(20), item(21), item(22), item(23),
    ],
  },
  {
    id: planId(4),
    name: 'Fußball-Cooldown',
    items: [item(15), item(16), item(19), item(20), item(21), item(18), item(23), item(12)],
  },
  {
    id: planId(5),
    name: 'Mobility-Flow (15 Min)',
    items: [
      item(24), item(25), item(26), item(27),
      { stretchId: id(6), side: 'beidseitig', holdSeconds: 40 },
      item(28), item(29), item(30), item(31), item(32), item(33), item(34),
    ],
  },
];
