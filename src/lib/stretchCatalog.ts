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
  /**
   * Ausführung in kurzen Schritten (Startposition, Bewegung, wo der Zug sitzt). Wird beim
   * Katalog-Import in fit_stretch_exercises.instructions_de gespeichert.
   */
  instructions: string[];
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
  {
    id: id(1),
    name: 'Nackendehnung seitlich', muscles: ['neck'], holdSeconds: 20, side: 'beidseitig',
    instructions: [
      'Aufrecht sitzen oder stehen, die Schultern bewusst nach unten sinken lassen.',
      'Ein Ohr zur gleichen Schulter neigen, der Blick bleibt geradeaus; der Arm der Seite hängt locker.',
      'Nur das Gewicht des Kopfes wirken lassen, nicht mit der Hand ziehen. Der Zug liegt seitlich am Hals.',
    ],
  },
  {
    id: id(2),
    name: 'Nackendehnung nach vorne', muscles: ['neck'], holdSeconds: 20, side: 'mittig',
    instructions: [
      'Aufrecht sitzen oder stehen, Schultern locker.',
      'Das Kinn langsam Richtung Brust sinken lassen; die Hände dürfen locker am Hinterkopf liegen, ohne zu ziehen.',
      'Der Zug liegt hinten am Nacken, der Rücken bleibt gerade.',
    ],
  },
  {
    id: id(3),
    name: 'Trapezdehnung', muscles: ['traps'], holdSeconds: 20, side: 'beidseitig',
    instructions: [
      'Aufrecht sitzen und mit der Hand der zu dehnenden Seite die Sitzfläche seitlich greifen, damit die Schulter unten bleibt.',
      'Die andere Hand über den Kopf legen und den Kopf zur Gegenseite neigen (Ohr Richtung gegenüberliegende Schulter).',
      'Der Zug liegt oben zwischen Hals und Schulter; der Rumpf kippt nicht mit.',
    ],
  },
  {
    id: id(4),
    name: 'Schulterdehnung über die Brust', muscles: ['shoulders'], holdSeconds: 20, side: 'beidseitig',
    instructions: [
      'Aufrecht stehen und einen Arm gestreckt in Schulterhöhe quer vor die Brust führen.',
      'Mit dem anderen Unterarm den Arm oberhalb des Ellbogens näher zur Brust ziehen (nicht am Gelenk).',
      'Schulter unten lassen, den Oberkörper nicht mitdrehen. Der Zug liegt hinten an der Schulter.',
    ],
  },
  {
    id: id(5),
    name: 'Schulterdehnung hinter dem Rücken', muscles: ['shoulders'], holdSeconds: 20, side: 'mittig',
    instructions: [
      'Aufrecht stehen und die Hände hinter dem Rücken verschränken (oder ein Handtuch halten).',
      'Die Arme strecken und die Hände leicht nach hinten oben führen, das Brustbein heben.',
      'Rippen unten lassen, kein Hohlkreuz. Der Zug liegt vorne an Schultern und Brust.',
    ],
  },
  {
    id: id(6),
    name: 'Brustdehnung im Türrahmen', muscles: ['chest'], holdSeconds: 25, side: 'beidseitig',
    instructions: [
      'Den Unterarm am Türrahmen anlegen, der Ellbogen etwa auf Schulterhöhe und um 90° gebeugt.',
      'Mit dem Bein der gleichen Seite einen kleinen Schritt nach vorn gehen und den Oberkörper leicht von der Hand wegdrehen.',
      'Der Zug liegt vorne an Brust und Schulter. Mit etwas höherem oder tieferem Ellbogen verlagert sich der Zug.',
    ],
  },
  {
    id: id(7),
    name: 'Trizepsdehnung über Kopf', muscles: ['triceps'], holdSeconds: 20, side: 'beidseitig',
    instructions: [
      'Einen Arm anheben, den Ellbogen beugen, die Hand liegt zwischen den Schulterblättern.',
      'Mit der anderen Hand den Ellbogen sanft nach hinten oben drücken.',
      'Rippen unten lassen, kein Hohlkreuz. Der Zug liegt an der Rückseite des Oberarms.',
    ],
  },
  {
    id: id(8),
    name: 'Bizepsdehnung an der Wand', muscles: ['biceps'], holdSeconds: 20, side: 'beidseitig',
    instructions: [
      'Seitlich zur Wand stehen, die Hand flach in Schulterhöhe an die Wand legen, die Finger zeigen nach hinten, der Arm bleibt gestreckt.',
      'Den Oberkörper langsam von der Wand wegdrehen, bis ein Zug an der Vorderseite von Oberarm und Schulter entsteht.',
      'Die Schulter bleibt unten.',
    ],
  },
  {
    id: id(9),
    name: 'Unterarmdehnung (Handfläche)', muscles: ['forearms'], holdSeconds: 15, side: 'beidseitig',
    instructions: [
      'Den Arm gestreckt nach vorn führen, die Handfläche zeigt nach oben.',
      'Mit der anderen Hand die Finger Richtung Boden und zum Körper ziehen.',
      'Der Zug liegt an der Innenseite des Unterarms; der Ellbogen bleibt gestreckt.',
    ],
  },
  {
    id: id(10),
    name: 'Latissimusdehnung seitlich', muscles: ['lats'], holdSeconds: 20, side: 'beidseitig',
    instructions: [
      'Aufrecht stehen, einen Arm über den Kopf strecken und mit der anderen Hand das Handgelenk greifen.',
      'Den Oberkörper zur Gegenseite neigen, das Becken bleibt mittig, der Blick geht nach vorn.',
      'Der Zug liegt seitlich am Rumpf bis zur Achsel; ruhig ausatmen.',
    ],
  },
  {
    id: id(11),
    name: 'Oberer-Rücken-Dehnung (Katzenbuckel)', muscles: ['middle back'], holdSeconds: 25, side: 'mittig',
    instructions: [
      'Aufrecht stehen oder sitzen, die Hände vor dem Körper verschränken und die Arme nach vorn strecken.',
      'Die Handflächen nach vorn schieben, den oberen Rücken runden, das Kinn Richtung Brust.',
      'Der Zug liegt zwischen den Schulterblättern.',
    ],
  },
  {
    id: id(12),
    name: 'Unterer-Rücken-Dehnung (Knie zur Brust)', muscles: ['lower back'], holdSeconds: 25, side: 'mittig',
    instructions: [
      'In Rückenlage beide Knie zur Brust ziehen, die Hände umfassen die Schienbeine.',
      'Kopf und Schultern bleiben entspannt am Boden, das Becken rollt leicht nach oben.',
      'Der Zug liegt im unteren Rücken. Ruhig weiteratmen.',
    ],
  },
  {
    id: id(13),
    name: 'Bauchdehnung (Kobra)', muscles: ['abdominals'], holdSeconds: 20, side: 'mittig',
    instructions: [
      'In Bauchlage die Hände unter die Schultern legen, die Beine liegen entspannt.',
      'Mit den Armen den Oberkörper nur so weit aufrichten, dass das Becken am Boden bleibt; die Schultern wandern von den Ohren weg.',
      'Der Zug liegt an der Bauchvorderseite. Wird es im unteren Rücken stechend, niedriger bleiben.',
    ],
  },
  {
    id: id(14),
    name: 'Quadrizepsdehnung im Stehen', muscles: ['quadriceps'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'Aufrecht stehen, mit einer Hand Halt suchen. Die Ferse zum Gesäß ziehen und den Knöchel greifen.',
      'Die Knie bleiben nebeneinander; das Becken leicht nach vorn kippen (Gesäß anspannen), kein Hohlkreuz.',
      'Der Zug liegt an der Oberschenkelvorderseite.',
    ],
  },
  {
    id: id(15),
    name: 'Hüftbeugerdehnung im Ausfallschritt', muscles: ['hip flexors'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'Großer Schritt nach vorn, das hintere Knie auf eine weiche Unterlage setzen.',
      'Das Becken aufrichten (Steißbein Richtung Boden, Gesäß des hinteren Beins anspannen) und das Gewicht leicht nach vorn verlagern.',
      'Der Oberkörper bleibt aufrecht. Der Zug liegt vorne an der Hüfte des hinteren Beins; für mehr Zug den Arm dieser Seite über den Kopf strecken.',
    ],
  },
  {
    id: id(16),
    name: 'Beinbeugerdehnung im Sitzen', muscles: ['hamstrings'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'Aufrecht auf dem Boden sitzen, ein Bein gestreckt (Ferse am Boden, Zehen zeigen nach oben), das andere Bein angewinkelt.',
      'Aus der Hüfte mit geradem Rücken nach vorn neigen, die Hände wandern am Bein Richtung Fuß.',
      'Der Zug liegt an der Rückseite des Oberschenkels; den Rücken nicht runden.',
    ],
  },
  {
    id: id(17),
    name: 'Beinbeugerdehnung im Stehen', muscles: ['hamstrings'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'Eine Ferse auf eine niedrige Erhöhung (Treppenstufe, Bank) stellen, das Bein bleibt gestreckt, die Zehen zeigen nach oben.',
      'Aus der Hüfte mit geradem Rücken nach vorn neigen.',
      'Der Zug liegt an der Rückseite des Oberschenkels; das Standbein darf leicht gebeugt bleiben.',
    ],
  },
  {
    id: id(18),
    name: 'Gesäßdehnung (Figure Four)', muscles: ['glutes'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'In Rückenlage ein Bein anwinkeln und den Knöchel des anderen Beins quer über das Knie legen (Vierer-Form).',
      'Die Hände hinter dem stehenden Oberschenkel verschränken und das Bein zur Brust ziehen.',
      'Der Zug liegt im Gesäß des überkreuzten Beins. Der Kopf bleibt am Boden, das überkreuzte Knie sinkt nach außen.',
    ],
  },
  {
    id: id(19),
    name: 'Wadendehnung an der Wand (Knie gestreckt)', muscles: ['calves'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'Mit beiden Händen an der Wand abstützen und ein Bein weit nach hinten stellen.',
      'Das hintere Bein bleibt gestreckt, die Ferse am Boden, die Zehen zeigen nach vorn.',
      'Das Becken Richtung Wand schieben, bis ein Zug in der oberen Wade entsteht.',
    ],
  },
  {
    id: id(20),
    name: 'Wadendehnung an der Wand (Knie gebeugt)', muscles: ['calves'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'Wie bei der gestreckten Variante an der Wand stehen, das hintere Knie aber leicht beugen.',
      'Die Ferse bleibt am Boden, das Becken sinkt nach unten.',
      'Der Zug liegt tiefer in der Wade oberhalb der Achillessehne (Soleus).',
    ],
  },
  {
    id: id(21),
    name: 'Adduktorendehnung (Schmetterling)', muscles: ['adductors'], holdSeconds: 30, side: 'mittig',
    instructions: [
      'Aufrecht sitzen, die Fußsohlen aneinanderlegen und die Fersen zum Körper ziehen.',
      'Die Knie fallen locker nach außen; der Rücken bleibt gerade, bei Bedarf das Becken auf ein Kissen erhöhen.',
      'Mit den Ellbogen sanft auf die Knie drücken. Der Zug liegt an den Oberschenkelinnenseiten.',
    ],
  },
  {
    id: id(22),
    name: 'Adduktorendehnung im breiten Stand', muscles: ['adductors'], holdSeconds: 30, side: 'mittig',
    instructions: [
      'Breiter Stand, die Fußspitzen zeigen leicht nach außen.',
      'Mit geradem Rücken in die Hocke sinken und die Knie mit den Ellbogen nach außen drücken.',
      'Der Zug liegt an den Oberschenkelinnenseiten; die Fersen bleiben am Boden.',
    ],
  },
  {
    id: id(23),
    name: 'IT-Band-Dehnung im Überkreuzstand', muscles: ['abductors'], holdSeconds: 25, side: 'beidseitig',
    instructions: [
      'Aufrecht stehen, ein Bein hinter das andere kreuzen, die Füße stehen eng beieinander.',
      'Den Arm der hinteren Beinseite über den Kopf strecken, den Oberkörper zur Gegenseite neigen und die Hüfte der hinteren Seite nach außen schieben.',
      'Der Zug liegt außen an Hüfte und Oberschenkel. Das Band selbst gilt als kaum dehnbar; gedehnt wird vor allem die seitliche Hüftmuskulatur.',
    ],
  },

  // Mobility-Flow: Wiederholungs-Übungen laufen ohne Timer (nur "Abgeschlossen"),
  // einseitige Übungen bekommen je Seite einen eigenen Durchgang.
  {
    id: id(24),
    name: 'Foam-Roller-Extension (Brustwirbelsäule)', muscles: ['middle back'], reps: 10, side: 'mittig',
    instructions: [
      'Die Foam Roller quer unter den oberen Rücken (Höhe der Schulterblätter) legen, die Füße stehen flach, die Hände stützen den Hinterkopf.',
      'Langsam den Oberkörper über die Rolle nach hinten ablegen und wieder aufrichten; nach einigen Wiederholungen die Rolle 2–3 cm verschieben.',
      'Nicht in den unteren Rücken rollen; beim Strecken ausatmen.',
    ],
  },
  {
    id: id(25),
    name: 'Thoracic Rotation im Vierfüßlerstand', muscles: ['middle back'], reps: 8, side: 'beidseitig',
    instructions: [
      'Vierfüßlerstand, eine Hand hinter den Kopf legen.',
      'Den Ellbogen zum anderen Arm hin absenken, dann nach oben zur Decke aufdrehen; der Blick folgt dem Ellbogen.',
      'Das Becken bleibt ruhig. Langsam bewegen, jede Seite einzeln.',
    ],
  },
  {
    id: id(26),
    name: 'Cat-Cow (Katze-Kuh) im Vierfüßlerstand', muscles: ['lower back', 'middle back'], reps: 10, side: 'mittig',
    instructions: [
      'Vierfüßlerstand: Hände unter den Schultern, Knie unter den Hüften.',
      'Ausatmend den Rücken rund machen (Katze), einatmend die Brust heben und den Rücken leicht durchhängen lassen (Kuh).',
      'Langsam und schmerzfrei im gesamten Bewegungsumfang.',
    ],
  },
  {
    id: id(27),
    name: 'Armkreisen groß (vorwärts/rückwärts)', muscles: ['shoulders'], reps: 12, side: 'mittig',
    instructions: [
      'Aufrecht stehen, die Arme seitlich auf Schulterhöhe.',
      'Große, kontrollierte Kreise erst vorwärts, dann rückwärts; die Rippen bleiben ruhig.',
    ],
  },
  {
    id: id(28),
    name: 'Hüftbeuger im Halbkniestand', muscles: ['hip flexors'], holdSeconds: 45, side: 'beidseitig',
    instructions: [
      'Halbkniestand: das hintere Knie auf weichem Untergrund, das vordere Knie über dem Knöchel.',
      'Das Becken aufrichten, das Gesäß des hinteren Beins anspannen und das Gewicht ein kleines Stück nach vorn verlagern.',
      'Der Zug liegt vorne an der Hüfte des hinteren Beins; Oberkörper aufrecht, kein Hohlkreuz.',
    ],
  },
  {
    id: id(29),
    name: '90/90-Hip-Rotation (Seitenwechsel, langsam)', muscles: ['glutes'], reps: 8, side: 'mittig',
    instructions: [
      'Auf dem Boden sitzen, beide Knie 90° gebeugt und zur selben Seite abgelegt (vorderes Bein außenrotiert, hinteres Bein innenrotiert).',
      'Mit aufrechtem Oberkörper beide Knie kontrolliert zur anderen Seite kippen, sodass die Beine die Rollen tauschen.',
      'Die Hände dürfen zum Abstützen am Boden bleiben; langsam und ohne Schmerz im Knie.',
    ],
  },
  {
    id: id(30),
    name: 'Deep Squat Hold', muscles: ['quadriceps', 'glutes'], holdSeconds: 60, side: 'mittig',
    instructions: [
      'Die Füße etwa schulterbreit, die Fußspitzen leicht nach außen. So tief in die Hocke sinken, wie es mit flachen Fersen geht.',
      'Die Brust bleibt aufrecht; mit den Ellbogen die Knie sanft nach außen drücken, bei Bedarf an einem Pfosten festhalten.',
      'Der Zug liegt an Hüfte, Gesäß, Oberschenkeln und Sprunggelenk.',
    ],
  },
  {
    id: id(31),
    name: 'Adduktoren: Frog Stretch', muscles: ['adductors'], holdSeconds: 60, side: 'mittig',
    instructions: [
      'Vierfüßlerstand, die Knie weit öffnen, die Füße zeigen nach außen und liegen auf einer Linie mit den Knien.',
      'Das Becken langsam Richtung Fersen sinken lassen, die Unterarme liegen am Boden, die Wirbelsäule bleibt gerade.',
      'Der Zug liegt an den Oberschenkelinnenseiten. Bei Knieschmerz weniger weit öffnen.',
    ],
  },
  {
    id: id(32),
    name: 'Knee-to-Wall', muscles: ['calves'], reps: 10, side: 'beidseitig',
    instructions: [
      'Mit der Fußspitze etwa eine Handbreit vor einer Wand stehen, der Fuß zeigt gerade nach vorn.',
      'Das Knie nach vorn an die Wand schieben, die Ferse bleibt am Boden; dann zurück und wiederholen.',
      'Gelingt es leicht, den Fuß weiter von der Wand wegstellen. Der Zug liegt am Sprunggelenk und in der Wade.',
    ],
  },
  {
    id: id(33),
    name: 'Wadendehnung im Ausfallschritt', muscles: ['calves'], holdSeconds: 45, side: 'beidseitig',
    instructions: [
      'Großer Ausfallschritt, die Hände auf dem vorderen Oberschenkel oder an einer Wand.',
      'Das hintere Bein bleibt gestreckt, die Ferse am Boden, die Zehen zeigen nach vorn.',
      'Das Gewicht nach vorn verlagern, bis ein Zug in der Wade entsteht.',
    ],
  },
  {
    id: id(34),
    name: 'Hamstring-PNF im Liegen mit Band', muscles: ['hamstrings'], holdSeconds: 60, side: 'beidseitig',
    instructions: [
      'In Rückenlage ein Band um den Fußballen legen und das gestreckte Bein anheben, bis ein deutlicher Zug entsteht; das andere Bein bleibt am Boden.',
      'Nach etwa der halben Haltezeit 5–6 s sanft gegen das Band drücken (nur leichte Kraft), dann loslassen.',
      'Direkt danach das Bein ein Stück weiter heranziehen und bis zum Ende halten.',
    ],
  },

  // Ergänzungen für die reinen Oberkörper-/Unterkörper-Routinen.
  {
    id: id(35),
    name: 'Nackendehnung diagonal (Levator scapulae)', muscles: ['neck', 'traps'], holdSeconds: 20, side: 'beidseitig',
    instructions: [
      'Aufrecht sitzen und mit der Hand der zu dehnenden Seite die Sitzfläche greifen, damit die Schulter unten bleibt.',
      'Den Kopf um etwa 45° von der gedehnten Seite wegdrehen und die Nase Richtung Achsel der anderen Seite neigen.',
      'Die andere Hand liegt nur locker am Hinterkopf. Der Zug liegt hinten seitlich am Nacken bis zum Schulterblatt.',
    ],
  },
  {
    id: id(36),
    name: 'Unterarmdehnung (Handrücken)', muscles: ['forearms'], holdSeconds: 15, side: 'beidseitig',
    instructions: [
      'Den Arm gestreckt nach vorn führen, der Handrücken zeigt nach oben; das Handgelenk beugen, sodass die Finger nach unten zeigen.',
      'Mit der anderen Hand den Handrücken sanft Richtung Körper drücken.',
      'Der Zug liegt an der Außenseite des Unterarms; der Ellbogen bleibt gestreckt.',
    ],
  },
  {
    id: id(37),
    name: 'Kindshaltung mit gestreckten Armen', muscles: ['lats', 'lower back'], holdSeconds: 30, side: 'mittig',
    instructions: [
      'Im Fersensitz die Arme gestreckt nach vorn auf den Boden legen, die Knie hüftbreit oder etwas weiter.',
      'Die Hände nach vorn schieben und das Gesäß Richtung Fersen sinken lassen, die Stirn ablegen.',
      'Der Zug liegt seitlich am Rücken und in den Achseln; in den Rücken hineinatmen.',
    ],
  },
  {
    id: id(38),
    name: 'Rumpfrotation in Rückenlage', muscles: ['lower back', 'glutes'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'In Rückenlage die Arme seitlich in T-Haltung auf den Boden legen, die Knie über der Hüfte beugen.',
      'Beide Knie langsam zu einer Seite absenken, die Schultern bleiben am Boden; der Blick geht zur Gegenseite.',
      'Nur so tief, wie die Schultern am Boden bleiben. Der Zug liegt im unteren Rücken und im Gesäß.',
    ],
  },

  // Zu den Muskelschlüsseln 'shins' und 'feet'. Bewusst in keiner mitgelieferten Vorlage:
  // Für gesunde Sportler gibt es hier keine belastbare Evidenz für einen Nutzen.
  {
    id: id(39),
    name: 'Schienbeindehnung im Kniestand', muscles: ['shins'], holdSeconds: 30, side: 'mittig',
    instructions: [
      'Im Kniestand die Fußrücken flach auf den Boden legen, die Zehen zeigen nach hinten.',
      'Langsam das Gesäß Richtung Fersen sinken lassen, die Hände stützen vorn; für mehr Zug die Knie leicht anheben.',
      'Der Zug liegt an Schienbeinvorderseite und Fußrücken; bei Schmerz in Knie oder Sprunggelenk abbrechen.',
    ],
  },
  {
    id: id(40),
    name: 'Fußsohlendehnung (Plantarfaszie)', muscles: ['feet'], holdSeconds: 30, side: 'beidseitig',
    instructions: [
      'Im Sitzen den Knöchel auf das gegenüberliegende Knie legen.',
      'Mit der Hand die Zehen und den Vorfuß zum Schienbein hin ziehen.',
      'Der Zug liegt in der Fußsohle (Plantarfaszie); mit dem Daumen die gespannte Sohle ertasten.',
    ],
  },
];

