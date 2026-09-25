export interface PlanDayRef {
  id: string;
  position: number;
}

/**
 * Nächster Trainingstag in der Rotation (z. B. Push -> Pull -> Lower -> Push).
 * Ohne bisheriges Training beginnt die Rotation beim ersten Tag.
 * Archivierte Tage sollten vorher herausgefiltert werden.
 */
export function nextPlanDay(days: PlanDayRef[], lastDoneId: string | null): PlanDayRef | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.position - b.position);
  if (lastDoneId === null) return sorted[0];
  const idx = sorted.findIndex((d) => d.id === lastDoneId);
  if (idx === -1) return sorted[0];
  return sorted[(idx + 1) % sorted.length];
}
