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
  holdSeconds: number;
}

export interface CatalogPlanItem {
  stretchId: string;
  side: 'links' | 'rechts' | 'beidseitig';
  holdSeconds?: number;
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
  { id: id(1), name: 'Nackendehnung seitlich', muscles: ['neck'], holdSeconds: 20 },
  { id: id(2), name: 'Nackendehnung nach vorne', muscles: ['neck'], holdSeconds: 20 },
  { id: id(3), name: 'Trapezdehnung', muscles: ['traps'], holdSeconds: 20 },
  { id: id(4), name: 'Schulterdehnung über die Brust', muscles: ['shoulders'], holdSeconds: 20 },
  { id: id(5), name: 'Schulterdehnung hinter dem Rücken', muscles: ['shoulders'], holdSeconds: 20 },
  { id: id(6), name: 'Brustdehnung im Türrahmen', muscles: ['chest'], holdSeconds: 25 },
  { id: id(7), name: 'Trizepsdehnung über Kopf', muscles: ['triceps'], holdSeconds: 20 },
  { id: id(8), name: 'Bizepsdehnung an der Wand', muscles: ['biceps'], holdSeconds: 20 },
  { id: id(9), name: 'Unterarmdehnung (Handfläche)', muscles: ['forearms'], holdSeconds: 15 },
  { id: id(10), name: 'Latissimusdehnung seitlich', muscles: ['lats'], holdSeconds: 20 },
  { id: id(11), name: 'Oberer-Rücken-Dehnung (Katzenbuckel)', muscles: ['middle back'], holdSeconds: 25 },
  { id: id(12), name: 'Unterer-Rücken-Dehnung (Knie zur Brust)', muscles: ['lower back'], holdSeconds: 25 },
  { id: id(13), name: 'Bauchdehnung (Kobra)', muscles: ['abdominals'], holdSeconds: 20 },
  { id: id(14), name: 'Quadrizepsdehnung im Stehen', muscles: ['quadriceps'], holdSeconds: 30 },
  { id: id(15), name: 'Hüftbeugerdehnung im Ausfallschritt', muscles: ['quadriceps'], holdSeconds: 30 },
  { id: id(16), name: 'Beinbeugerdehnung im Sitzen', muscles: ['hamstrings'], holdSeconds: 30 },
  { id: id(17), name: 'Beinbeugerdehnung im Stehen', muscles: ['hamstrings'], holdSeconds: 30 },
  { id: id(18), name: 'Gesäßdehnung (Figure Four)', muscles: ['glutes'], holdSeconds: 30 },
  { id: id(19), name: 'Wadendehnung an der Wand (Knie gestreckt)', muscles: ['calves'], holdSeconds: 30 },
  { id: id(20), name: 'Wadendehnung an der Wand (Knie gebeugt)', muscles: ['calves'], holdSeconds: 30 },
  { id: id(21), name: 'Adduktorendehnung (Schmetterling)', muscles: ['adductors'], holdSeconds: 30 },
  { id: id(22), name: 'Adduktorendehnung im breiten Stand', muscles: ['adductors'], holdSeconds: 30 },
  { id: id(23), name: 'IT-Band-Dehnung im Überkreuzstand', muscles: ['abductors'], holdSeconds: 25 },

  // Mobility-Flow (Vierfüßlerstand-Kette bis Boden-Kette, Dosierung statt Haltezeit in Wiederholungen)
  { id: id(24), name: 'Foam-Roller-Extension (Brustwirbelsäule) – 8–10 Wdh.', muscles: ['middle back'], holdSeconds: 60 },
  { id: id(25), name: 'Thoracic Rotation im Vierfüßlerstand – 8 je Seite', muscles: ['middle back'], holdSeconds: 60 },
  { id: id(26), name: 'Cat-Cow (Katze-Kuh) im Vierfüßlerstand – 8–10 Wdh.', muscles: ['lower back', 'middle back'], holdSeconds: 60 },
  { id: id(27), name: 'Armkreisen groß (vorwärts/rückwärts) – 10–12 Wdh.', muscles: ['shoulders'], holdSeconds: 60 },
  { id: id(28), name: 'Hüftbeuger im Halbkniestand', muscles: ['quadriceps'], holdSeconds: 45 },
  { id: id(29), name: '90/90-Hip-Rotation – 8 Wechsel, langsam', muscles: ['glutes'], holdSeconds: 90 },
  { id: id(30), name: 'Deep Squat Hold', muscles: ['quadriceps', 'glutes'], holdSeconds: 60 },
  { id: id(31), name: 'Adduktoren: Frog Stretch', muscles: ['adductors'], holdSeconds: 60 },
  { id: id(32), name: 'Knee-to-Wall – 10 Wdh. je Seite', muscles: ['calves'], holdSeconds: 90 },
  { id: id(33), name: 'Wadendehnung im Ausfallschritt', muscles: ['calves'], holdSeconds: 45 },
  { id: id(34), name: 'Hamstring-PNF im Liegen mit Band (60 s je Bein)', muscles: ['hamstrings'], holdSeconds: 60 },
];

function item(n: number, side: CatalogPlanItem['side'] = 'beidseitig'): CatalogPlanItem {
  return { stretchId: id(n), side };
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
