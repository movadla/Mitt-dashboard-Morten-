// "Åpne Rygg-visningen i Trening" på tvers av komponenter — samme
// modulvariabel + vindus-event-mønster som lib/appNavigation.ts, av samme
// grunn: TreningSection kan være avmontert når "I dag"-kortet ber om hoppet
// (seksjonene i Privat rendres én om gangen), så flagget må overleve til den
// monterer, mens eventet dekker tilfellet der den allerede er montert.

export const RYGG_OPEN_EVENT = "mitt-dashboard:rygg-open";

let pendingOpen = false;

export function requestOpenRyggView() {
  pendingOpen = true;
  window.dispatchEvent(new Event(RYGG_OPEN_EVENT));
}

export function peekOpenRyggView(): boolean {
  return pendingOpen;
}

export function consumeOpenRyggView(): boolean {
  const value = pendingOpen;
  pendingOpen = false;
  return value;
}