function item(n: number): CatalogPlanItem {
  const x = STRETCH_CATALOG.find((s) => s.id === id(n));
  if (!x) throw new Error(`Dehnübung ${n} fehlt im Katalog`);
  return { stretchId: x.id, side: x.side };
}

/**
 * Vorlagen-Eintrag mit eigener Haltezeit und Satzzahl (Seite aus dem Katalog). Nur für
 * Haltezeit-Übungen; bei Wiederholungs-Übungen gibt es keine Dosis in Sekunden.
 */
function dose(n: number, holdSeconds: number, sets: number): CatalogPlanItem {
  const base = item(n);
  const x = STRETCH_CATALOG.find((s) => s.id === base.stretchId)!;
  if (x.reps != null) throw new Error(`Dehnübung ${n} läuft nach Wiederholungen, nicht nach Haltezeit`);
  return { ...base, holdSeconds, sets };
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
  {
    // Reiner Oberkörper (Nacken bis Rumpf), unabhängig vom Training, von oben nach unten.
    // Dosis siehe Block "Dosierung der Routinen" unten: ca. 1,5-3 min je Muskelgruppe und Einheit.
    id: planId(6),
    name: 'Oberkörper-Dehnung',
    items: [
      dose(1, 30, 1), dose(35, 30, 1), dose(3, 30, 1),
      dose(4, 30, 2), dose(5, 45, 1), dose(6, 30, 2),
      dose(7, 30, 2), dose(8, 30, 2), dose(9, 30, 1), dose(36, 30, 1),
      dose(10, 30, 2), dose(37, 45, 1), dose(11, 45, 2), dose(13, 45, 2),
    ],
  },
  {
    // Reiner Unterkörper (Hüfte bis Wade). Nicht direkt vor Sprints oder Sprüngen gedacht:
    // statisches Dehnen mit >= 60 s je Muskel senkt kurzfristig die Leistung (Behm et al. 2016).
    id: planId(7),
    name: 'Unterkörper-Dehnung',
    items: [
      dose(12, 45, 2), dose(38, 30, 1), dose(18, 30, 2), dose(28, 30, 2),
      dose(14, 30, 2), dose(16, 30, 2), dose(21, 45, 2), dose(23, 30, 2),
      dose(19, 30, 2), dose(20, 30, 2), dose(30, 30, 1),
    ],
  },
];

