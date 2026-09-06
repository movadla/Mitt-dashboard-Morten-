// Navigasjon PÅ TVERS av de to fanene.
//
// Fane-tilstanden (`mode`) bor i app/dashboard.tsx, mens hvilken seksjon som
// er valgt bor inne i PrivatPanel og JobbView — hver for seg. Et søketreff i
// kommandopaletten må kunne treffe begge deler samtidig ("gå til Jobb, og vis
// Kundefordringer"), uten at all den tilstanden løftes opp i én komponent.
//
// Løsningen er samme mønster appen allerede bruker for oppfriskning
// ("mitt-dashboard:privat-refresh"): et vindus-event. Det ene som må håndteres
// i tillegg er tidsrekkefølgen — panelet man navigerer TIL kan være
// avmontert i det øyeblikket eventet sendes (fanene er lazy-lastet). Derfor
// legges målet også i en modulvariabel som panelet plukker opp når det
// monterer.

export type AppMode = "jobb" | "privat";

export interface NavigationTarget {
  mode: AppMode;
  sectionId: string;
}

export const APP_NAVIGATE_EVENT = "mitt-dashboard:navigate";

let pending: NavigationTarget | null = null;

export function navigateTo(target: NavigationTarget) {
  pending = target;
  window.dispatchEvent(new CustomEvent<NavigationTarget>(APP_NAVIGATE_EVENT, { detail: target }));
}

/** Leser og NULLSTILLER et ventende mål for denne fanen. Kalles av panelet når
 *  det monterer: da fanger det opp en navigasjon som ble sendt mens panelet
 *  ennå ikke fantes. Nullstillingen er poenget — uten den ville panelet hoppe
 *  tilbake til samme seksjon hver gang man bytter fane senere. */
export function consumePendingNavigation(mode: AppMode): string | null {
  if (pending?.mode !== mode) return null;
  const sectionId = pending.sectionId;
  pending = null;
  return sectionId;
}
