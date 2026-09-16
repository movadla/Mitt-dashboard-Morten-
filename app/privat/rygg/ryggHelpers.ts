import type { RyggWeekDecision } from "@/lib/ryggLog";
import { phaseForWeek } from "@/lib/ryggProgram";

export const PHASE_LABEL: Record<1 | 2 | 3, string> = {
  1: "Fase 1",
  2: "Fase 2",
  3: "Fase 3",
};

export function phaseLabelForWeek(week: number): string {
  if (week > 12) return "Vedlikehold";
  return PHASE_LABEL[phaseForWeek(week)];
}

export const DECISION_LABEL: Record<RyggWeekDecision, string> = {
  progress: "Fremgang",
  repeat: "Gjentas",
  deload: "Lettere uke",
  hold: "På hold",
};

// Samme fargespråk som spec-en ber om: oransje er global primærfarge for
// handling/fremdrift, grønn er Trening sin identitet. Avvik (repeat/deload)
// bruker warning/danger — hold er en sikkerhetsstopp, ikke en dosering.
export const DECISION_COLOR_CLASS: Record<RyggWeekDecision, string> = {
  progress: "text-status-positive",
  repeat: "text-status-warning",
  deload: "text-status-warning",
  hold: "text-status-danger",
};

// Ring-omkrets for et 44x44 SVG-viewbox med radius 18 (2πr), samme konstant
// som TodaySummary.tsx sin "Gjenstår i dag"-ring — se app/privat/TodaySummary.tsx:680.
export const RING_LENGTH = 113;

export function ringOffset(completed: number, total: number): number {
  if (total <= 0) return RING_LENGTH;
  const ratio = Math.min(1, Math.max(0, completed / total));
  return RING_LENGTH * (1 - ratio);
}

export function formatPain(n: number | null): string {
  if (n === null) return "–";
  return n.toFixed(1).replace(".", ",");
}
