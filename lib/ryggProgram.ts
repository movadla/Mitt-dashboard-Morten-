// Statisk 12-ukers programseed for ryggmodulen. Fase 1 (uke 1-4) og fase 2
// (uke 5-8) har én økt som kjøres tre ganger i uka (PROGRAM). Fase 3
// (uke 9-12) veksler mellom variant A og B (PROGRAM_AB), startende A-B-A,
// så B-A-B.

export interface RyggProgramItem {
  exerciseId: string;
  dose: string; // fritekst, f.eks. "4 × 10 · 3 sek ned"
  sets: number; // for deload-beregning
}

export const RYGG_PHASE_1_WEEKS = [1, 2, 3, 4];
export const RYGG_PHASE_2_WEEKS = [5, 6, 7, 8];
export const RYGG_PHASE_3_WEEKS = [9, 10, 11, 12];

export function phaseForWeek(week: number): 1 | 2 | 3 {
  if (week <= 4) return 1;
  if (week <= 8) return 2;
  return 3;
}

function items(rows: [string, string, number][]): RyggProgramItem[] {
  return rows.map(([exerciseId, dose, sets]) => ({ exerciseId, dose, sets }));
}

export const RYGG_PROGRAM: Record<number, RyggProgramItem[]> = {
  1: items([
    ["katt", "2 × 8 rolige", 2],
    ["birddog", "3 × 6 per side · 5 sek hold", 3],
    ["curlup", "3 × 6 · 6 sek hold", 3],
    ["spknee", "3 × 20 sek per side", 3],
    ["bridge", "3 × 10", 3],
    ["hipflex", "2 × 30 sek per side", 2],
  ]),
  2: items([
    ["katt", "2 × 8 rolige", 2],
    ["birddog", "3 × 8 per side · 5 sek hold", 3],
    ["curlup", "3 × 8 · 8 sek hold", 3],
    ["spknee", "3 × 25 sek per side", 3],
    ["bridge", "3 × 12", 3],
    ["hipflex", "2 × 30 sek per side", 2],
  ]),
  3: items([
    ["katt", "2 × 8 rolige", 2],
    ["birddog", "3 × 8 per side · 8 sek hold", 3],
    ["curlup", "3 × 8 · 10 sek hold", 3],
    ["spknee", "3 × 30 sek per side", 3],
    ["bridge", "3 × 14 · 2 sek hold", 3],
    ["hipflex", "2 × 40 sek per side", 2],
  ]),
  4: items([
    ["katt", "2 × 8 rolige", 2],
    ["birddog", "3 × 10 per side · 8 sek hold", 3],
    ["curlup", "4 × 8 · 10 sek hold", 4],
    ["spknee", "3 × 35 sek per side", 3],
    ["bridge", "3 × 15 · 3 sek hold", 3],
    ["hipflex", "2 × 40 sek per side", 2],
  ]),
  5: items([
    ["birddog", "3 × 6 per side · 10 sek hold", 3],
    ["spfull", "3 × 20 sek per side", 3],
    ["deadbug", "3 × 6 per side", 3],
    ["rdl", "3 × 8 · 2 × 10 kg", 3],
    ["goblet", "3 × 8 · 10 kg", 3],
    ["suitcase", "3 × 25 sek per side", 3],
    ["slbridge", "3 × 8 per side", 3],
  ]),
  6: items([
    ["birddog", "3 × 8 per side · 10 sek hold", 3],
    ["spfull", "3 × 25 sek per side", 3],
    ["deadbug", "3 × 8 per side", 3],
    ["rdl", "3 × 10 · 2 × 10 kg", 3],
    ["goblet", "3 × 10 · 10 kg", 3],
    ["suitcase", "3 × 30 sek per side", 3],
    ["slbridge", "3 × 10 per side", 3],
  ]),
  7: items([
    ["birddog", "3 × 8 per side · 10 sek hold", 3],
    ["spfull", "3 × 30 sek per side", 3],
    ["deadbug", "3 × 10 per side", 3],
    ["rdl", "4 × 10 · 2 × 10 kg", 4],
    ["goblet", "3 × 12 · 10 kg", 3],
    ["suitcase", "3 × 35 sek per side", 3],
    ["slbridge", "3 × 12 per side", 3],
  ]),
  8: items([
    ["birddog", "3 × 8 per side · 12 sek hold", 3],
    ["spfull", "3 × 40 sek per side", 3],
    ["deadbug", "3 × 12 per side", 3],
    ["rdl", "4 × 12 · 2 × 10 kg", 4],
    ["goblet", "4 × 12 · 10 kg", 4],
    ["suitcase", "3 × 40 sek per side", 3],
    ["slbridge", "3 × 12 · 2 sek hold", 3],
  ]),
};