/*
 * Dosierung der Routinen "Oberkörper-Dehnung" und "Unterkörper-Dehnung"
 *
 * Grundlage ist die Meta-Analyse von Ingram et al. 2024 (Sports Med, DOI 10.1007/s40279-024-02143-9;
 * 189 Studien, 6.654 Erwachsene): Beweglichkeitsgewinne waren bei ca. 4 min statischem Dehnen je
 * Muskelgruppe und Einheit (akut) bzw. ca. 10 min je Muskelgruppe und Woche (chronisch) ausgereizt;
 * darüber hinaus kein zusätzlicher Nutzen, unabhängig von der Zahl der Wocheneinheiten. Intensität
 * (bis Unbehagen vs. darüber) moderierte den Effekt nicht, Schmerz ist also nicht nötig.
 * Sicherheit der Evidenz (GRADE): akut niedrig, chronisch moderat; mittlere PEDro-Wertung 4,0/7.
 * Die Arbeit trifft nur Aussagen zur Beweglichkeit, nicht zu Leistung, Muskelkater oder Verletzungen.
 * Sie wertet Haltezeit und Satzzahl nicht getrennt aus; in den Studien lagen die Mediane bei
 * 30 s (30–60 s) und 3 Sätzen. Die ACSM-Empfehlung (2–4 Sätze à 15–30 s) gilt laut den Autoren als
 * schwach belegt.
 *
 * Daraus folgt für die Routinen:
 * - Haltezeit 30 s (Studienmedian); bei symmetrischen Übungen 45 s. Immer unter 60 s, weil längere
 *   Halten kurzfristig die Leistung senken (Behm et al. 2016: -4,6 % bei >= 60 s, -1,1 % bei < 60 s).
 * - Pro Muskelgruppe meist 2 min je Einheit (Sekunden × Sätze × Seiten, beide Seiten summiert), nie
 *   mehr als 4 min (Obergrenze der Studie). Symmetrische Übungen (ohne Seitenwechsel) kommen auf 1,5 min.
 *   Bei 4–5 Einheiten pro Woche ergibt das 6–10 min je Muskelgruppe; bei 3 Einheiten 4,5–6 min.
 *   Die Waden erreichen 4 min, weil zwei verschiedene Muskeln (Gastrocnemius, Soleus) je 2 min bekommen. Ob Ingram et al. beide Körperseiten summieren, geht aus
 *   der Arbeit nicht hervor; die Rechnung nimmt die Summe an.
 * - Übungen, die dieselbe Muskelgruppe treffen, teilen sich die Dosis (z. B. zwei Nackenübungen mit
 *   je einem Satz statt zwei Sätzen), damit eine Gruppe nicht über die Obergrenze kommt.
 * - Wiederholungs-Mobilisation (Cat-Cow u. a.) ist bewusst nicht enthalten: Für sie gibt es keine
 *   vergleichbare Dosis-Evidenz.
 */

