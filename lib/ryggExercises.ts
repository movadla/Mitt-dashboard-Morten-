// Statisk øvelseskatalog for ryggmodulen (12-ukers korsrygg-rehab).
// Ren seed-data, ingen lagring — samme rolle som lib/exercises.ts har for
// vanlig trening, men denne katalogen er fast og har ingen bruker-CRUD.

export interface RyggExercise {
  id: string;
  name: string;
  how: string;
  cue: string;
}

export const RYGG_EXERCISES: RyggExercise[] = [
  {
    id: "katt",
    name: "Katt–kamel",
    how: "På alle fire, hender under skuldrene og knær under hoftene. Rund ryggen rolig opp mot taket, la den så synke til lett svai. Én rep er hele bevegelsen.",
    cue: "Dette er smøring, ikke tøying. Hold deg innenfor det behagelige og press aldri mot ytterstillingen.",
  },
  {
    id: "birddog",
    name: "Bird dog",
    how: "På alle fire. Strekk høyre arm fram og venstre bein bak til begge er vannrette. Hold, senk rolig, bytt side.",
    cue: "Korsryggen skal stå helt stille. Roterer hoften eller svaier ryggen, løfter du beinet for høyt.",
  },
  {
    id: "curlup",
    name: "Curl-up",
    how: "På rygg, ett kne bøyd, hendene under korsryggen. Løft hode og skuldre 2–3 cm og hold.",
    cue: "Korsryggen skal ikke presses ned mot hendene. Løftet er mye mindre enn en vanlig situp.",
  },
  {
    id: "spknee",
    name: "Sideplanke fra knærne",
    how: "På siden med albuen rett under skulderen og knærne bøyd 90°. Løft hoften til skulder, hofte og kne står på linje.",
    cue: "Avslutt serien når linjen ryker, ikke når tiden er ute.",
  },
  {
    id: "spfull",
    name: "Sideplanke fra føttene",
    how: "Som knevarianten, men støtte på føttene med strake bein. Kroppen i én linje fra ankel til hode.",
    cue: "Går du tom for stilling, bytt til knevarianten på de siste seriene. Det er riktig dosering, ikke et nederlag.",
  },
  {
    id: "spleg",
    name: "Sideplanke med benløft",
    how: "Full sideplanke. Løft øverste bein rolig opp og ned gjennom holdet.",
    cue: "Hoften skal ikke falle når beinet går opp.",
  },
  {
    id: "deadbug",
    name: "Dead bug",
    how: "På rygg, armene rett opp, knærne i 90°. Senk én arm bakover og motsatt bein mot gulvet samtidig. Tilbake, bytt side.",
    cue: "Korsryggen skal ha kontakt med underlaget hele veien. Slipper den, gå kortere ned.",
  },
  {
    id: "bridge",
    name: "Hoftehev",
    how: "På rygg med bøyde knær og føttene i gulvet. Press gjennom hælene og løft hoften til kroppen er rett fra kne til skulder.",
    cue: "Klem setet på toppen. Kjenner du det i korsryggen i stedet for i setet, løfter du for høyt.",
  },
  {
    id: "slbridge",
    name: "Ettbeins hoftehev",
    how: "Som hoftehev, men strekk det ene beinet rett ut og løft med det andre.",
    cue: "Hoften skal stå vannrett — siden uten støtte vil falle.",
  },
  {
    id: "hipflex",
    name: "Hoftebøyerstrekk",
    how: "Utfallsstilling med bakre kne i gulvet. Klem setet på bakre bein og skyv hoften rolig framover. Hold.",
    cue: "Setet må klemmes først, ellers svaier du i korsryggen i stedet for å strekke hoften.",
  },
  {
    id: "rdl",
    name: "Rumensk markløft",
    how: "Manualene foran lårene, lett bøy i knærne. Skyv hoften bakover og la vektene gli langs låret til strekk bak i låret. Press hoften fram igjen.",
    cue: "Programmets viktigste øvelse. Bevegelsen skjer i hoften, ikke i korsryggen. Runder ryggen seg, har du gått for langt ned.",
  },
  {
    id: "slrdl",
    name: "Ettbeins rumensk markløft",
    how: "Stå på ett bein med manualen i motsatt hånd. Skyv hoften bakover mens det frie beinet går bak som motvekt.",
    cue: "Hold hoftene lukket — den frie hoften vil rotere opp.",
  },
  {
    id: "goblet",
    name: "Goblet squat",
    how: "Én manual mot brystet med begge hender. Sett deg rett ned mellom hoftene så dypt du kommer med rett rygg.",
    cue: "Stopp der korsryggen begynner å runde på bunnen.",
  },
  {
    id: "suitcase",
    name: "Kofferbæring",
    how: "Én manual i én hånd. Gå rolig fram og tilbake med høy brystkasse. Bytt side.",
    cue: "Overkroppen skal ikke lene mot noen side — du motarbeider sidebøy, det er hele øvelsen.",
  },
  {
    id: "farmer",
    name: "Farmer's walk",
    how: "Én manual i hver hånd. Gå rolig med lange, stødige steg.",
    cue: "Pust normalt — ikke hold pusten gjennom settet.",
  },
  {
    id: "split",
    name: "Splittknebøy",
    how: "Ett bein fram, ett bak, manualene ved sidene. Senk bakre kne rett ned mot gulvet. Fullfør alle repetisjoner før bytte.",
    cue: "Overkroppen loddrett, bevegelsen rett opp og ned — ikke fram og tilbake.",
  },
  {
    id: "stepup",
    name: "Opptrinn",
    how: "Én fot på stol eller benk i knehøyde. Press gjennom hælen, reis deg helt opp, senk rolig.",
    cue: "Ikke sparke fra med bakerste bein. Senk deg ned i tre sekunder.",
  },
  {
    id: "hipthrust",
    name: "Hip thrust",
    how: "Skulderbladene på sofakant, bøyde knær, manual over hoften. Løft til kroppen er vannrett fra kne til skulder.",
    cue: "Klem setet hardt på toppen og stopp ved vannrett — ikke svai over.",
  },
];

export function getRyggExercise(id: string): RyggExercise | undefined {
  return RYGG_EXERCISES.find((e) => e.id === id);
}