export const RYGG_PROGRAM_AB: Record<number, { A: RyggProgramItem[]; B: RyggProgramItem[] }> = {
  9: {
    A: items([
      ["rdl", "4 × 8 · 3 sek ned", 4],
      ["split", "3 × 6 per bein", 3],
      ["farmer", "3 × 30 sek", 3],
      ["spleg", "3 × 20 sek per side", 3],
    ]),
    B: items([
      ["slrdl", "3 × 6 per bein · 10 kg", 3],
      ["stepup", "3 × 6 per bein", 3],
      ["birddog", "3 × 8 per side · 10 sek", 3],
      ["suitcase", "3 × 40 sek per side", 3],
      ["hipthrust", "3 × 10", 3],
    ]),
  },
  10: {
    A: items([
      ["rdl", "4 × 10 · 3 sek ned", 4],
      ["split", "3 × 8 per bein", 3],
      ["farmer", "4 × 35 sek", 4],
      ["spleg", "3 × 25 sek per side", 3],
    ]),
    B: items([
      ["slrdl", "3 × 8 per bein · 10 kg", 3],
      ["stepup", "3 × 8 per bein", 3],
      ["birddog", "3 × 8 per side · 10 sek", 3],
      ["suitcase", "3 × 45 sek per side", 3],
      ["hipthrust", "3 × 12", 3],
    ]),
  },
  11: {
    A: items([
      ["rdl", "4 × 12 · 3 sek ned", 4],
      ["split", "3 × 10 per bein", 3],
      ["farmer", "4 × 40 sek", 4],
      ["spleg", "3 × 30 sek per side", 3],
    ]),
    B: items([
      ["slrdl", "3 × 10 per bein · 10 kg", 3],
      ["stepup", "3 × 10 per bein", 3],
      ["birddog", "3 × 10 per side · 10 sek", 3],
      ["suitcase", "3 × 50 sek per side", 3],
      ["hipthrust", "3 × 15", 3],
    ]),
  },
  12: {
    A: items([
      ["rdl", "5 × 10 · 3 sek ned", 5],
      ["split", "4 × 10 per bein", 4],
      ["farmer", "4 × 45 sek", 4],
      ["spleg", "3 × 35 sek per side", 3],
    ]),
    B: items([
      ["slrdl", "3 × 10 per bein · 2 sek ned", 3],
      ["stepup", "4 × 10 per bein", 4],
      ["birddog", "3 × 10 per side · 12 sek", 3],
      ["suitcase", "3 × 60 sek per side", 3],
      ["hipthrust", "4 × 15", 4],
    ]),
  },
};

// Vedlikeholdsmodus etter uke 12 (spec §8): gjentar fase 3-dosene, men med
// to økter i uka i stedet for tre. Bruker uke 12 sine doser som fast
// referanse — deload/gulv-logikken opphører (ikke lenger et 12-ukers forløp
// med progresjon, bare vedlikehold).
export const RYGG_MAINTENANCE_WEEK = 12;
export const RYGG_MAINTENANCE_SESSIONS_PER_WEEK = 2;

export function programForWeek(effectiveWeek: number, variant?: "A" | "B"): RyggProgramItem[] {
  const phase = phaseForWeek(effectiveWeek);
  if (phase === 3) {
    const ab = RYGG_PROGRAM_AB[effectiveWeek] ?? RYGG_PROGRAM_AB[RYGG_MAINTENANCE_WEEK];
    return ab[variant ?? "A"];
  }
  return RYGG_PROGRAM[effectiveWeek] ?? [];
}

// A-B-A / B-A-B-vekslingen i fase 3: variant for økt N i uka avhenger kun av
// forrige logget variant, ikke av øktnummer — så et hoppet/ekstra økt aldri
// forskyver mønsteret permanent.
export function nextVariant(lastVariant: "A" | "B" | undefined): "A" | "B" {
  if (lastVariant === "A") return "B";
  return "A";
}