export interface CatalogPlanDose {
  /** Gesamte Haltezeit der Vorlage in Sekunden (ohne Seitenwechsel- und Übungspausen). */
  totalSeconds: number;
  /** Haltezeit je Muskelschlüssel in Sekunden: Haltezeit × Sätze × Seiten, beide Seiten summiert. */
  perMuscleSeconds: Record<string, number>;
}

/** Berechnet die Dosis einer Katalog-Vorlage; Wiederholungs-Übungen zählen nicht mit. */
export function catalogPlanDose(plan: CatalogPlan): CatalogPlanDose {
  const perMuscleSeconds: Record<string, number> = {};
  let totalSeconds = 0;
  for (const it of plan.items) {
    const ex = STRETCH_CATALOG.find((x) => x.id === it.stretchId);
    if (!ex) throw new Error(`Dehnübung ${it.stretchId} fehlt im Katalog`);
    if (ex.reps != null && it.holdSeconds == null) continue;
    const hold = it.holdSeconds ?? ex.holdSeconds ?? 0;
    const seconds = hold * (it.sets ?? 1) * (it.side === 'beidseitig' ? 2 : 1);
    totalSeconds += seconds;
    for (const m of ex.muscles) perMuscleSeconds[m] = (perMuscleSeconds[m] ?? 0) + seconds;
  }
  return { totalSeconds, perMuscleSeconds };
}
