import { buildIncomeForecastContext } from "./incomeForecast";
import { localDateString } from "./payday";

export function formatKr(n: number, signed = false): string {
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("nb-NO")} kr`;
}

export function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * EKTE DATA fra Outlook-kalenderen din (hentet 2026-08-14 via mcp__claude_ai_Microsoft_365__outlook_calendar_search,
 * vindu 2026-08-14 -> 2027-08-14, 12 måneder frem). Inkluderer både faktiske møter med andre deltakere og dine egne
 * heldags-blokker ("Permisjon", kun deg selv som deltaker/organizer). "Beskrivelse" = din rolle
 * (Innkaller/Deltaker for møter, "Fravær" for permisjonsdager). Norske helligdager (heldags, automatisk fra
 * Outlook) er utelatt — dette er en møteliste, ikke en helligdagskalender. Sortert kronologisk, 6 nærmeste
 * vises som standard i UI, "Mer"-knappen viser 10 nye om gangen.
 */
const TEAMS_INFO = "Microsoft Teams-møte. Møte-ID: 322 367 541 208 27, passord: ca2Fq7GP.";

export const CALENDAR_EVENTS: { id: string; dato: string; start: string; slutt: string; mote: string; beskrivelse: string; sted: string; merknad?: string }[] = [
  { id: "2026-08-17T06:00", dato: "2026-08-17", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-18T10:30", dato: "2026-08-18", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-08-19T06:00", dato: "2026-08-19", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-19T07:00", dato: "2026-08-19", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-08-19T10:00", dato: "2026-08-19", start: "10:00", slutt: "12:00", mote: "Kommersiell avdeling - avd. møte", beskrivelse: "Deltaker", sted: "Lv.4C Klin Kokos (styrerommet)" },
  { id: "2026-08-20T06:00", dato: "2026-08-20", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-21T06:00", dato: "2026-08-21", start: "06:00", slutt: "15:00", mote: "Permisjon", beskrivelse: "Fravær", sted: "—" },
  { id: "2026-08-25T06:00", dato: "2026-08-25", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-08-25T10:00", dato: "2026-08-25", start: "10:00", slutt: "11:00", mote: "Månedlig status utleie", beskrivelse: "Innkaller", sted: "—", merknad: "Setter opp et fast månedlig møte i kalenderen. Ser om det trengs i lengden." },
  { id: "2026-08-25T10:30", dato: "2026-08-25", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-08-26T07:00", dato: "2026-08-26", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-08-26T11:00", dato: "2026-08-26", start: "11:00", slutt: "11:30", mote: "Knut 60år", beskrivelse: "Deltaker", sted: "Kjøkken/sosial sone", merknad: "I løpet av sommerferien har verdens beste Knut endelig blitt voksen! Vi feirer han med en liten kakefest for anledningen, vel møtt!" },
  { id: "2026-08-31T08:00", dato: "2026-08-31", start: "08:00", slutt: "09:00", mote: "Allmøte 1//høst 26", beskrivelse: "Deltaker", sted: "Auditorium - LIGOL, Lilleakerveien 8", merknad: "Velkommen til første allmøte etter sommeren\nSe Mustad felles for info, som vanlig blir dette en orientering fra avdelingene.\n\nHar du innspill til tema som bør tas opp – meld @Elisabeth Høili og få det in i agendaen.\n\nNB: våre allmøter er obligatorisk" },
  { id: "2026-09-01T06:00", dato: "2026-09-01", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-09-01T10:30", dato: "2026-09-01", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-09-02T07:00", dato: "2026-09-02", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-09-08T06:00", dato: "2026-09-08", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-09-08T10:30", dato: "2026-09-08", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-09-09T07:00", dato: "2026-09-09", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-09-15T06:00", dato: "2026-09-15", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-09-15T10:30", dato: "2026-09-15", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-09-16T07:00", dato: "2026-09-16", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-09-16T10:00", dato: "2026-09-16", start: "10:00", slutt: "12:00", mote: "Kommersiell avdeling - avd. møte", beskrivelse: "Deltaker", sted: "Lv.4C Klin Kokos (styrerommet)" },
  { id: "2026-09-22T06:00", dato: "2026-09-22", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-09-22T10:00", dato: "2026-09-22", start: "10:00", slutt: "11:00", mote: "Månedlig status utleie", beskrivelse: "Innkaller", sted: "—", merknad: "Setter opp et fast månedlig møte i kalenderen. Ser om det trengs i lengden." },
  { id: "2026-09-22T10:30", dato: "2026-09-22", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-09-23T07:00", dato: "2026-09-23", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-09-24T07:00", dato: "2026-09-24", start: "07:00", slutt: "18:00", mote: "Avdelingssamling #3 + Sosialt", beskrivelse: "Deltaker", sted: "TBD" },
  { id: "2026-09-24T09:00", dato: "2026-09-24", start: "09:00", slutt: "10:00", mote: "Handelsbanken / Mustad - Renteoppdatering", beskrivelse: "Innkaller", sted: "Lv.4C Klin Kokos (styrerommet)" },
  { id: "2026-09-29T06:00", dato: "2026-09-29", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-09-29T10:30", dato: "2026-09-29", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-09-30T07:00", dato: "2026-09-30", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-10-06T06:00", dato: "2026-10-06", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-10-06T10:30", dato: "2026-10-06", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-10-07T07:00", dato: "2026-10-07", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-10-13T06:00", dato: "2026-10-13", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-10-13T10:30", dato: "2026-10-13", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-10-14T07:00", dato: "2026-10-14", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-10-20T06:00", dato: "2026-10-20", start: "06:00", slutt: "06:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-10-20T10:30", dato: "2026-10-20", start: "10:30", slutt: "11:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-10-21T07:00", dato: "2026-10-21", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-10-21T10:00", dato: "2026-10-21", start: "10:00", slutt: "12:00", mote: "Kommersiell avdeling - avd. møte", beskrivelse: "Deltaker", sted: "Lv.4C Klin Kokos (styrerommet)" },
  { id: "2026-10-27T07:00", dato: "2026-10-27", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-10-27T11:30", dato: "2026-10-27", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-10-28T07:30", dato: "2026-10-28", start: "07:30", slutt: "08:30", mote: "Placeholder - foredrag; kunsten å skape ett vinnerlag!", beskrivelse: "Deltaker", sted: "Lilleakerveien 8, 0283 Oslo, Norway", merknad: "Hold av tiden til felles foredrag for alle Mustad ansatte i Auditoriet i LV. 8.\nMer info kommer på Mustad felles\n\nVel møtt" },
  { id: "2026-10-28T08:00", dato: "2026-10-28", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-11-03T07:00", dato: "2026-11-03", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-11-03T11:30", dato: "2026-11-03", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-11-04T08:00", dato: "2026-11-04", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-11-10T07:00", dato: "2026-11-10", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-11-10T11:30", dato: "2026-11-10", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-11-11T08:00", dato: "2026-11-11", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-11-17T07:00", dato: "2026-11-17", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-11-17T11:30", dato: "2026-11-17", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-11-18T08:00", dato: "2026-11-18", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-11-18T11:00", dato: "2026-11-18", start: "11:00", slutt: "13:00", mote: "Kommersiell avdeling - avd. møte", beskrivelse: "Deltaker", sted: "Lv.4C Klin Kokos (styrerommet)" },
  { id: "2026-11-24T07:00", dato: "2026-11-24", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-11-24T11:30", dato: "2026-11-24", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-11-25T08:00", dato: "2026-11-25", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-11-27T17:00", dato: "2026-11-27", start: "17:00", slutt: "22:30", mote: "MEAS julebord", beskrivelse: "Deltaker", sted: "—", merknad: "Tradisjon tro, vi holder av siste fredag i november til MEAS julebord.\nInfo kommer på Mustad felles når den tiden kommer" },
  { id: "2026-12-01T07:00", dato: "2026-12-01", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-12-01T11:30", dato: "2026-12-01", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-12-02T08:00", dato: "2026-12-02", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-12-08T07:00", dato: "2026-12-08", start: "07:00", slutt: "07:30", mote: "Morgenkonsert Sølvguttene på Mølletorget", beskrivelse: "Deltaker", sted: "—" },
  { id: "2026-12-08T07:00-2", dato: "2026-12-08", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-12-08T11:30", dato: "2026-12-08", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-12-09T08:00", dato: "2026-12-09", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-12-15T07:00", dato: "2026-12-15", start: "07:00", slutt: "07:55", mote: "Mustad-gym", beskrivelse: "Deltaker", sted: "Gymsalen, Lv.8", merknad: "Vi starter en ny runde med gym (høstsesongen)\nVel møtt!" },
  { id: "2026-12-15T11:30", dato: "2026-12-15", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-12-16T08:00", dato: "2026-12-16", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-12-16T11:00", dato: "2026-12-16", start: "11:00", slutt: "13:00", mote: "Kommersiell avdeling - avd. møte", beskrivelse: "Deltaker", sted: "Lv.4C Klin Kokos (styrerommet)" },
  { id: "2026-12-22T11:30", dato: "2026-12-22", start: "11:30", slutt: "12:00", mote: "Status forvaltning med Mustad", beskrivelse: "Deltaker", sted: "Teams-møte", merknad: TEAMS_INFO },
  { id: "2026-12-23T08:00", dato: "2026-12-23", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2026-12-30T08:00", dato: "2026-12-30", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-01-06T08:00", dato: "2027-01-06", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-01-13T08:00", dato: "2027-01-13", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-01-20T08:00", dato: "2027-01-20", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-01-27T08:00", dato: "2027-01-27", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-02-03T08:00", dato: "2027-02-03", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-02-10T08:00", dato: "2027-02-10", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-02-17T08:00", dato: "2027-02-17", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-02-24T08:00", dato: "2027-02-24", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-03-03T08:00", dato: "2027-03-03", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-03-10T08:00", dato: "2027-03-10", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-03-17T08:00", dato: "2027-03-17", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-03-24T08:00", dato: "2027-03-24", start: "08:00", slutt: "09:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-03-31T07:00", dato: "2027-03-31", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-04-07T07:00", dato: "2027-04-07", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-04-14T07:00", dato: "2027-04-14", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-04-21T07:00", dato: "2027-04-21", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-04-28T07:00", dato: "2027-04-28", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-05-05T07:00", dato: "2027-05-05", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-05-12T07:00", dato: "2027-05-12", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-05-19T07:00", dato: "2027-05-19", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-05-26T07:00", dato: "2027-05-26", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-06-02T07:00", dato: "2027-06-02", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-06-09T07:00", dato: "2027-06-09", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-06-16T07:00", dato: "2027-06-16", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-06-23T07:00", dato: "2027-06-23", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-06-30T07:00", dato: "2027-06-30", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-07-07T07:00", dato: "2027-07-07", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-07-14T07:00", dato: "2027-07-14", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-07-21T07:00", dato: "2027-07-21", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-07-28T07:00", dato: "2027-07-28", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-08-04T07:00", dato: "2027-08-04", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
  { id: "2027-08-11T07:00", dato: "2027-08-11", start: "07:00", slutt: "08:00", mote: "Status Mustad vs Amesto vedr. forvaltning", beskrivelse: "Innkaller", sted: "Lv.4C Lysakerelva" },
];

/**
 * MIDLERTIDIG ANONYMISERT (se AGENTS.md-historikk/commit-melding for dato) — kundenavn er
 * byttet ut med "Demokunde N" på Mortens forespørsel før dashboardet skulle vises frem.
 * Beløp/datoer/bygg er ekte (fra Fazile, hentet 2026-08-14 — se widgets.local.ts for full
 * metodikk-forklaring, inkl. 60-dagers signeringsdato-heuristikken). Ekte kundenavn og
 * SF-lenker finnes i lib/widgets.local.ts (gitignored) — spør Morten før du bytter tilbake.
 * Nummer gjenbrukt fra RECEIVABLES der samme leietaker opptrer der; nye leietakere denne
 * runden er nummerert 220–277.
 */
export interface Contract {
  id: string;
  kunde: string;
  signeringsdato: string;
  startdato: string;
  arsbelop: number;
  bygg: string;
  kvm: number;
  leietype: string;
  sfUrl: string | null;
}

// `id` er posisjonsbasert (c1, c2, ...) — IKKE avledet av kundenavn, siden navnet er
// anonymisert her men ekte i widgets.local.ts og må gi SAMME id i begge filer for at
// kommentarer (lib/comments.ts) skal treffe riktig rad uansett hvilken variant som kjører.
export const CONTRACTS: Contract[] = [
  { id: "c1", kunde: "Demokunde 29", signeringsdato: "2026-08-11", startdato: "2026-08-12", arsbelop: 30000, bygg: "Lilleakerveien 8", kvm: 12, leietype: "Parkering", sfUrl: null },
  { id: "c2", kunde: "Demokunde 1", signeringsdato: "2026-08-08", startdato: "2026-09-01", arsbelop: 186800, bygg: "Lilleakerveien 31", kvm: 135.6, leietype: "Lagerleie", sfUrl: null },
  { id: "c3", kunde: "Demokunde 169", signeringsdato: "2026-08-03", startdato: "2026-08-01", arsbelop: 34800, bygg: "Lilleakerveien 2E", kvm: 12.9, leietype: "Husleie", sfUrl: null },
  { id: "c4", kunde: "Demokunde 209", signeringsdato: "2026-07-24", startdato: "2026-07-15", arsbelop: 60000, bygg: "Lilleakerveien 4CDEF", kvm: 24.6, leietype: "Parkering", sfUrl: null },
  { id: "c5", kunde: "Demokunde 198", signeringsdato: "2026-07-09", startdato: "2026-07-01", arsbelop: 33127.19, bygg: "Lilleakerveien 10", kvm: 11.3, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c6", kunde: "Demokunde 175", signeringsdato: "2026-07-09", startdato: "2026-07-01", arsbelop: 61988.73, bygg: "Lilleakerveien 10", kvm: 24, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c7", kunde: "Demokunde 220 AS", signeringsdato: "2026-07-07", startdato: "2026-09-01", arsbelop: 952271.04, bygg: "Lilleakerveien 16 mm", kvm: 85.8, leietype: "Minimumsleie/Minimumsleie år 1+2/Leie", sfUrl: null },
  { id: "c8", kunde: "Demokunde 221 AS", signeringsdato: "2026-07-07", startdato: "2026-09-04", arsbelop: 2028695, bygg: "Vollsveien 13-19", kvm: 754.8, leietype: "Kontorleie", sfUrl: null },
  { id: "c9", kunde: "Demokunde 175", signeringsdato: "2026-07-01", startdato: "2026-07-01", arsbelop: 2991001.77, bygg: "Lilleakerveien 10", kvm: 882.3, leietype: "Husleie/Garasje/El-bil", sfUrl: null },
  { id: "c10", kunde: "Demokunde 198", signeringsdato: "2026-07-01", startdato: "2026-07-01", arsbelop: 830224.56, bygg: "Lilleakerveien 8", kvm: 286.9, leietype: "Husleie/Garasje/El-bil", sfUrl: null },
  { id: "c11", kunde: "Demokunde 150", signeringsdato: "2026-06-30", startdato: "2026-07-01", arsbelop: 72000, bygg: "Vollsveien 21", kvm: 32.6, leietype: "Lagerleie", sfUrl: null },
  { id: "c12", kunde: "Demokunde 222 AS", signeringsdato: "2026-06-30", startdato: "2026-06-23", arsbelop: 92800, bygg: "Lilleakerveien 2CD", kvm: 24, leietype: "Kontor", sfUrl: null },
  { id: "c13", kunde: "Demokunde 223 AS", signeringsdato: "2026-06-24", startdato: "2026-06-01", arsbelop: 480000, bygg: "Lilleakerveien 2E", kvm: 225.7, leietype: "Husleie", sfUrl: null },
  { id: "c14", kunde: "Demokunde 224 AS", signeringsdato: "2026-06-21", startdato: "2026-07-01", arsbelop: 90000, bygg: "Lilleakerveien 2 Garasje", kvm: 33.4, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c15", kunde: "Demokunde 224 AS", signeringsdato: "2026-06-21", startdato: "2026-07-01", arsbelop: 614250, bygg: "Lilleakerveien 2AB", kvm: 90.1, leietype: "Kontorleie", sfUrl: null },
  { id: "c16", kunde: "Demokunde 225 AS", signeringsdato: "2026-06-21", startdato: "2026-05-15", arsbelop: 46800, bygg: "Lilleakerveien 2E", kvm: 50.8, leietype: "Lagerleie", sfUrl: null },
  { id: "c17", kunde: "Demokunde 29", signeringsdato: "2026-06-19", startdato: "2026-06-15", arsbelop: 30000, bygg: "Lilleakerveien 8", kvm: 12, leietype: "Parkering", sfUrl: null },
  { id: "c18", kunde: "Demokunde 44", signeringsdato: "2026-06-19", startdato: "2026-06-15", arsbelop: 30826.53, bygg: "Lilleakerveien 4CDEF", kvm: 12.3, leietype: "Parkering", sfUrl: null },
  { id: "c19", kunde: "Demokunde 226 AS", signeringsdato: "2026-06-19", startdato: "2026-06-15", arsbelop: 30000, bygg: "Lilleakerveien 16 mm", kvm: 13.8, leietype: "Parkering", sfUrl: null },
  { id: "c20", kunde: "Demokunde 7", signeringsdato: "2026-06-18", startdato: "2026-08-01", arsbelop: 144000, bygg: "Lilleakerveien 19", kvm: 1.8, leietype: "Husleie", sfUrl: null },
  { id: "c21", kunde: "Demokunde 29", signeringsdato: "2026-06-18", startdato: "2026-06-12", arsbelop: 525000, bygg: "Lilleakerveien 8", kvm: 150, leietype: "Kontorleie", sfUrl: null },
  { id: "c22", kunde: "Demokunde 20", signeringsdato: "2026-06-12", startdato: "2026-07-01", arsbelop: 171587.88, bygg: "Gamle Drammensvei 10", kvm: 0, leietype: "Husleie", sfUrl: null },
  { id: "c23", kunde: "Demokunde 112", signeringsdato: "2026-06-12", startdato: "2026-08-01", arsbelop: 40800, bygg: "Lilleakerveien 31", kvm: 29.5, leietype: "Parkering", sfUrl: null },
  { id: "c24", kunde: "Demokunde 227 AS", signeringsdato: "2026-06-10", startdato: "2026-07-01", arsbelop: 26037.55, bygg: "Lilleakerveien 6", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c25", kunde: "Demokunde 228 AS", signeringsdato: "2026-06-10", startdato: "2026-07-01", arsbelop: 10500, bygg: "Lilleakerveien 2 Garasje", kvm: 11.3, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c26", kunde: "Demokunde 229 AS", signeringsdato: "2026-06-05", startdato: "2026-06-01", arsbelop: 60000, bygg: "Lilleakerveien 2 Garasje", kvm: 24, leietype: "Parkering", sfUrl: null },
  { id: "c27", kunde: "Demokunde 230 AS", signeringsdato: "2026-06-05", startdato: "2026-06-01", arsbelop: 60000, bygg: "Lilleakerveien 10", kvm: 24.4, leietype: "Parkering", sfUrl: null },
  { id: "c28", kunde: "Demokunde 174", signeringsdato: "2026-06-05", startdato: "2026-06-02", arsbelop: 27500, bygg: "Lilleakerveien 8", kvm: 11.7, leietype: "Parkering", sfUrl: null },
  { id: "c29", kunde: "Demokunde 141", signeringsdato: "2026-06-05", startdato: "2026-06-01", arsbelop: 27500, bygg: "Lilleakerveien 14", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c30", kunde: "Demokunde 231 AS", signeringsdato: "2026-06-01", startdato: "2026-06-01", arsbelop: 27500, bygg: "Lilleakerveien 14", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c31", kunde: "Demokunde 176", signeringsdato: "2026-06-01", startdato: "2026-07-16", arsbelop: 81198.32, bygg: "Lilleakerveien 2 Garasje", kvm: 42.1, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c32", kunde: "Demokunde 176", signeringsdato: "2026-05-29", startdato: "2026-07-16", arsbelop: 969224.43, bygg: "Lilleakerveien 2AB", kvm: 241.3, leietype: "Husleie", sfUrl: null },
  { id: "c33", kunde: "Demokunde 147", signeringsdato: "2026-05-29", startdato: "2026-07-01", arsbelop: 175800, bygg: "Lilleakerveien 26", kvm: 36.8, leietype: "Husleie", sfUrl: null },
  { id: "c34", kunde: "Demokunde 136", signeringsdato: "2026-05-29", startdato: "2026-06-01", arsbelop: 204000, bygg: "Lilleakerveien 26", kvm: 0, leietype: "Husleie", sfUrl: null },
  { id: "c35", kunde: "Demokunde 232 AS", signeringsdato: "2026-05-26", startdato: "2026-05-25", arsbelop: 27500, bygg: "Strandveien 10", kvm: 32.4, leietype: "Parkering", sfUrl: null },
  { id: "c36", kunde: "Demokunde 50", signeringsdato: "2026-05-19", startdato: "2026-06-01", arsbelop: 15158.5, bygg: "Lilleakerveien 14", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c37", kunde: "Demokunde 233 AS", signeringsdato: "2026-05-19", startdato: "2026-06-01", arsbelop: 19477.92, bygg: "Vollsveien 21", kvm: 0, leietype: "Parkering", sfUrl: null },
  { id: "c38", kunde: "Demokunde 155", signeringsdato: "2026-05-13", startdato: "2026-04-27", arsbelop: 30000, bygg: "Lilleakerveien 2 Garasje", kvm: 12, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c39", kunde: "Demokunde 112", signeringsdato: "2026-05-12", startdato: "2026-06-01", arsbelop: 183225, bygg: "Lilleakerveien 31", kvm: 94, leietype: "Kontorleie", sfUrl: null },
  { id: "c40", kunde: "Demokunde 146", signeringsdato: "2026-05-12", startdato: "2026-06-01", arsbelop: 180000, bygg: "Lilleakerveien 19", kvm: 54.2, leietype: "Husleie", sfUrl: null },
  { id: "c41", kunde: "Demokunde 234 AS", signeringsdato: "2026-05-12", startdato: "2026-05-11", arsbelop: 25000, bygg: "Vollsveien 13-19", kvm: 12.5, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c42", kunde: "Demokunde 235 AS", signeringsdato: "2026-05-08", startdato: "2026-06-01", arsbelop: 498167, bygg: "Lilleakerveien 2 Garasje", kvm: 233, leietype: "Rent Parking vat free flow", sfUrl: null },
  { id: "c43", kunde: "Demokunde 235 AS", signeringsdato: "2026-05-08", startdato: "2026-06-01", arsbelop: 116689, bygg: "Vollsveien 13-19", kvm: 62, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c44", kunde: "Demokunde 235 AS", signeringsdato: "2026-05-08", startdato: "2026-06-01", arsbelop: 216773, bygg: "Vollsveien 13-19", kvm: 150.1, leietype: "Rent Parking vat free flow", sfUrl: null },
  { id: "c45", kunde: "Demokunde 235 AS", signeringsdato: "2026-05-08", startdato: "2026-06-01", arsbelop: 246659, bygg: "Vollsveien 13D", kvm: 163.8, leietype: "Rent Parking vat free flow", sfUrl: null },
  { id: "c46", kunde: "Demokunde 235 AS", signeringsdato: "2026-05-08", startdato: "2026-06-01", arsbelop: 5495, bygg: "Lilleakerveien 2AB", kvm: 4.4, leietype: "Rent Storage vat", sfUrl: null },
  { id: "c47", kunde: "Demokunde 235 AS", signeringsdato: "2026-05-08", startdato: "2026-06-01", arsbelop: 2382092, bygg: "Lilleakerveien 2AB", kvm: 640.5, leietype: "Rent Office vat 856 m²", sfUrl: null },
  { id: "c48", kunde: "Demokunde 235 AS", signeringsdato: "2026-05-08", startdato: "2026-06-01", arsbelop: 1555596, bygg: "Lilleakerveien 2AB", kvm: 397.1, leietype: "Rent Office vat 559 m²", sfUrl: null },
  { id: "c49", kunde: "Demokunde 236 AS", signeringsdato: "2026-05-08", startdato: "2026-05-15", arsbelop: 235080, bygg: "Lilleakerveien 2E", kvm: 109.4, leietype: "Kontorleie", sfUrl: null },
  { id: "c50", kunde: "Demokunde 234 AS", signeringsdato: "2026-05-08", startdato: "2026-05-01", arsbelop: 172500, bygg: "Vollsveien 13-19", kvm: 57.4, leietype: "Kontorleie", sfUrl: null },
  { id: "c51", kunde: "Demokunde 135", signeringsdato: "2026-05-06", startdato: "2026-05-01", arsbelop: 204000, bygg: "Lilleakerveien 26", kvm: 0, leietype: "Husleie", sfUrl: null },
  { id: "c52", kunde: "Demokunde 229 AS", signeringsdato: "2026-05-06", startdato: "2026-06-01", arsbelop: 552600, bygg: "Lilleakerveien 2E", kvm: 256.6, leietype: "Kontorleie", sfUrl: null },
  { id: "c53", kunde: "Demokunde 230 AS", signeringsdato: "2026-05-06", startdato: "2026-06-01", arsbelop: 120000, bygg: "Lilleakerveien 4A", kvm: 22.4, leietype: "Kontorleie", sfUrl: null },
  { id: "c54", kunde: "Demokunde 143", signeringsdato: "2026-05-06", startdato: "2026-04-10", arsbelop: 204000, bygg: "Lilleakerveien 26", kvm: 0, leietype: "Husleie", sfUrl: null },
  { id: "c55", kunde: "Demokunde 226 AS", signeringsdato: "2026-05-04", startdato: "2026-05-11", arsbelop: 87960, bygg: "Lilleakerveien 16 mm", kvm: 10.1, leietype: "Husleie", sfUrl: null },
  { id: "c56", kunde: "Demokunde 233 AS", signeringsdato: "2026-04-23", startdato: "2026-06-01", arsbelop: 762508.49, bygg: "Vollsveien 13-19", kvm: 325.4, leietype: "Husleie/Garasje/El-bil", sfUrl: null },
  { id: "c57", kunde: "Demokunde 237", signeringsdato: "2026-04-17", startdato: "2026-04-13", arsbelop: 20000, bygg: "Lilleakerveien 2E", kvm: 12.4, leietype: "Husleie", sfUrl: null },
  { id: "c58", kunde: "Demokunde 148", signeringsdato: "2026-04-17", startdato: "2026-04-15", arsbelop: 30000, bygg: "Lilleakerveien 2E", kvm: 9.1, leietype: "Husleie", sfUrl: null },
  { id: "c59", kunde: "Demokunde 238 AS", signeringsdato: "2026-04-13", startdato: "2026-05-01", arsbelop: 79194.09, bygg: "Lilleakerveien 2CD", kvm: 11.3, leietype: "Kontorleie", sfUrl: null },
  { id: "c60", kunde: "Demokunde 202", signeringsdato: "2026-04-13", startdato: "2026-04-13", arsbelop: 283650, bygg: "Lilleakerveien 10", kvm: 144.5, leietype: "Garasje/El-bil/Lagerleie", sfUrl: null },
  { id: "c61", kunde: "Demokunde 239 AS", signeringsdato: "2026-04-13", startdato: "2026-04-01", arsbelop: 102750, bygg: "Lilleakerveien 31", kvm: 74.5, leietype: "Lagerleie", sfUrl: null },
  { id: "c62", kunde: "Demokunde 210", signeringsdato: "2026-04-13", startdato: "2026-03-01", arsbelop: 7950, bygg: "Lilleakerveien 4A", kvm: 3.6, leietype: "Lagerleie", sfUrl: null },
  { id: "c63", kunde: "Demokunde 240 AS", signeringsdato: "2026-04-13", startdato: "2026-03-01", arsbelop: 28142.03, bygg: "Lilleakerveien 2 Garasje", kvm: 12, leietype: "Parkering", sfUrl: null },
  { id: "c64", kunde: "Demokunde 240 AS", signeringsdato: "2026-04-13", startdato: "2026-03-01", arsbelop: 79194.09, bygg: "Lilleakerveien 2CD", kvm: 11.3, leietype: "Husleie", sfUrl: null },
  { id: "c65", kunde: "Demokunde 241 A/S", signeringsdato: "2026-04-07", startdato: "2026-04-01", arsbelop: 237500, bygg: "Vollsveien 13-19", kvm: 423.2, leietype: "Husleie", sfUrl: null },
  { id: "c66", kunde: "Demokunde 227 AS", signeringsdato: "2026-04-07", startdato: "2026-04-01", arsbelop: 189812.15, bygg: "Lilleakerveien 16 mm", kvm: 153.4, leietype: "Minimumsleie", sfUrl: null },
  { id: "c67", kunde: "Demokunde 242", signeringsdato: "2026-04-07", startdato: "2026-04-01", arsbelop: 120000, bygg: "Gamle Drammensvei 10", kvm: 12.4, leietype: "Husleie", sfUrl: null },
  { id: "c68", kunde: "Demokunde 95", signeringsdato: "2026-03-31", startdato: "2026-04-07", arsbelop: 900000, bygg: "Lilleakerveien 6", kvm: 827.7, leietype: "Leie/Minimumsleie", sfUrl: null },
  { id: "c69", kunde: "Demokunde 7", signeringsdato: "2026-03-31", startdato: "2026-04-01", arsbelop: 6000, bygg: "Lilleakerveien 2E", kvm: 12.4, leietype: "Lagerleie", sfUrl: null },
  { id: "c70", kunde: "Demokunde 243 AS", signeringsdato: "2026-03-30", startdato: "2026-04-01", arsbelop: 60000, bygg: "Lilleakerveien 2 Garasje", kvm: 24, leietype: "Parkering", sfUrl: null },
  { id: "c71", kunde: "Demokunde 244 AS", signeringsdato: "2026-03-30", startdato: "2026-03-01", arsbelop: 37000, bygg: "Vollsveien 13-19", kvm: 22.2, leietype: "Husleie/Lagerleie", sfUrl: null },
  { id: "c72", kunde: "Demokunde 244 AS", signeringsdato: "2026-03-30", startdato: "2026-03-01", arsbelop: 121140.57, bygg: "Vollsveien 13-19", kvm: 80, leietype: "Leie trimrom", sfUrl: null },
  { id: "c73", kunde: "Demokunde 231 AS", signeringsdato: "2026-03-14", startdato: "2026-02-16", arsbelop: 30000, bygg: "Lilleakerveien 2 Garasje", kvm: 12, leietype: "Parkering", sfUrl: null },
  { id: "c74", kunde: "Demokunde 74", signeringsdato: "2026-03-12", startdato: "2026-04-01", arsbelop: 568906.19, bygg: "Lilleakerveien 16 mm", kvm: 48.5, leietype: "Minimumsleie", sfUrl: null },
  { id: "c75", kunde: "Demokunde 245 AS", signeringsdato: "2026-03-12", startdato: "2026-03-09", arsbelop: 26000, bygg: "Vollsveien 13-19", kvm: 12.5, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c76", kunde: "Demokunde 246 AS", signeringsdato: "2026-03-12", startdato: "2026-03-09", arsbelop: 27500, bygg: "Lilleakerveien 14", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c77", kunde: "Demokunde 245 AS", signeringsdato: "2026-03-11", startdato: "2026-03-09", arsbelop: 26000, bygg: "Vollsveien 13-19", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c78", kunde: "Demokunde 245 AS", signeringsdato: "2026-03-06", startdato: "2026-03-09", arsbelop: 30000, bygg: "Lilleakerveien 2 Garasje", kvm: 12, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c79", kunde: "Demokunde 247 AS", signeringsdato: "2026-03-06", startdato: "2026-03-15", arsbelop: 60000, bygg: "Lilleakerveien 2E", kvm: 27.2, leietype: "Husleie", sfUrl: null },
  { id: "c80", kunde: "Demokunde 248 AS", signeringsdato: "2026-03-04", startdato: "2026-04-01", arsbelop: 12246.88, bygg: "Lilleakerveien 2E", kvm: 10.4, leietype: "Husleie", sfUrl: null },
  { id: "c81", kunde: "Demokunde 249 AS", signeringsdato: "2026-03-04", startdato: "2026-03-01", arsbelop: 496000, bygg: "Lilleakerveien 16 mm", kvm: 0, leietype: "Omsetingsleie Pop - up", sfUrl: null },
  { id: "c82", kunde: "Demokunde 250 AS", signeringsdato: "2026-03-04", startdato: "2026-03-01", arsbelop: 180000, bygg: "Lilleakerveien 4CDEF", kvm: 140.7, leietype: "Husleie", sfUrl: null },
  { id: "c83", kunde: "Demokunde 228 AS", signeringsdato: "2026-03-04", startdato: "2026-03-01", arsbelop: 685350, bygg: "Lilleakerveien 16 mm", kvm: 119.1, leietype: "Leie handel", sfUrl: null },
  { id: "c84", kunde: "Demokunde 245 AS", signeringsdato: "2026-02-27", startdato: "2026-03-01", arsbelop: 240000, bygg: "Lilleakerveien 2CD", kvm: 33.8, leietype: "Husleie", sfUrl: null },
  { id: "c85", kunde: "Demokunde 249 AS", signeringsdato: "2026-02-27", startdato: "2026-01-19", arsbelop: 25799.22, bygg: "Lilleakerveien 16 mm", kvm: 0, leietype: "Omsetningsleie Pop - up", sfUrl: null },
  { id: "c86", kunde: "Demokunde 141", signeringsdato: "2026-02-27", startdato: "2026-03-01", arsbelop: 1300000, bygg: "Lilleakerveien 16 mm", kvm: 327.1, leietype: "Parkering/Husleie/Uteareal", sfUrl: null },
  { id: "c87", kunde: "Demokunde 251 AS", signeringsdato: "2026-02-27", startdato: "2026-02-06", arsbelop: 118625, bygg: "Vollsveien 13-19", kvm: 67, leietype: "Husleie/Lagerleie", sfUrl: null },
  { id: "c88", kunde: "Demokunde 134", signeringsdato: "2026-02-26", startdato: "2026-02-01", arsbelop: 204000, bygg: "Lilleakerveien 26", kvm: 70.9, leietype: "Husleie", sfUrl: null },
  { id: "c89", kunde: "Demokunde 252 AS", signeringsdato: "2026-02-26", startdato: "2026-01-26", arsbelop: 30000, bygg: "Lilleakerveien 2 Garasje", kvm: 12, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c90", kunde: "Demokunde 251 AS", signeringsdato: "2026-02-26", startdato: "2026-02-10", arsbelop: 52000, bygg: "Vollsveien 21", kvm: 25, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c91", kunde: "Demokunde 231 AS", signeringsdato: "2026-02-26", startdato: "2026-02-01", arsbelop: 805000, bygg: "Lilleakerveien 2AB", kvm: 172.8, leietype: "Husleie", sfUrl: null },
  { id: "c92", kunde: "Demokunde 202", signeringsdato: "2026-02-26", startdato: "2026-03-01", arsbelop: 621230, bygg: "Lilleakerveien 4A", kvm: 175.4, leietype: "Husleie", sfUrl: null },
  { id: "c93", kunde: "Demokunde 253", signeringsdato: "2026-02-26", startdato: "2026-02-16", arsbelop: 800, bygg: "Vollsveien 13-19", kvm: 19.8, leietype: "Lagerleie", sfUrl: null },
  { id: "c94", kunde: "Demokunde 119", signeringsdato: "2026-02-26", startdato: "2026-01-26", arsbelop: 156600, bygg: "Lilleakerveien 16 mm", kvm: 21, leietype: "Husleie", sfUrl: null },
  { id: "c95", kunde: "Demokunde 254 AS", signeringsdato: "2026-02-26", startdato: "2026-02-01", arsbelop: 79084, bygg: "Lilleakerveien 2CD", kvm: 11.3, leietype: "Husleie", sfUrl: null },
  { id: "c96", kunde: "Demokunde 255 AS", signeringsdato: "2026-02-26", startdato: "2026-03-01", arsbelop: 554000, bygg: "Lilleakerveien 2E", kvm: 256.8, leietype: "Husleie", sfUrl: null },
  { id: "c97", kunde: "Demokunde 217", signeringsdato: "2026-02-25", startdato: "2026-01-01", arsbelop: 26170, bygg: "Lilleakerveien 14", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c98", kunde: "Demokunde 199", signeringsdato: "2026-02-23", startdato: "2026-01-01", arsbelop: 41689, bygg: "Vollsveien 13-19", kvm: 28.6, leietype: "Lagerleie", sfUrl: null },
  { id: "c99", kunde: "Demokunde 256 AS", signeringsdato: "2026-02-22", startdato: "2026-04-01", arsbelop: 317840.06, bygg: "Lilleakerveien 16 mm", kvm: 29.6, leietype: "Husleie", sfUrl: null },
  { id: "c100", kunde: "Demokunde 257 AS", signeringsdato: "2026-02-22", startdato: "2026-03-01", arsbelop: 92400, bygg: "Vollsveien 13-19", kvm: 11, leietype: "Husleie", sfUrl: null },
  { id: "c101", kunde: "Demokunde 258 AS", signeringsdato: "2026-02-19", startdato: "2026-01-01", arsbelop: 52000, bygg: "Vollsveien 13-19", kvm: 25, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c102", kunde: "Demokunde 54", signeringsdato: "2026-02-19", startdato: "2026-01-10", arsbelop: 26000, bygg: "Vollsveien 13D", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c103", kunde: "Demokunde 259", signeringsdato: "2026-02-18", startdato: "2026-01-01", arsbelop: 82183, bygg: "Lilleakerveien 31", kvm: 37.9, leietype: "Husleie/Garasje/El-bil", sfUrl: null },
  { id: "c104", kunde: "Demokunde 260 AS", signeringsdato: "2026-02-18", startdato: "2026-01-01", arsbelop: 47288, bygg: "P-bro mellom LV8 og LV4", kvm: 24.6, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c105", kunde: "Demokunde 261 AS", signeringsdato: "2026-02-17", startdato: "2026-01-01", arsbelop: 427959.11, bygg: "Lilleakerveien 16 mm", kvm: 131.9, leietype: "Husleie", sfUrl: null },
  { id: "c106", kunde: "Demokunde 262", signeringsdato: "2026-02-10", startdato: "2026-01-01", arsbelop: 3002716.54, bygg: "Lilleakerveien 16 mm", kvm: 1237.7, leietype: "Husleie", sfUrl: null },
  { id: "c107", kunde: "Demokunde 13", signeringsdato: "2026-02-10", startdato: "2026-01-01", arsbelop: 1152162, bygg: "Lilleakerveien 2E", kvm: 304.3, leietype: "Husleie/Minimumsleie", sfUrl: null },
  { id: "c108", kunde: "Demokunde 263 AS", signeringsdato: "2026-02-10", startdato: "2026-02-01", arsbelop: 70800, bygg: "Lilleakerveien 31", kvm: 10.3, leietype: "Husleie", sfUrl: null },
  { id: "c109", kunde: "Demokunde 264 AS", signeringsdato: "2026-02-10", startdato: "2026-01-01", arsbelop: 0.1, bygg: "Lilleakerveien 16 mm", kvm: 0, leietype: "Omsetningsleie", sfUrl: null },
  { id: "c110", kunde: "Demokunde 265", signeringsdato: "2026-02-09", startdato: "2026-01-01", arsbelop: 73040.4, bygg: "Lilleakerveien 2E", kvm: 50.8, leietype: "Lagerleie", sfUrl: null },
  { id: "c111", kunde: "Demokunde 265", signeringsdato: "2026-02-09", startdato: "2026-01-01", arsbelop: 92451.39, bygg: "Lilleakerveien 2E", kvm: 79.2, leietype: "Husleie", sfUrl: null },
  { id: "c112", kunde: "Demokunde 266 AS", signeringsdato: "2026-02-09", startdato: "2026-02-01", arsbelop: 282293, bygg: "Lilleakerveien 31", kvm: 116.3, leietype: "Husleie", sfUrl: null },
  { id: "c113", kunde: "Demokunde 205", signeringsdato: "2026-02-09", startdato: "2026-01-07", arsbelop: 90000, bygg: "Lilleakerveien 2 Garasje", kvm: 22.7, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c114", kunde: "Demokunde 267 AS", signeringsdato: "2026-02-09", startdato: "2026-01-01", arsbelop: 98550, bygg: "Lilleakerveien 31", kvm: 44.1, leietype: "Husleie/Lagerleie", sfUrl: null },
  { id: "c115", kunde: "Demokunde 268 AS", signeringsdato: "2026-02-09", startdato: "2026-02-01", arsbelop: 84000, bygg: "Lilleakerveien 2CD", kvm: 11.3, leietype: "Husleie", sfUrl: null },
  { id: "c116", kunde: "Demokunde 269 AS", signeringsdato: "2026-02-09", startdato: "2026-01-01", arsbelop: 63450, bygg: "Lilleakerveien 16 mm", kvm: 0, leietype: "Parkering", sfUrl: null },
  { id: "c117", kunde: "Demokunde 270 AS", signeringsdato: "2026-02-09", startdato: "2026-02-01", arsbelop: 180000, bygg: "Vollsveien 21", kvm: 25.1, leietype: "Husleie", sfUrl: null },
  { id: "c118", kunde: "Demokunde 271 AS", signeringsdato: "2026-02-08", startdato: "2025-12-31", arsbelop: 56000, bygg: "Lilleakerveien 31", kvm: 26, leietype: "Parkering", sfUrl: null },
  { id: "c119", kunde: "Demokunde 271 AS", signeringsdato: "2026-02-08", startdato: "2025-12-31", arsbelop: 121368, bygg: "Lilleakerveien 31", kvm: 33.9, leietype: "Husleie/Kontorleie", sfUrl: null },
  { id: "c120", kunde: "Demokunde 272 A/S", signeringsdato: "2026-02-08", startdato: "2026-01-01", arsbelop: 1552000, bygg: "Lilleakerveien 14", kvm: 465.7, leietype: "Minimumsleie/Lagerleie", sfUrl: null },
  { id: "c121", kunde: "Demokunde 273 AS", signeringsdato: "2026-02-08", startdato: "2026-01-01", arsbelop: 269587, bygg: "Lilleakerveien 31", kvm: 43.9, leietype: "Husleie", sfUrl: null },
  { id: "c122", kunde: "Demokunde 78", signeringsdato: "2026-02-08", startdato: "2026-01-08", arsbelop: 28000, bygg: "Lilleakerveien 2 Garasje", kvm: 11.5, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c123", kunde: "Demokunde 78", signeringsdato: "2026-02-08", startdato: "2026-01-06", arsbelop: 84000, bygg: "Lilleakerveien 2CD", kvm: 11.3, leietype: "Husleie", sfUrl: null },
  { id: "c124", kunde: "Demokunde 38", signeringsdato: "2026-02-08", startdato: "2026-01-01", arsbelop: 501415.45, bygg: "Lilleakerveien 16 mm", kvm: 115.2, leietype: "Husleie", sfUrl: null },
  { id: "c125", kunde: "Demokunde 219", signeringsdato: "2026-02-08", startdato: "2026-01-01", arsbelop: 26496.69, bygg: "Lilleakerveien 14", kvm: 12.5, leietype: "Parkering", sfUrl: null },
  { id: "c126", kunde: "Demokunde 219", signeringsdato: "2026-02-08", startdato: "2026-01-01", arsbelop: 1680000, bygg: "Lilleakerveien 16 mm", kvm: 154.3, leietype: "Husleie", sfUrl: null },
  { id: "c127", kunde: "Demokunde 34", signeringsdato: "2026-02-07", startdato: "2026-01-01", arsbelop: 28672.55, bygg: "Lilleakerveien 16 mm", kvm: 21, leietype: "Parkering", sfUrl: null },
  { id: "c128", kunde: "Demokunde 34", signeringsdato: "2026-02-07", startdato: "2026-01-01", arsbelop: 4237064.7, bygg: "Lilleakerveien 16 mm", kvm: 1177.8, leietype: "Butikkleie/Minimumsleie/Lagerleie", sfUrl: null },
  { id: "c129", kunde: "Demokunde 91", signeringsdato: "2026-02-07", startdato: "2026-01-01", arsbelop: 52578.12, bygg: "Lilleakerveien 2 Garasje", kvm: 24, leietype: "Parkering", sfUrl: null },
  { id: "c130", kunde: "Demokunde 223 AS", signeringsdato: "2026-02-07", startdato: "2026-01-12", arsbelop: 480000, bygg: "Lilleakerveien 2E", kvm: 225.7, leietype: "Husleie", sfUrl: null },
  { id: "c131", kunde: "Demokunde 274", signeringsdato: "2026-02-07", startdato: "2026-01-01", arsbelop: 30000, bygg: "Lilleakerveien 2 Garasje", kvm: 12, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c132", kunde: "Demokunde 274", signeringsdato: "2026-02-06", startdato: "2026-01-01", arsbelop: 30000, bygg: "Lilleakerveien 2 Garasje", kvm: 13, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c133", kunde: "Demokunde 91", signeringsdato: "2026-02-06", startdato: "2026-01-01", arsbelop: 314422.59, bygg: "Lilleakerveien 2CD", kvm: 113.7, leietype: "Husleie/Lagerleie", sfUrl: null },
  { id: "c134", kunde: "Demokunde 274", signeringsdato: "2026-02-06", startdato: "2026-01-01", arsbelop: 88580.93, bygg: "Lilleakerveien 2E", kvm: 85.3, leietype: "Husleie", sfUrl: null },
  { id: "c135", kunde: "Demokunde 274", signeringsdato: "2026-02-06", startdato: "2026-01-01", arsbelop: 42664.64, bygg: "Lilleakerveien 2E", kvm: 28.4, leietype: "Lagerleie", sfUrl: null },
  { id: "c136", kunde: "Demokunde 266 AS", signeringsdato: "2026-02-05", startdato: "2026-02-01", arsbelop: 25000, bygg: "Lilleakerveien 31", kvm: 12.2, leietype: "Garasje/El-bil", sfUrl: null },
  { id: "c137", kunde: "Demokunde 275", signeringsdato: "2026-02-05", startdato: "2026-01-01", arsbelop: 25683, bygg: "Lilleakerveien 2E", kvm: 9.6, leietype: "Kontorleie", sfUrl: null },
  { id: "c138", kunde: "Demokunde 276 AS", signeringsdato: "2026-01-16", startdato: "2025-11-17", arsbelop: 50326.56, bygg: "Vollsveien 13-19", kvm: 25, leietype: "Parkering", sfUrl: null },
  { id: "c139", kunde: "Demokunde 277 AS", signeringsdato: "2026-01-16", startdato: "2026-01-01", arsbelop: 75000, bygg: "Vollsveien 13-19", kvm: 37.5, leietype: "Parkering", sfUrl: null },
];

export type GuaranteeStatus = "Mangler" | "Forespurt" | "Kommer";

export interface Guarantee {
  id: string;
  status: GuaranteeStatus;
  leietaker: string;
  belop: number | null;
  frist: string;
}

/**
 * MIDLERTIDIG ANONYMISERT — se merknad over CONTRACTS. Beløp/frister ekte (fra Asana,
 * hentet 2026-08-10), leietakernavn byttet til "Demokunde N". `id` posisjonsbasert (g1, g2, ...).
 */
export const GUARANTEE_TOTAL = 5;
export const GUARANTEES: Guarantee[] = [
  { id: "g1", status: "Mangler", leietaker: "Demokunde 6 (Lv2C)", belop: null, frist: "2026-08-01" },
  { id: "g2", status: "Mangler", leietaker: "Demokunde 7 (Lv19)", belop: null, frist: "2026-08-01" },
  { id: "g3", status: "Mangler", leietaker: "Demokunde 8 (Lv4A)", belop: null, frist: "2026-08-15" },
  { id: "g4", status: "Mangler", leietaker: "Demokunde 9 (Lv2B)", belop: null, frist: "2026-09-01" },
  { id: "g5", status: "Mangler", leietaker: "Demokunde 10 (Vollsveien 17)", belop: null, frist: "2026-09-04" },
];

export interface ReceivableInvoice {
  fakturaNr?: string;
  belop: number;
  forfallsdato: string;
  underInkasso?: boolean;
}

export interface ReceivableCompany {
  selskap: string;
  belop: number;
  antallLinjer: number;
  underInkasso?: boolean;
  fakturaer: ReceivableInvoice[];
}

export interface Receivable {
  id: string;
  leietaker: string;
  utestaende: number;
  selskaper: ReceivableCompany[];
}

/**
 * MIDLERTIDIG ANONYMISERT — se merknad over CONTRACTS. Beløp/selskapsnavn/inkassostatus/
 * fakturanummer ekte (fra Visma Business NXT, hentet 2026-08-14, ALLE 22 Mustad-selskaper),
 * leietakernavn byttet til "Demokunde N" — samme nummer gjenbrukt der leietakeren allerede
 * opptrer i CONTRACTS/GUARANTEES/EXPIRIES (Demokunde 1, 7, 9, 11, 12, 13, 15, 16, 18, 20, 21,
 * 24, 29 — se lib/widgets.local.ts for hvilken ekte leietaker hvert nummer tilsvarer; navnene
 * skal IKKE stå i denne filen). Nye leietakere denne runden er nummerert 30–219.
 * Aldersfordeling (ikke forfalt/0-30/31-60/61-90/91+ dager) beregnes live fra fakturaenes
 * forfallsdato, se lib/receivablesAging.ts — ikke lagret som eget felt her. `id` er
 * posisjonsbasert (r1, r2, ...), sortert etter størst utestående først.
 */
export const RECEIVABLES: Receivable[] = [
  { id: "r1", leietaker: "Demokunde 30", utestaende: 5262199.59, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 5262199.59, antallLinjer: 1, fakturaer: [{ fakturaNr: "24441", belop: 5262199.59, forfallsdato: "2026-05-30" }] }] },
  { id: "r2", leietaker: "Demokunde 31", utestaende: 3102881.05, selskaper: [{ selskap: "B3 Lilleaker Eiendom AS", belop: 3102881.05, antallLinjer: 3, fakturaer: [{ fakturaNr: "1000009", belop: 471689.4, forfallsdato: "2026-03-15" }, { fakturaNr: "1000008", belop: 2188524.73, forfallsdato: "2026-01-30" }, { fakturaNr: "1000007", belop: 442666.92, forfallsdato: "2025-09-20" }] }] },
  { id: "r3", leietaker: "Demokunde 32", utestaende: 2936250, selskaper: [{ selskap: "Vollsveien 9-11 AS", belop: 2936250, antallLinjer: 1, fakturaer: [{ fakturaNr: "6", belop: 2936250, forfallsdato: "2026-08-31" }] }] },
  { id: "r4", leietaker: "Demokunde 12", utestaende: 1693098.92, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 1585743.18, antallLinjer: 4, underInkasso: true, fakturaer: [{ fakturaNr: "25238", belop: 527214.66, forfallsdato: "2026-09-01" }, { fakturaNr: "25179", belop: 527214.66, forfallsdato: "2026-08-01" }, { fakturaNr: "25192", belop: 527214.66, forfallsdato: "2026-07-24" }, { fakturaNr: "24702", belop: 4099.2, forfallsdato: "2026-06-16", underInkasso: true }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 97131.74, antallLinjer: 1, fakturaer: [{ fakturaNr: "24866", belop: 97131.74, forfallsdato: "2026-09-01" }] }, { selskap: "Lilleaker Service AS", belop: 10224, antallLinjer: 1, fakturaer: [{ fakturaNr: "24689", belop: 10224, forfallsdato: "2026-08-15" }] }] },
  { id: "r5", leietaker: "Demokunde 11", utestaende: 1619507.9, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 1619507.9, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "35324", belop: 1619507.9, forfallsdato: "2024-04-01", underInkasso: true }] }] },
  { id: "r6", leietaker: "Demokunde 13", utestaende: 854163.09, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 854163.09, antallLinjer: 10, underInkasso: true, fakturaer: [{ fakturaNr: "25259", belop: 117533.75, forfallsdato: "2026-09-01" }, { fakturaNr: "24679", belop: 110338.15, forfallsdato: "2026-06-16", underInkasso: true }, { fakturaNr: "24509", belop: 120486.19, forfallsdato: "2026-05-14", underInkasso: true }, { fakturaNr: "40288", belop: 7196, forfallsdato: "2026-03-01", underInkasso: true }, { fakturaNr: "40287", belop: 7196, forfallsdato: "2026-02-01", underInkasso: true }, { fakturaNr: "39671", belop: 153084, forfallsdato: "2026-01-01", underInkasso: true }, { fakturaNr: "39804", belop: 44543, forfallsdato: "2025-11-10", underInkasso: true }, { fakturaNr: "39805", belop: 231151, forfallsdato: "2025-11-10", underInkasso: true }, { belop: -7813, forfallsdato: "2025-09-24", underInkasso: true }, { fakturaNr: "34650", belop: 70448, forfallsdato: "2024-09-01", underInkasso: true }] }] },
  { id: "r7", leietaker: "Demokunde 33", utestaende: 853834.36, selskaper: [{ selskap: "Lilleakerveien 14 AS", belop: 822870, antallLinjer: 5, underInkasso: true, fakturaer: [{ fakturaNr: "24071", belop: 164574, forfallsdato: "2026-09-01" }, { fakturaNr: "24069", belop: 164574, forfallsdato: "2026-08-01" }, { fakturaNr: "24058", belop: 164574, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24031", belop: 164574, forfallsdato: "2026-06-01", underInkasso: true }, { fakturaNr: "63021", belop: 164574, forfallsdato: "2026-03-01", underInkasso: true }] }, { selskap: "CC Vest Stormarked AS", belop: 30964.36, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24529", belop: 15482.18, forfallsdato: "2026-09-01" }, { fakturaNr: "24486", belop: 15482.18, forfallsdato: "2026-08-01", underInkasso: true }] }] },
  { id: "r8", leietaker: "Demokunde 34", utestaende: 700270.42, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 441360.91, antallLinjer: 1, fakturaer: [{ fakturaNr: "25236", belop: 441360.91, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 258909.51, antallLinjer: 1, fakturaer: [{ fakturaNr: "24532", belop: 258909.51, forfallsdato: "2026-09-01" }] }] },
  { id: "r9", leietaker: "Demokunde 35", utestaende: 691676.58, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 494012.38, antallLinjer: 1, fakturaer: [{ fakturaNr: "25243", belop: 494012.38, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 195887.74, antallLinjer: 1, fakturaer: [{ fakturaNr: "24516", belop: 195887.74, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 1776.46, antallLinjer: 1, fakturaer: [{ fakturaNr: "24876", belop: 1776.46, forfallsdato: "2026-09-01" }] }] },
  { id: "r10", leietaker: "Demokunde 36", utestaende: 690975.87, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 352613.67, antallLinjer: 10, underInkasso: true, fakturaer: [{ fakturaNr: "24124", belop: 32000, forfallsdato: "2026-09-01" }, { fakturaNr: "233", belop: 2388.67, forfallsdato: "2024-02-01", underInkasso: true }, { fakturaNr: "88", belop: 35392, forfallsdato: "2023-05-01", underInkasso: true }, { fakturaNr: "1029", belop: 85019, forfallsdato: "2023-04-30", underInkasso: true }, { fakturaNr: "79", belop: 35392, forfallsdato: "2023-04-01", underInkasso: true }, { fakturaNr: "38", belop: 35392, forfallsdato: "2023-03-01", underInkasso: true }, { fakturaNr: "37", belop: 35392, forfallsdato: "2023-02-01", underInkasso: true }, { belop: 37467, forfallsdato: "2023-01-15" }, { belop: 18779, forfallsdato: "2023-01-15" }, { fakturaNr: "36", belop: 35392, forfallsdato: "2023-01-01", underInkasso: true }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 338362.2, antallLinjer: 13, underInkasso: true, fakturaer: [{ fakturaNr: "24869", belop: 9953.24, forfallsdato: "2026-09-01" }, { fakturaNr: "24816", belop: 9953.24, forfallsdato: "2026-08-01" }, { fakturaNr: "24644", belop: 9953.24, forfallsdato: "2026-07-01" }, { fakturaNr: "24487", belop: 9953.24, forfallsdato: "2026-06-01" }, { fakturaNr: "24350", belop: 9953.24, forfallsdato: "2026-05-14" }, { fakturaNr: "50537", belop: 9954, forfallsdato: "2026-03-01" }, { fakturaNr: "24036", belop: 118275, forfallsdato: "2024-07-29", underInkasso: true }, { fakturaNr: "23705", belop: 63594, forfallsdato: "2024-07-02" }, { fakturaNr: "23325", belop: 57813, forfallsdato: "2024-04-01" }, { fakturaNr: "22423", belop: 9740, forfallsdato: "2023-09-01", underInkasso: true }, { fakturaNr: "22421", belop: 9740, forfallsdato: "2023-08-18", underInkasso: true }, { fakturaNr: "22422", belop: 9740, forfallsdato: "2023-08-18", underInkasso: true }, { fakturaNr: "21797", belop: 9740, forfallsdato: "2023-05-02" }] }] },
  { id: "r11", leietaker: "Demokunde 37", utestaende: 690114.16, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 468788.66, antallLinjer: 2, fakturaer: [{ fakturaNr: "25248", belop: 314734.63, forfallsdato: "2026-09-01" }, { fakturaNr: "25094", belop: 154054.03, forfallsdato: "2026-07-15" }] }, { selskap: "CC Vest Stormarked AS", belop: 221325.5, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24517", belop: 206445.1, forfallsdato: "2026-09-01" }, { fakturaNr: "24456", belop: 14880.4, forfallsdato: "2026-07-15", underInkasso: true }] }] },
  { id: "r12", leietaker: "Demokunde 15", utestaende: 661223.31, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 640746.31, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24774", belop: 640746.31, forfallsdato: "2026-07-01", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 20477, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24681", belop: 4377.5, forfallsdato: "2026-08-15" }, { fakturaNr: "24562", belop: 16099.5, forfallsdato: "2026-07-15", underInkasso: true }] }] },
  { id: "r13", leietaker: "Demokunde 38", utestaende: 654656.12, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 522770.82, antallLinjer: 4, underInkasso: true, fakturaer: [{ fakturaNr: "25011", belop: 179351.41, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24657", belop: 15284.71, forfallsdato: "2026-06-16", underInkasso: true }, { fakturaNr: "24461", belop: 164066.7, forfallsdato: "2026-05-14", underInkasso: true }, { fakturaNr: "40437", belop: 164068, forfallsdato: "2026-02-02", underInkasso: true }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 116600.3, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24638", belop: 58300.15, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24376", belop: 58300.15, forfallsdato: "2026-05-14", underInkasso: true }] }, { selskap: "CC Vest Stormarked AS", belop: 15285, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "26202", belop: 15285, forfallsdato: "2026-02-01", underInkasso: true }] }] },
  { id: "r14", leietaker: "Demokunde 39", utestaende: 494436.3, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 306716.3, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24474", belop: 306716.3, forfallsdato: "2026-05-30", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 181470, antallLinjer: 3, underInkasso: true, fakturaer: [{ fakturaNr: "24646", belop: 2720, forfallsdato: "2026-08-15" }, { fakturaNr: "24530", belop: 89375, forfallsdato: "2026-07-06", underInkasso: true }, { fakturaNr: "24540", belop: 89375, forfallsdato: "2026-07-06", underInkasso: true }] }, { selskap: "Mustad Eiendom AS", belop: 6250, antallLinjer: 1, fakturaer: [{ fakturaNr: "25312", belop: 6250, forfallsdato: "2026-08-26" }] }] },
  { id: "r15", leietaker: "Demokunde 40", utestaende: 489393.55, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 342097.51, antallLinjer: 3, fakturaer: [{ fakturaNr: "25258", belop: 317416.33, forfallsdato: "2026-09-01" }, { fakturaNr: "25306", belop: 12340.59, forfallsdato: "2026-09-01" }, { fakturaNr: "25295", belop: 12340.59, forfallsdato: "2026-08-21" }] }, { selskap: "CC Vest Stormarked AS", belop: 147296.04, antallLinjer: 1, fakturaer: [{ fakturaNr: "24518", belop: 147296.04, forfallsdato: "2026-09-01" }] }] },
  { id: "r16", leietaker: "Demokunde 41", utestaende: 459876.05, selskaper: [{ selskap: "Lilleaker Service AS", belop: 335147.5, antallLinjer: 2, fakturaer: [{ fakturaNr: "24695", belop: 301875, forfallsdato: "2026-09-09" }, { fakturaNr: "24693", belop: 33272.5, forfallsdato: "2026-08-30" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 124728.55, antallLinjer: 9, fakturaer: [{ fakturaNr: "24853", belop: 117430.95, forfallsdato: "2026-08-21" }, { fakturaNr: "24588", belop: -60538.99, forfallsdato: "2026-07-12" }, { fakturaNr: "24588", belop: -60538.99, forfallsdato: "2026-07-12" }, { fakturaNr: "24548", belop: -265649.9, forfallsdato: "2026-06-04" }, { fakturaNr: "24512", belop: -46052.54, forfallsdato: "2026-05-31" }, { fakturaNr: "50447", belop: 61275, forfallsdato: "2026-01-01" }, { fakturaNr: "50562", belop: 21214, forfallsdato: "2026-01-01" }, { fakturaNr: "50567", belop: 355290, forfallsdato: "2026-01-01" }, { fakturaNr: "4683", belop: 2298.94, forfallsdato: "2025-04-13" }] }] },
  { id: "r17", leietaker: "Demokunde 42", utestaende: 396216.21, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 263947.33, antallLinjer: 1, fakturaer: [{ fakturaNr: "25260", belop: 263947.33, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 132268.88, antallLinjer: 1, fakturaer: [{ fakturaNr: "24522", belop: 132268.88, forfallsdato: "2026-09-01" }] }] },
  { id: "r18", leietaker: "Demokunde 43", utestaende: 330161.89, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 330161.89, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24103", belop: 330161.89, forfallsdato: "2026-07-01", underInkasso: true }] }] },
  { id: "r19", leietaker: "Demokunde 44", utestaende: 316804.76, selskaper: [{ selskap: "Lilleaker Service AS", belop: 157901.6, antallLinjer: 8, underInkasso: true, fakturaer: [{ fakturaNr: "24636", belop: 4592.5, forfallsdato: "2026-08-15" }, { fakturaNr: "24623", belop: 13980, forfallsdato: "2026-07-15" }, { fakturaNr: "24514", belop: 39000, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24376", belop: 9763, forfallsdato: "2026-06-15" }, { fakturaNr: "24334", belop: 23140, forfallsdato: "2026-05-31", underInkasso: true }, { fakturaNr: "24260", belop: 11792.1, forfallsdato: "2026-05-15", underInkasso: true }, { fakturaNr: "24167", belop: 16634, forfallsdato: "2026-04-15", underInkasso: true }, { fakturaNr: "24008", belop: 39000, forfallsdato: "2026-04-01", underInkasso: true }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 130400.16, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24159", belop: 8943.86, forfallsdato: "2026-04-27", underInkasso: true }, { fakturaNr: "24010", belop: 121456.3, forfallsdato: "2026-04-01", underInkasso: true }] }, { selskap: "Mustad Eiendom AS", belop: 28503, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "40449", belop: 28503, forfallsdato: "2026-02-04", underInkasso: true }] }] },
  { id: "r20", leietaker: "Demokunde 45", utestaende: 294500.23, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 160698.19, antallLinjer: 3, fakturaer: [{ fakturaNr: "25256", belop: 160698.19, forfallsdato: "2026-09-01" }, { fakturaNr: "25298", belop: -365873.2, forfallsdato: "2026-08-21" }, { fakturaNr: "25106", belop: 365873.2, forfallsdato: "2026-07-15" }] }, { selskap: "CC Vest Stormarked AS", belop: 133802.04, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24519", belop: 54367.94, forfallsdato: "2026-09-01" }, { fakturaNr: "24465", belop: 79434.1, forfallsdato: "2026-07-15", underInkasso: true }] }] },
  { id: "r21", leietaker: "Demokunde 46", utestaende: 290008.52, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 255085.52, antallLinjer: 4, underInkasso: true, fakturaer: [{ fakturaNr: "25257", belop: 128444.56, forfallsdato: "2026-09-01" }, { fakturaNr: "25169", belop: 26539.16, forfallsdato: "2026-08-01" }, { fakturaNr: "25038", belop: 101905.4, forfallsdato: "2026-06-25", underInkasso: true }, { belop: -1803.6, forfallsdato: "2026-06-25" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 34923, antallLinjer: 1, fakturaer: [{ fakturaNr: "24873", belop: 34923, forfallsdato: "2026-09-01" }] }] },
  { id: "r22", leietaker: "Demokunde 47", utestaende: 288856.75, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 288856.75, antallLinjer: 7, underInkasso: true, fakturaer: [{ fakturaNr: "24774", belop: 113641.75, forfallsdato: "2026-06-30" }, { fakturaNr: "25304", belop: 8500, forfallsdato: "2025-09-01", underInkasso: true }, { fakturaNr: "25061", belop: 33343, forfallsdato: "2025-05-01", underInkasso: true }, { fakturaNr: "25060", belop: 33343, forfallsdato: "2025-04-01" }, { fakturaNr: "25059", belop: 33343, forfallsdato: "2025-03-25" }, { fakturaNr: "24802", belop: 33343, forfallsdato: "2025-03-11" }, { fakturaNr: "24803", belop: 33343, forfallsdato: "2025-03-11" }] }] },
  { id: "r23", leietaker: "Demokunde 48", utestaende: 284917.27, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 164257.74, antallLinjer: 1, fakturaer: [{ fakturaNr: "25247", belop: 164257.74, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 120659.53, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24527", belop: 119615.26, forfallsdato: "2026-09-01" }, { fakturaNr: "24176", belop: 1044.27, forfallsdato: "2026-06-01", underInkasso: true }] }] },
  { id: "r24", leietaker: "Demokunde 49", utestaende: 259865.24, selskaper: [{ selskap: "Lilleakerveien 14 AS", belop: 152423.18, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24056", belop: 152423.18, forfallsdato: "2026-07-01", underInkasso: true }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 107034.06, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24694", belop: 107034.06, forfallsdato: "2026-07-01", underInkasso: true }] }, { selskap: "CC Vest Stormarked AS", belop: 408, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "26049", belop: 408, forfallsdato: "2025-11-11", underInkasso: true }] }] },
  { id: "r25", leietaker: "Demokunde 50", utestaende: 253000.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 197217.46, antallLinjer: 3, fakturaer: [{ fakturaNr: "25233", belop: 1579.01, forfallsdato: "2026-09-01" }, { fakturaNr: "25128", belop: 127031.45, forfallsdato: "2026-08-01" }, { fakturaNr: "25115", belop: 68607, forfallsdato: "2026-07-15" }] }, { selskap: "CC Vest Stormarked AS", belop: 54204.03, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24487", belop: 44347.24, forfallsdato: "2026-08-01", underInkasso: true }, { fakturaNr: "24356", belop: 9856.79, forfallsdato: "2026-07-01", underInkasso: true }] }, { selskap: "Lilleakerveien 14 AS", belop: 1579.01, antallLinjer: 1, fakturaer: [{ fakturaNr: "24072", belop: 1579.01, forfallsdato: "2026-09-01" }] }] },
  { id: "r26", leietaker: "Demokunde 51", utestaende: 251702.68, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 251650.68, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24297", belop: 251650.68, forfallsdato: "2026-05-29", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 52, antallLinjer: 1, fakturaer: [{ fakturaNr: "24677", belop: 52, forfallsdato: "2026-08-15" }] }] },
  { id: "r27", leietaker: "Demokunde 52", utestaende: 246705.77, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 226474.84, antallLinjer: 6, fakturaer: [{ fakturaNr: "25087", belop: -17289.09, forfallsdato: "2026-07-14" }, { fakturaNr: "25088", belop: 5585.71, forfallsdato: "2026-07-14" }, { fakturaNr: "24871", belop: 104847.68, forfallsdato: "2026-07-01" }, { fakturaNr: "25027", belop: 53723.92, forfallsdato: "2026-06-25" }, { fakturaNr: "24700", belop: 57608.62, forfallsdato: "2026-06-16" }, { fakturaNr: "39743", belop: 21998, forfallsdato: "2025-10-13" }] }, { selskap: "CC Vest Stormarked AS", belop: 20230.93, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24440", belop: 721.24, forfallsdato: "2026-07-02", underInkasso: true }, { fakturaNr: "24445", belop: 19509.69, forfallsdato: "2026-07-02", underInkasso: true }] }] },
  { id: "r28", leietaker: "Demokunde 53", utestaende: 226274.02, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 168351.33, antallLinjer: 1, fakturaer: [{ fakturaNr: "25255", belop: 168351.33, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 57922.69, antallLinjer: 1, fakturaer: [{ fakturaNr: "24535", belop: 57922.69, forfallsdato: "2026-09-01" }] }] },
  { id: "r29", leietaker: "Demokunde 54", utestaende: 223507.84, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 143801.25, antallLinjer: 1, fakturaer: [{ fakturaNr: "25268", belop: 143801.25, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 79706.59, antallLinjer: 1, fakturaer: [{ fakturaNr: "24528", belop: 79706.59, forfallsdato: "2026-09-01" }] }] },
  { id: "r30", leietaker: "Demokunde 55", utestaende: 213597.61, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 152691.7, antallLinjer: 1, fakturaer: [{ fakturaNr: "25244", belop: 152691.7, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 60905.91, antallLinjer: 1, fakturaer: [{ fakturaNr: "24533", belop: 60905.91, forfallsdato: "2026-09-01" }] }] },
  { id: "r31", leietaker: "Demokunde 56", utestaende: 194056.36, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 121685.05, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24310", belop: 21491.01, forfallsdato: "2026-08-31", underInkasso: true }, { fakturaNr: "24643", belop: 100194.04, forfallsdato: "2026-08-31", underInkasso: true }] }, { selskap: "Mustad Eiendom AS", belop: 72371.31, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24797", belop: 72371.31, forfallsdato: "2026-08-31", underInkasso: true }] }] },
  { id: "r32", leietaker: "Demokunde 29", utestaende: 193279.69, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 162889.32, antallLinjer: 4, fakturaer: [{ fakturaNr: "25283", belop: 9375, forfallsdato: "2026-08-12" }, { fakturaNr: "25284", belop: 117697.01, forfallsdato: "2026-08-12" }, { fakturaNr: "25285", belop: 1562.5, forfallsdato: "2026-08-12" }, { fakturaNr: "25286", belop: 34254.81, forfallsdato: "2026-08-12" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 30390.37, antallLinjer: 2, fakturaer: [{ fakturaNr: "24884", belop: 23539.41, forfallsdato: "2026-08-12" }, { fakturaNr: "24885", belop: 6850.96, forfallsdato: "2026-08-12" }] }] },
  { id: "r33", leietaker: "Demokunde 16", utestaende: 189486.11, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 144631.07, antallLinjer: 1, fakturaer: [{ fakturaNr: "25276", belop: 144631.07, forfallsdato: "2026-08-15" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 44855.04, antallLinjer: 2, fakturaer: [{ fakturaNr: "24888", belop: 45283.38, forfallsdato: "2026-08-15" }, { fakturaNr: "24460", belop: -428.34, forfallsdato: "2026-05-30" }] }] },
  { id: "r34", leietaker: "Demokunde 57", utestaende: 172719.6, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 124953.86, antallLinjer: 1, fakturaer: [{ fakturaNr: "25249", belop: 124953.86, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 47765.74, antallLinjer: 1, fakturaer: [{ fakturaNr: "24530", belop: 47765.74, forfallsdato: "2026-09-01" }] }] },
  { id: "r35", leietaker: "Demokunde 58", utestaende: 167464.76, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 151252.12, antallLinjer: 2, fakturaer: [{ fakturaNr: "25252", belop: 144569.36, forfallsdato: "2026-09-01" }, { fakturaNr: "25253", belop: 6682.76, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 16212.64, antallLinjer: 2, fakturaer: [{ fakturaNr: "24863", belop: 42601.4, forfallsdato: "2026-09-01" }, { belop: -26388.76, forfallsdato: "2026-08-10" }] }] },
  { id: "r36", leietaker: "Demokunde 9", utestaende: 155753.38, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 85937.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24900", belop: 85937.5, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendom AS", belop: 69815.88, antallLinjer: 2, fakturaer: [{ fakturaNr: "25254", belop: 61657.54, forfallsdato: "2026-09-01" }, { fakturaNr: "25307", belop: 8158.34, forfallsdato: "2026-09-01" }] }] },
  { id: "r37", leietaker: "Demokunde 59", utestaende: 150847.57, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 107659.38, antallLinjer: 3, fakturaer: [{ fakturaNr: "25251", belop: 107659.38, forfallsdato: "2026-09-01" }, { belop: 52243.8, forfallsdato: "2026-08-12" }, { belop: -52243.8, forfallsdato: "2026-07-29" }] }, { selskap: "CC Vest Stormarked AS", belop: 43188.19, antallLinjer: 1, fakturaer: [{ fakturaNr: "24521", belop: 43188.19, forfallsdato: "2026-09-01" }] }] },
  { id: "r38", leietaker: "Demokunde 60", utestaende: 150284.19, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 116252.55, antallLinjer: 1, fakturaer: [{ fakturaNr: "25273", belop: 116252.55, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 34031.64, antallLinjer: 1, fakturaer: [{ fakturaNr: "24536", belop: 34031.64, forfallsdato: "2026-09-01" }] }] },
  { id: "r39", leietaker: "Demokunde 61", utestaende: 138700.1, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 138625.1, antallLinjer: 1, fakturaer: [{ fakturaNr: "24768", belop: 138625.1, forfallsdato: "2026-08-27" }] }, { selskap: "Lilleaker Service AS", belop: 75, antallLinjer: 1, fakturaer: [{ fakturaNr: "24661", belop: 75, forfallsdato: "2026-08-15" }] }] },
  { id: "r40", leietaker: "Demokunde 62", utestaende: 135230.56, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 135230.56, antallLinjer: 19, underInkasso: true, fakturaer: [{ fakturaNr: "24809", belop: 7934.78, forfallsdato: "2026-07-01" }, { fakturaNr: "24110", belop: 7934.78, forfallsdato: "2026-04-01" }, { fakturaNr: "40119", belop: 7935, forfallsdato: "2026-01-01", underInkasso: true }, { fakturaNr: "39436", belop: 7695, forfallsdato: "2025-10-01", underInkasso: true }, { fakturaNr: "38852", belop: 7695, forfallsdato: "2025-07-01", underInkasso: true }, { fakturaNr: "38324", belop: 7695, forfallsdato: "2025-04-01", underInkasso: true }, { fakturaNr: "37477", belop: 7695, forfallsdato: "2025-01-01", underInkasso: true }, { fakturaNr: "36735", belop: 7500, forfallsdato: "2024-10-01", underInkasso: true }, { fakturaNr: "35904", belop: 7500, forfallsdato: "2024-07-01", underInkasso: true }, { fakturaNr: "35116", belop: 7500, forfallsdato: "2024-04-01", underInkasso: true }, { fakturaNr: "35115", belop: 7500, forfallsdato: "2024-03-14", underInkasso: true }, { fakturaNr: "32984", belop: 6715, forfallsdato: "2023-04-01" }, { fakturaNr: "32671", belop: 6715, forfallsdato: "2023-01-01" }, { fakturaNr: "31985", belop: 6304, forfallsdato: "2022-10-01" }, { fakturaNr: "31642", belop: 6304, forfallsdato: "2022-07-01" }, { fakturaNr: "31114", belop: 6304, forfallsdato: "2022-04-01" }, { fakturaNr: "30609", belop: 6304, forfallsdato: "2022-01-01" }, { fakturaNr: "29590", belop: 6000, forfallsdato: "2021-07-01" }, { fakturaNr: "29198", belop: 6000, forfallsdato: "2021-04-01" }] }] },
  { id: "r41", leietaker: "Demokunde 63", utestaende: 133393.45, selskaper: [{ selskap: "Lilleaker Service AS", belop: 66829.2, antallLinjer: 4, underInkasso: true, fakturaer: [{ fakturaNr: "24440", belop: 10000, forfallsdato: "2026-06-16", underInkasso: true }, { fakturaNr: "24357", belop: 17800, forfallsdato: "2026-05-31", underInkasso: true }, { fakturaNr: "24285", belop: 18057.2, forfallsdato: "2026-05-15", underInkasso: true }, { fakturaNr: "24191", belop: 20972, forfallsdato: "2026-04-15", underInkasso: true }] }, { selskap: "Mustad Eiendom AS", belop: 66564.25, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24658", belop: 66564.25, forfallsdato: "2026-06-16", underInkasso: true }] }] },
  { id: "r42", leietaker: "Demokunde 64", utestaende: 128227.8, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 96977.8, antallLinjer: 2, fakturaer: [{ fakturaNr: "24123", belop: 48488.9, forfallsdato: "2026-09-01" }, { fakturaNr: "24120", belop: 48488.9, forfallsdato: "2026-08-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 31250, antallLinjer: 4, underInkasso: true, fakturaer: [{ fakturaNr: "24871", belop: 7812.5, forfallsdato: "2026-09-01" }, { fakturaNr: "24815", belop: 7812.5, forfallsdato: "2026-08-01", underInkasso: true }, { fakturaNr: "24564", belop: 7812.5, forfallsdato: "2026-06-23", underInkasso: true }, { fakturaNr: "24343", belop: 7812.5, forfallsdato: "2026-05-14", underInkasso: true }] }] },
  { id: "r43", leietaker: "Demokunde 65", utestaende: 123965.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 123965.5, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24648", belop: 32573.5, forfallsdato: "2026-08-15" }, { fakturaNr: "24577", belop: 91392, forfallsdato: "2026-07-15", underInkasso: true }] }] },
  { id: "r44", leietaker: "Demokunde 66", utestaende: 120436.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 120436.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24691", belop: 120436.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r45", leietaker: "Demokunde 67", utestaende: 119914.44, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 116997.78, antallLinjer: 1, fakturaer: [{ fakturaNr: "24524", belop: 116997.78, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendom AS", belop: 2916.66, antallLinjer: 1, fakturaer: [{ fakturaNr: "25242", belop: 2916.66, forfallsdato: "2026-09-01" }] }] },
  { id: "r46", leietaker: "Demokunde 68", utestaende: 118126.61, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 75168.46, antallLinjer: 1, fakturaer: [{ fakturaNr: "25237", belop: 75168.46, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 42958.15, antallLinjer: 1, fakturaer: [{ fakturaNr: "24872", belop: 42958.15, forfallsdato: "2026-09-01" }] }] },
  { id: "r47", leietaker: "Demokunde 69", utestaende: 109437, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 109437, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "39944", belop: 109437, forfallsdato: "2026-01-01", underInkasso: true }] }] },
  { id: "r48", leietaker: "Demokunde 70", utestaende: 99292.64, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 73250.85, antallLinjer: 1, fakturaer: [{ fakturaNr: "24127", belop: 73250.85, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 26041.79, antallLinjer: 1, fakturaer: [{ fakturaNr: "24864", belop: 26041.79, forfallsdato: "2026-09-01" }] }] },
  { id: "r49", leietaker: "Demokunde 71", utestaende: 97369.53, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 79400.89, antallLinjer: 1, fakturaer: [{ fakturaNr: "25250", belop: 79400.89, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 17968.64, antallLinjer: 1, fakturaer: [{ fakturaNr: "24531", belop: 17968.64, forfallsdato: "2026-09-01" }] }] },
  { id: "r50", leietaker: "Demokunde 72", utestaende: 97359.33, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 85145.79, antallLinjer: 2, fakturaer: [{ fakturaNr: "24122", belop: 85445.79, forfallsdato: "2026-09-01" }, { belop: -300, forfallsdato: "2025-12-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 12213.54, antallLinjer: 1, fakturaer: [{ fakturaNr: "24868", belop: 12213.54, forfallsdato: "2026-09-01" }] }] },
  { id: "r51", leietaker: "Demokunde 73", utestaende: 94479.18, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 72500, antallLinjer: 3, fakturaer: [{ fakturaNr: "25299", belop: 39500, forfallsdato: "2026-08-21" }, { fakturaNr: "25300", belop: 6500, forfallsdato: "2026-08-21" }, { fakturaNr: "25301", belop: 26500, forfallsdato: "2026-08-21" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 21979.18, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24875", belop: 10989.59, forfallsdato: "2026-09-01" }, { fakturaNr: "24821", belop: 10989.59, forfallsdato: "2026-08-01", underInkasso: true }] }] },
  { id: "r52", leietaker: "Demokunde 74", utestaende: 87706.46, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 62429.53, antallLinjer: 2, fakturaer: [{ fakturaNr: "25240", belop: 60600.53, forfallsdato: "2026-09-01" }, { belop: 1829, forfallsdato: "2025-06-16" }] }, { selskap: "CC Vest Stormarked AS", belop: 25276.93, antallLinjer: 1, fakturaer: [{ fakturaNr: "24520", belop: 25276.93, forfallsdato: "2026-09-01" }] }] },
  { id: "r53", leietaker: "Demokunde 75", utestaende: 87109.97, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 60875.59, antallLinjer: 2, fakturaer: [{ fakturaNr: "25305", belop: 40367.36, forfallsdato: "2026-09-01" }, { fakturaNr: "25302", belop: 20508.23, forfallsdato: "2026-08-21" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 26234.38, antallLinjer: 2, fakturaer: [{ fakturaNr: "24901", belop: 13117.19, forfallsdato: "2026-09-01" }, { fakturaNr: "24899", belop: 13117.19, forfallsdato: "2026-08-31" }] }] },
  { id: "r54", leietaker: "Demokunde 76", utestaende: 79895.08, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 57168.38, antallLinjer: 1, fakturaer: [{ fakturaNr: "25231", belop: 57168.38, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 22726.7, antallLinjer: 1, fakturaer: [{ fakturaNr: "24882", belop: 22726.7, forfallsdato: "2026-09-01" }] }] },
  { id: "r55", leietaker: "Demokunde 77", utestaende: 78750, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 78750, antallLinjer: 3, underInkasso: true, fakturaer: [{ fakturaNr: "24953", belop: 26250, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24137", belop: 26250, forfallsdato: "2026-04-01", underInkasso: true }, { fakturaNr: "40370", belop: 26250, forfallsdato: "2026-01-01", underInkasso: true }] }] },
  { id: "r56", leietaker: "Demokunde 1", utestaende: 78171.74, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 78171.74, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24073", belop: 31471.74, forfallsdato: "2026-07-01" }, { fakturaNr: "24014", belop: 46700, forfallsdato: "2026-04-01", underInkasso: true }] }] },
  { id: "r57", leietaker: "Demokunde 78", utestaende: 78070, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 78070, antallLinjer: 3, underInkasso: true, fakturaer: [{ fakturaNr: "24880", belop: 35000, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24310", belop: 35000, forfallsdato: "2026-04-15", underInkasso: true }, { fakturaNr: "40451", belop: 8070, forfallsdato: "2026-04-07", underInkasso: true }] }] },
  { id: "r58", leietaker: "Demokunde 79", utestaende: 72482.1, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 72482.1, antallLinjer: 6, fakturaer: [{ fakturaNr: "24854", belop: 13255.85, forfallsdato: "2026-08-06" }, { fakturaNr: "24845", belop: 4062.5, forfallsdato: "2026-08-04" }, { fakturaNr: "24846", belop: 487.5, forfallsdato: "2026-08-04" }, { fakturaNr: "24568", belop: 27624.53, forfallsdato: "2026-06-27" }, { fakturaNr: "24552", belop: 23929.16, forfallsdato: "2026-06-12" }, { fakturaNr: "24393", belop: 3122.56, forfallsdato: "2026-05-15" }] }] },
  { id: "r59", leietaker: "Demokunde 80", utestaende: 70000, selskaper: [{ selskap: "Mustadboliger AS", belop: 70000, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24021", belop: 35000, forfallsdato: "2026-05-14", underInkasso: true }, { fakturaNr: "4", belop: 35000, forfallsdato: "2026-04-01", underInkasso: true }] }] },
  { id: "r60", leietaker: "Demokunde 81", utestaende: 69819.06, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 45254.14, antallLinjer: 1, fakturaer: [{ fakturaNr: "25239", belop: 45254.14, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 17320.75, antallLinjer: 1, fakturaer: [{ fakturaNr: "24867", belop: 17320.75, forfallsdato: "2026-09-01" }] }, { selskap: "Lilleaker Service AS", belop: 7244.17, antallLinjer: 2, fakturaer: [{ fakturaNr: "24628", belop: 3791.67, forfallsdato: "2026-09-01" }, { fakturaNr: "24671", belop: 3452.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r61", leietaker: "Demokunde 82", utestaende: 62216.73, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 40226.24, antallLinjer: 1, fakturaer: [{ fakturaNr: "25263", belop: 40226.24, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 21990.49, antallLinjer: 1, fakturaer: [{ fakturaNr: "24523", belop: 21990.49, forfallsdato: "2026-09-01" }] }] },
  { id: "r62", leietaker: "Demokunde 83", utestaende: 61500, selskaper: [{ selskap: "Lilleaker Service AS", belop: 61500, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "1555", belop: 61500, forfallsdato: "2026-01-01", underInkasso: true }] }] },
  { id: "r63", leietaker: "Demokunde 84", utestaende: 59551.23, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 41171.23, antallLinjer: 12, underInkasso: true, fakturaer: [{ fakturaNr: "24437", belop: 44.9, forfallsdato: "2026-05-30" }, { fakturaNr: "25616", belop: 11326, forfallsdato: "2025-07-01", underInkasso: true }, { fakturaNr: "25086", belop: 424, forfallsdato: "2025-05-23", underInkasso: true }, { fakturaNr: "4713", belop: 1453.2, forfallsdato: "2025-04-23", underInkasso: true }, { fakturaNr: "24667", belop: 3856, forfallsdato: "2025-01-01", underInkasso: true }, { fakturaNr: "24330", belop: 3506, forfallsdato: "2024-10-04", underInkasso: true }, { fakturaNr: "24015", belop: 2511, forfallsdato: "2024-07-29", underInkasso: true }, { fakturaNr: "23691", belop: 3506, forfallsdato: "2024-07-02", underInkasso: true }, { fakturaNr: "4205", belop: 5137.13, forfallsdato: "2024-05-15", underInkasso: true }, { fakturaNr: "23345", belop: 3188, forfallsdato: "2024-04-01", underInkasso: true }, { fakturaNr: "23016", belop: 3188, forfallsdato: "2024-01-01", underInkasso: true }, { fakturaNr: "21351", belop: 3031, forfallsdato: "2023-01-03" }] }, { selskap: "Lilleaker Sentrum AS", belop: 18380, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "561", belop: 1820, forfallsdato: "2025-05-22", underInkasso: true }, { fakturaNr: "452", belop: 16560, forfallsdato: "2025-01-01", underInkasso: true }] }] },
  { id: "r64", leietaker: "Demokunde 85", utestaende: 53412.08, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 53412.08, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24025", belop: 53412.08, forfallsdato: "2026-04-15", underInkasso: true }] }] },
  { id: "r65", leietaker: "Demokunde 86", utestaende: 52543.38, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 47496.26, antallLinjer: 2, fakturaer: [{ fakturaNr: "24125", belop: 23748.13, forfallsdato: "2026-09-01" }, { fakturaNr: "24117", belop: 23748.13, forfallsdato: "2026-08-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 5047.12, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24870", belop: 2523.56, forfallsdato: "2026-09-01" }, { fakturaNr: "24814", belop: 2523.56, forfallsdato: "2026-08-01", underInkasso: true }] }] },
  { id: "r66", leietaker: "Demokunde 24", utestaende: 51562.23, selskaper: [{ selskap: "Lilleaker Service AS", belop: 33333.34, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24626", belop: 33333.34, forfallsdato: "2026-07-24", underInkasso: true }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 18228.89, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24461", belop: 18228.89, forfallsdato: "2026-05-30", underInkasso: true }] }] },
  { id: "r67", leietaker: "Demokunde 87", utestaende: 50252.92, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 32492.5, antallLinjer: 2, fakturaer: [{ fakturaNr: "24035", belop: 41372.71, forfallsdato: "2026-09-01" }, { belop: -8880.21, forfallsdato: "2026-07-29" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 17760.42, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24878", belop: 8880.21, forfallsdato: "2026-09-01" }, { fakturaNr: "24826", belop: 8880.21, forfallsdato: "2026-08-01", underInkasso: true }] }] },
  { id: "r68", leietaker: "Demokunde 88", utestaende: 42810, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 42810, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "26053", belop: 24370, forfallsdato: "2025-11-17", underInkasso: true }, { fakturaNr: "25825", belop: 18440, forfallsdato: "2025-07-21", underInkasso: true }] }] },
  { id: "r69", leietaker: "Demokunde 89", utestaende: 42777.22, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 42777.22, antallLinjer: 1, fakturaer: [{ fakturaNr: "24069", belop: 42777.22, forfallsdato: "2026-07-01" }] }] },
  { id: "r70", leietaker: "Demokunde 90", utestaende: 41464.78, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 41464.78, antallLinjer: 2, fakturaer: [{ fakturaNr: "25274", belop: 20732.39, forfallsdato: "2026-09-01" }, { fakturaNr: "25157", belop: 20732.39, forfallsdato: "2026-08-01" }] }] },
  { id: "r71", leietaker: "Demokunde 91", utestaende: 40773.92, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 37523.92, antallLinjer: 12, underInkasso: true, fakturaer: [{ fakturaNr: "24639", belop: 33046.88, forfallsdato: "2026-07-01" }, { fakturaNr: "24363", belop: -16776.8, forfallsdato: "2026-05-30" }, { fakturaNr: "24452", belop: -352.6, forfallsdato: "2026-05-30" }, { fakturaNr: "24166", belop: 33046.88, forfallsdato: "2026-04-15" }, { belop: -1570.01, forfallsdato: "2026-03-23" }, { fakturaNr: "50575", belop: 33048, forfallsdato: "2026-01-04", underInkasso: true }, { fakturaNr: "23443", belop: 1570.01, forfallsdato: "2024-06-23", underInkasso: true }, { fakturaNr: "22915", belop: 25375, forfallsdato: "2024-01-01", underInkasso: true }, { fakturaNr: "22411", belop: 24519, forfallsdato: "2023-07-29" }, { belop: -46195, forfallsdato: "2023-01-11" }, { belop: -34968.44, forfallsdato: "2022-02-21" }, { fakturaNr: "19946", belop: -13219, forfallsdato: "2021-05-01" }] }, { selskap: "Lilleaker Service AS", belop: 3250, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24534", belop: 1625, forfallsdato: "2026-07-06", underInkasso: true }, { fakturaNr: "24537", belop: 1625, forfallsdato: "2026-07-06", underInkasso: true }] }] },
  { id: "r72", leietaker: "Demokunde 92", utestaende: 40000, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 40000, antallLinjer: 3, fakturaer: [{ fakturaNr: "25264", belop: 40000, forfallsdato: "2026-09-01" }, { fakturaNr: "25190", belop: 40000, forfallsdato: "2026-08-01" }, { belop: -40000, forfallsdato: "2026-07-24" }] }] },
  { id: "r73", leietaker: "Demokunde 93", utestaende: 39019.04, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 39019.04, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24786", belop: 39019.04, forfallsdato: "2026-07-01", underInkasso: true }] }] },
  { id: "r74", leietaker: "Demokunde 94", utestaende: 38862, selskaper: [{ selskap: "Lilleaker Service AS", belop: 38862, antallLinjer: 1, fakturaer: [{ fakturaNr: "24692", belop: 38862, forfallsdato: "2026-08-15" }] }] },
  { id: "r75", leietaker: "Demokunde 95", utestaende: 38480.29, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 38480.29, antallLinjer: 7, underInkasso: true, fakturaer: [{ fakturaNr: "25293", belop: -125978.76, forfallsdato: "2026-08-21" }, { fakturaNr: "25294", belop: 9132.76, forfallsdato: "2026-08-21" }, { fakturaNr: "25296", belop: 27472.53, forfallsdato: "2026-08-21" }, { fakturaNr: "25297", belop: 1875, forfallsdato: "2026-08-21" }, { fakturaNr: "25291", belop: -7996.39, forfallsdato: "2026-08-21" }, { fakturaNr: "25292", belop: 7996.39, forfallsdato: "2026-08-21" }, { fakturaNr: "24580", belop: 125978.76, forfallsdato: "2026-08-05", underInkasso: true }] }] },
  { id: "r76", leietaker: "Demokunde 96", utestaende: 37500, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 37500, antallLinjer: 1, fakturaer: [{ fakturaNr: "25275", belop: 37500, forfallsdato: "2026-08-15" }] }] },
  { id: "r77", leietaker: "Demokunde 97", utestaende: 35410.6, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 35410.6, antallLinjer: 1, fakturaer: [{ fakturaNr: "24880", belop: 35410.6, forfallsdato: "2026-09-01" }] }] },
  { id: "r78", leietaker: "Demokunde 98", utestaende: 34500, selskaper: [{ selskap: "Lilleaker Service AS", belop: 34500, antallLinjer: 4, underInkasso: true, fakturaer: [{ fakturaNr: "24494", belop: 9750, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24365", belop: 9750, forfallsdato: "2026-06-05", underInkasso: true }, { fakturaNr: "24242", belop: 9750, forfallsdato: "2026-05-14", underInkasso: true }, { fakturaNr: "1511", belop: 5250, forfallsdato: "2026-01-01", underInkasso: true }] }] },
  { id: "r79", leietaker: "Demokunde 99", utestaende: 34309.35, selskaper: [{ selskap: "Mustadboliger AS", belop: 34309.35, antallLinjer: 4, underInkasso: true, fakturaer: [{ fakturaNr: "24151", belop: 17154.45, forfallsdato: "2026-09-21" }, { fakturaNr: "24129", belop: 17154.45, forfallsdato: "2026-08-21" }, { belop: -17154, forfallsdato: "2026-07-23" }, { fakturaNr: "24112", belop: 17154.45, forfallsdato: "2026-07-01", underInkasso: true }] }] },
  { id: "r80", leietaker: "Demokunde 100", utestaende: 33677, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 33677, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "34198", belop: 33677, forfallsdato: "2023-10-01", underInkasso: true }] }] },
  { id: "r81", leietaker: "Demokunde 101", utestaende: 31455, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 29250, antallLinjer: 1, fakturaer: [{ fakturaNr: "25226", belop: 29250, forfallsdato: "2026-08-06" }] }, { selskap: "Lilleaker Service AS", belop: 2205, antallLinjer: 1, fakturaer: [{ fakturaNr: "24674", belop: 2205, forfallsdato: "2026-08-15" }] }] },
  { id: "r82", leietaker: "Demokunde 102", utestaende: 30453.61, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 30453.61, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24783", belop: 22903.13, forfallsdato: "2026-07-06", underInkasso: true }, { fakturaNr: "24541", belop: 7550.48, forfallsdato: "2026-06-01", underInkasso: true }] }] },
  { id: "r83", leietaker: "Demokunde 103", utestaende: 29446.88, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 29296.88, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24728", belop: 17578.13, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "24539", belop: 11718.75, forfallsdato: "2026-05-29", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 150, antallLinjer: 1, fakturaer: [{ fakturaNr: "24631", belop: 150, forfallsdato: "2026-08-15" }] }] },
  { id: "r84", leietaker: "Demokunde 104", utestaende: 27942.48, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 27942.48, antallLinjer: 2, fakturaer: [{ fakturaNr: "24748", belop: 13971.24, forfallsdato: "2026-07-01" }, { fakturaNr: "24193", belop: 13971.24, forfallsdato: "2026-04-15" }] }] },
  { id: "r85", leietaker: "Demokunde 105", utestaende: 27807.84, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 23950.33, antallLinjer: 1, fakturaer: [{ fakturaNr: "24036", belop: 23950.33, forfallsdato: "2026-09-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 3857.51, antallLinjer: 1, fakturaer: [{ fakturaNr: "24879", belop: 3857.51, forfallsdato: "2026-09-01" }] }] },
  { id: "r86", leietaker: "Demokunde 106", utestaende: 26029.76, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 26029.76, antallLinjer: 1, fakturaer: [{ fakturaNr: "24034", belop: 26029.76, forfallsdato: "2026-09-01" }] }] },
  { id: "r87", leietaker: "Demokunde 107", utestaende: 25460, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 25000, antallLinjer: 2, fakturaer: [{ fakturaNr: "25246", belop: 12500, forfallsdato: "2026-09-01" }, { fakturaNr: "25140", belop: 12500, forfallsdato: "2026-08-01" }] }, { selskap: "Lilleaker Service AS", belop: 460, antallLinjer: 1, fakturaer: [{ fakturaNr: "24630", belop: 460, forfallsdato: "2026-08-15" }] }] },
  { id: "r88", leietaker: "Demokunde 108", utestaende: 24388.71, selskaper: [{ selskap: "Lilleaker Service AS", belop: 21781.21, antallLinjer: 1, fakturaer: [{ fakturaNr: "24651", belop: 21781.21, forfallsdato: "2026-08-15" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 2607.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24856", belop: 2607.5, forfallsdato: "2026-08-05" }] }] },
  { id: "r89", leietaker: "Demokunde 109", utestaende: 24386.89, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 24386.89, antallLinjer: 1, fakturaer: [{ fakturaNr: "24126", belop: 24386.89, forfallsdato: "2026-09-01" }] }] },
  { id: "r90", leietaker: "Demokunde 110", utestaende: 24369.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 12444.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24682", belop: 12444.5, forfallsdato: "2026-08-30" }] }, { selskap: "Mustad Eiendom AS", belop: 11925, antallLinjer: 2, fakturaer: [{ fakturaNr: "25310", belop: 11250, forfallsdato: "2026-09-11" }, { fakturaNr: "2455", belop: 675, forfallsdato: "2022-05-25" }] }] },
  { id: "r91", leietaker: "Demokunde 111", utestaende: 24000.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 24000, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24132", belop: 24000, forfallsdato: "2026-04-15", underInkasso: true }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 0.5, antallLinjer: 0, fakturaer: [] }] },
  { id: "r92", leietaker: "Demokunde 112", utestaende: 23810.61, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 23810.61, antallLinjer: 3, fakturaer: [{ fakturaNr: "24121", belop: 6763.04, forfallsdato: "2026-08-01" }, { fakturaNr: "24104", belop: 16519.88, forfallsdato: "2026-07-01" }, { fakturaNr: "24108", belop: 527.69, forfallsdato: "2026-06-26" }] }] },
  { id: "r93", leietaker: "Demokunde 113", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "3251", belop: 23647.5, forfallsdato: "2026-02-14" }] }] },
  { id: "r94", leietaker: "Demokunde 114", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "3252", belop: 23647.5, forfallsdato: "2026-02-14" }] }] },
  { id: "r95", leietaker: "Demokunde 115", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "3253", belop: 23647.5, forfallsdato: "2026-02-14" }] }] },
  { id: "r96", leietaker: "Demokunde 116", utestaende: 23647.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 23647.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "3254", belop: 23647.5, forfallsdato: "2026-02-14" }] }] },
  { id: "r97", leietaker: "Demokunde 7", utestaende: 23000, selskaper: [{ selskap: "Mustadboliger AS", belop: 23000, antallLinjer: 1, fakturaer: [{ fakturaNr: "24155", belop: 23000, forfallsdato: "2026-09-01" }] }] },
  { id: "r98", leietaker: "Demokunde 117", utestaende: 22779.2, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 22779.2, antallLinjer: 1, fakturaer: [{ fakturaNr: "25229", belop: 22779.2, forfallsdato: "2026-09-01" }] }] },
  { id: "r99", leietaker: "Demokunde 118", utestaende: 22427, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 22427, antallLinjer: 1, fakturaer: [{ fakturaNr: "24537", belop: 22427, forfallsdato: "2026-08-20" }] }] },
  { id: "r100", leietaker: "Demokunde 119", utestaende: 21785.88, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 16699.6, antallLinjer: 1, fakturaer: [{ fakturaNr: "25266", belop: 16699.6, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 5086.28, antallLinjer: 1, fakturaer: [{ fakturaNr: "24525", belop: 5086.28, forfallsdato: "2026-09-01" }] }] },
  { id: "r101", leietaker: "Demokunde 120", utestaende: 21723.71, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 21723.71, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "25033", belop: 21723.71, forfallsdato: "2026-08-31", underInkasso: true }] }] },
  { id: "r102", leietaker: "Demokunde 121", utestaende: 21284.25, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 21284.25, antallLinjer: 4, fakturaer: [{ fakturaNr: "25261", belop: 11027.25, forfallsdato: "2026-09-01" }, { fakturaNr: "25262", belop: 22626.51, forfallsdato: "2026-09-01" }, { fakturaNr: "25304", belop: -8270.31, forfallsdato: "2026-09-01" }, { belop: -4099.2, forfallsdato: "2026-08-06" }] }] },
  { id: "r103", leietaker: "Demokunde 21", utestaende: 20916.96, selskaper: [{ selskap: "Mustadboliger AS", belop: 20916.96, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24115", belop: 5552.97, forfallsdato: "2026-09-01", underInkasso: true }, { fakturaNr: "24131", belop: 15363.99, forfallsdato: "2026-09-01" }] }] },
  { id: "r104", leietaker: "Demokunde 122", utestaende: 20742, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 20742, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24233", belop: 5101, forfallsdato: "2024-10-04", underInkasso: true }, { fakturaNr: "23896", belop: 15641, forfallsdato: "2024-07-06", underInkasso: true }] }] },
  { id: "r105", leietaker: "Demokunde 123", utestaende: 20554.93, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 20554.93, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24389", belop: 20554.93, forfallsdato: "2026-05-15", underInkasso: true }] }] },
  { id: "r106", leietaker: "Demokunde 124", utestaende: 20362.86, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 18750.71, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24483", belop: 18750.71, forfallsdato: "2026-07-15", underInkasso: true }] }, { selskap: "Mustad Eiendom AS", belop: 1612.15, antallLinjer: 1, fakturaer: [{ fakturaNr: "25232", belop: 1612.15, forfallsdato: "2026-09-01" }] }] },
  { id: "r107", leietaker: "Demokunde 125", utestaende: 19943.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 19943.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "25230", belop: 19943.5, forfallsdato: "2026-09-01" }] }] },
  { id: "r108", leietaker: "Demokunde 126", utestaende: 19446.88, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 19446.88, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24725", belop: 19446.88, forfallsdato: "2026-07-01", underInkasso: true }] }] },
  { id: "r109", leietaker: "Demokunde 127", utestaende: 18824.64, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 18824.64, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "25270", belop: 15119.28, forfallsdato: "2026-09-01" }, { fakturaNr: "24415", belop: 3705.36, forfallsdato: "2026-05-14", underInkasso: true }] }] },
  { id: "r110", leietaker: "Demokunde 128", utestaende: 18793.4, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 10858.4, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24573", belop: 10858.4, forfallsdato: "2026-06-27", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 7935, antallLinjer: 1, fakturaer: [{ fakturaNr: "24633", belop: 7935, forfallsdato: "2026-08-15" }] }] },
  { id: "r111", leietaker: "Demokunde 129", utestaende: 18455.94, selskaper: [{ selskap: "Strandveien 4-8 AS", belop: 18455.94, antallLinjer: 1, fakturaer: [{ fakturaNr: "24029", belop: 18455.94, forfallsdato: "2026-07-15" }] }] },
  { id: "r112", leietaker: "Demokunde 130", utestaende: 18040.02, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 13340.96, antallLinjer: 1, fakturaer: [{ fakturaNr: "25265", belop: 13340.96, forfallsdato: "2026-09-01" }] }, { selskap: "CC Vest Stormarked AS", belop: 4699.06, antallLinjer: 1, fakturaer: [{ fakturaNr: "24526", belop: 4699.06, forfallsdato: "2026-09-01" }] }] },
  { id: "r113", leietaker: "Demokunde 131", utestaende: 17812.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 17812.5, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24502", belop: 17812.5, forfallsdato: "2026-05-14", underInkasso: true }] }] },
  { id: "r114", leietaker: "Demokunde 132", utestaende: 17705.54, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 17705.54, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24232", belop: 17705.54, forfallsdato: "2026-05-06", underInkasso: true }] }] },
  { id: "r115", leietaker: "Demokunde 133", utestaende: 17500, selskaper: [{ selskap: "Mustadboliger AS", belop: 17500, antallLinjer: 1, fakturaer: [{ fakturaNr: "24153", belop: 17500, forfallsdato: "2026-09-01" }] }] },
  { id: "r116", leietaker: "Demokunde 134", utestaende: 17000, selskaper: [{ selskap: "Mustadboliger AS", belop: 17000, antallLinjer: 1, fakturaer: [{ fakturaNr: "24145", belop: 17000, forfallsdato: "2026-09-01" }] }] },
  { id: "r117", leietaker: "Demokunde 135", utestaende: 17000, selskaper: [{ selskap: "Mustadboliger AS", belop: 17000, antallLinjer: 1, fakturaer: [{ fakturaNr: "24142", belop: 17000, forfallsdato: "2026-09-01" }] }] },
  { id: "r118", leietaker: "Demokunde 136", utestaende: 17000, selskaper: [{ selskap: "Mustadboliger AS", belop: 17000, antallLinjer: 1, fakturaer: [{ fakturaNr: "24143", belop: 17000, forfallsdato: "2026-09-01" }] }] },
  { id: "r119", leietaker: "Demokunde 137", utestaende: 16623.22, selskaper: [{ selskap: "Mustadboliger AS", belop: 16623.22, antallLinjer: 1, fakturaer: [{ fakturaNr: "24150", belop: 16623.22, forfallsdato: "2026-09-01" }] }] },
  { id: "r120", leietaker: "Demokunde 138", utestaende: 16600.13, selskaper: [{ selskap: "Mustadboliger AS", belop: 16600.13, antallLinjer: 1, fakturaer: [{ fakturaNr: "24144", belop: 16600, forfallsdato: "2026-09-01" }] }] },
  { id: "r121", leietaker: "Demokunde 139", utestaende: 16598.35, selskaper: [{ selskap: "Mustadboliger AS", belop: 16598.35, antallLinjer: 1, fakturaer: [{ fakturaNr: "24149", belop: 16598.35, forfallsdato: "2026-09-01" }] }] },
  { id: "r122", leietaker: "Demokunde 140", utestaende: 16585.95, selskaper: [{ selskap: "Mustadboliger AS", belop: 16585.95, antallLinjer: 1, fakturaer: [{ fakturaNr: "24154", belop: 16585.95, forfallsdato: "2026-09-01" }] }] },
  { id: "r123", leietaker: "Demokunde 141", utestaende: 16522.31, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 16522.31, antallLinjer: 2, fakturaer: [{ fakturaNr: "24538", belop: 7036.56, forfallsdato: "2026-08-31" }, { fakturaNr: "24539", belop: 9485.75, forfallsdato: "2026-08-31" }] }] },
  { id: "r124", leietaker: "Demokunde 142", utestaende: 16442.74, selskaper: [{ selskap: "Mustadboliger AS", belop: 16442.74, antallLinjer: 1, fakturaer: [{ fakturaNr: "24146", belop: 16442.74, forfallsdato: "2026-09-01" }] }] },
  { id: "r125", leietaker: "Demokunde 143", utestaende: 16012.9, selskaper: [{ selskap: "Mustadboliger AS", belop: 16012.9, antallLinjer: 2, fakturaer: [{ fakturaNr: "24140", belop: 17000, forfallsdato: "2026-09-01" }, { belop: -987.1, forfallsdato: "2026-06-25" }] }] },
  { id: "r126", leietaker: "Demokunde 144", utestaende: 15800, selskaper: [{ selskap: "Mustadboliger AS", belop: 15800, antallLinjer: 1, fakturaer: [{ fakturaNr: "24135", belop: 15800, forfallsdato: "2026-09-01" }] }] },
  { id: "r127", leietaker: "Demokunde 145", utestaende: 15690.08, selskaper: [{ selskap: "Mustadboliger AS", belop: 15690.08, antallLinjer: 1, fakturaer: [{ fakturaNr: "24147", belop: 15690.08, forfallsdato: "2026-09-01" }] }] },
  { id: "r128", leietaker: "Demokunde 146", utestaende: 15000, selskaper: [{ selskap: "Mustadboliger AS", belop: 15000, antallLinjer: 1, fakturaer: [{ fakturaNr: "24139", belop: 15000, forfallsdato: "2026-09-01" }] }] },
  { id: "r129", leietaker: "Demokunde 147", utestaende: 14650, selskaper: [{ selskap: "Mustadboliger AS", belop: 14650, antallLinjer: 1, fakturaer: [{ fakturaNr: "24152", belop: 14650, forfallsdato: "2026-09-01" }] }] },
  { id: "r130", leietaker: "Demokunde 20", utestaende: 14298.97, selskaper: [{ selskap: "Mustadboliger AS", belop: 14298.97, antallLinjer: 1, fakturaer: [{ fakturaNr: "24125", belop: 14298.99, forfallsdato: "2026-08-01" }] }] },
  { id: "r131", leietaker: "Demokunde 148", utestaende: 13750, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 13750, antallLinjer: 6, underInkasso: true, fakturaer: [{ fakturaNr: "25277", belop: -9375, forfallsdato: "2026-08-12" }, { fakturaNr: "25278", belop: -7932.69, forfallsdato: "2026-08-12" }, { fakturaNr: "25279", belop: 6250, forfallsdato: "2026-08-12" }, { fakturaNr: "25280", belop: 7500, forfallsdato: "2026-08-12" }, { fakturaNr: "24904", belop: 9375, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "25029", belop: 7932.69, forfallsdato: "2026-06-25", underInkasso: true }] }] },
  { id: "r132", leietaker: "Demokunde 149", utestaende: 13006.35, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 13006.35, antallLinjer: 1, fakturaer: [{ fakturaNr: "25241", belop: 13006.35, forfallsdato: "2026-09-01" }] }] },
  { id: "r133", leietaker: "Demokunde 150", utestaende: 12861.65, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 12861.65, antallLinjer: 2, underInkasso: true, fakturaer: [{ fakturaNr: "24185", belop: -6325.68, forfallsdato: "2026-04-15" }, { fakturaNr: "24085", belop: 19187.33, forfallsdato: "2026-04-01", underInkasso: true }] }] },
  { id: "r134", leietaker: "Demokunde 151", utestaende: 12421.46, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 12421.46, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24119", belop: 12421.46, forfallsdato: "2026-04-01", underInkasso: true }] }] },
  { id: "r135", leietaker: "Demokunde 152", utestaende: 12062.5, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 12062.5, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24038", belop: 12062.5, forfallsdato: "2026-04-01", underInkasso: true }] }] },
  { id: "r136", leietaker: "Demokunde 153", utestaende: 10721.6, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 10721.6, antallLinjer: 2, fakturaer: [{ fakturaNr: "25272", belop: 12586.25, forfallsdato: "2026-09-01" }, { fakturaNr: "24637", belop: -1864.65, forfallsdato: "2026-06-03" }] }] },
  { id: "r137", leietaker: "Demokunde 154", utestaende: 10708.38, selskaper: [{ selskap: "Mustadboliger AS", belop: 10708.38, antallLinjer: 1, fakturaer: [{ fakturaNr: "24148", belop: 10708.38, forfallsdato: "2026-09-01" }] }] },
  { id: "r138", leietaker: "Demokunde 155", utestaende: 10611.75, selskaper: [{ selskap: "Lilleaker Service AS", belop: 10611.75, antallLinjer: 1, fakturaer: [{ fakturaNr: "24673", belop: 10611.75, forfallsdato: "2026-08-15" }] }] },
  { id: "r139", leietaker: "Demokunde 156", utestaende: 9815.4, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 9815.4, antallLinjer: 1, fakturaer: [{ fakturaNr: "24857", belop: 9815.4, forfallsdato: "2026-08-06" }] }] },
  { id: "r140", leietaker: "Demokunde 157", utestaende: 9313.52, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 5281.66, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24150", belop: 5281.66, forfallsdato: "2026-04-15", underInkasso: true }] }, { selskap: "Mustad Eiendom AS", belop: 4031.86, antallLinjer: 2, fakturaer: [{ fakturaNr: "25234", belop: 1801.46, forfallsdato: "2026-09-01" }, { fakturaNr: "25235", belop: 2230.4, forfallsdato: "2026-09-01" }] }] },
  { id: "r141", leietaker: "Demokunde 158", utestaende: 9265.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 9265.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24685", belop: 9265.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r142", leietaker: "Demokunde 159", utestaende: 9181, selskaper: [{ selskap: "Lilleaker Service AS", belop: 9181, antallLinjer: 1, fakturaer: [{ fakturaNr: "24654", belop: 9181, forfallsdato: "2026-08-15" }] }] },
  { id: "r143", leietaker: "Demokunde 160", utestaende: 9150, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 9150, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "2385", belop: 9150, forfallsdato: "2025-09-26", underInkasso: true }] }] },
  { id: "r144", leietaker: "Demokunde 161", utestaende: 8437.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 8437.5, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "2637", belop: 8437.5, forfallsdato: "2023-05-18", underInkasso: true }] }] },
  { id: "r145", leietaker: "Demokunde 162", utestaende: 8012.84, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 8012.84, antallLinjer: 1, fakturaer: [{ fakturaNr: "25267", belop: 8012.84, forfallsdato: "2026-09-01" }] }] },
  { id: "r146", leietaker: "Demokunde 163", utestaende: 7332, selskaper: [{ selskap: "Lilleaker Service AS", belop: 7332, antallLinjer: 1, fakturaer: [{ fakturaNr: "24662", belop: 7332, forfallsdato: "2026-08-15" }] }] },
  { id: "r147", leietaker: "Demokunde 18", utestaende: 7143.2, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 5070.94, antallLinjer: 13, underInkasso: true, fakturaer: [{ fakturaNr: "25181", belop: 201.78, forfallsdato: "2026-08-01" }, { fakturaNr: "24949", belop: 208.5, forfallsdato: "2026-07-01" }, { fakturaNr: "24534", belop: 359.83, forfallsdato: "2026-06-01" }, { fakturaNr: "24406", belop: 359.83, forfallsdato: "2026-05-14" }, { fakturaNr: "40433", belop: 209, forfallsdato: "2026-03-01" }, { fakturaNr: "40432", belop: 209, forfallsdato: "2026-02-01" }, { fakturaNr: "40431", belop: 209, forfallsdato: "2026-01-30" }, { fakturaNr: "39536", belop: 608, forfallsdato: "2025-10-01" }, { fakturaNr: "38974", belop: 608, forfallsdato: "2025-07-01", underInkasso: true }, { fakturaNr: "33051", belop: 541, forfallsdato: "2023-04-01" }, { fakturaNr: "32618", belop: 541, forfallsdato: "2023-01-01" }, { fakturaNr: "32037", belop: 508, forfallsdato: "2022-10-01" }, { fakturaNr: "31748", belop: 508, forfallsdato: "2022-07-01" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 2072.26, antallLinjer: 8, underInkasso: true, fakturaer: [{ fakturaNr: "24823", belop: 183.08, forfallsdato: "2026-08-01", underInkasso: true }, { fakturaNr: "24759", belop: 189.18, forfallsdato: "2026-07-01", underInkasso: true }, { fakturaNr: "50583", belop: 189, forfallsdato: "2026-03-01", underInkasso: true }, { fakturaNr: "50582", belop: 189, forfallsdato: "2026-02-01", underInkasso: true }, { fakturaNr: "50581", belop: 189, forfallsdato: "2026-01-29", underInkasso: true }, { fakturaNr: "25039", belop: 551, forfallsdato: "2025-04-01", underInkasso: true }, { fakturaNr: "24612", belop: 551, forfallsdato: "2025-01-01", underInkasso: true }, { fakturaNr: "21346", belop: 31, forfallsdato: "2023-01-01" }] }] },
  { id: "r148", leietaker: "Demokunde 164", utestaende: 6955.5, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 4780.5, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24771", belop: 4780.5, forfallsdato: "2026-06-29", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 2175, antallLinjer: 1, fakturaer: [{ fakturaNr: "24659", belop: 2175, forfallsdato: "2026-08-15" }] }] },
  { id: "r149", leietaker: "Demokunde 165", utestaende: 6589.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 6589.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24635", belop: 6589.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r150", leietaker: "Demokunde 166", utestaende: 6547, selskaper: [{ selskap: "Lilleaker Service AS", belop: 6547, antallLinjer: 1, fakturaer: [{ fakturaNr: "24643", belop: 6547, forfallsdato: "2026-08-15" }] }] },
  { id: "r151", leietaker: "Demokunde 167", utestaende: 6402, selskaper: [{ selskap: "Lilleaker Service AS", belop: 6402, antallLinjer: 1, fakturaer: [{ fakturaNr: "24656", belop: 6402, forfallsdato: "2026-08-30" }] }] },
  { id: "r152", leietaker: "Demokunde 168", utestaende: 6309, selskaper: [{ selskap: "Lilleaker Service AS", belop: 6309, antallLinjer: 1, fakturaer: [{ fakturaNr: "24679", belop: 6309, forfallsdato: "2026-08-30" }] }] },
  { id: "r153", leietaker: "Demokunde 169", utestaende: 5800, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 5800, antallLinjer: 1, fakturaer: [{ fakturaNr: "25303", belop: 5800, forfallsdato: "2026-08-21" }] }] },
  { id: "r154", leietaker: "Demokunde 170", utestaende: 5704.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5704.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24658", belop: 5704.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r155", leietaker: "Demokunde 171", utestaende: 5520.15, selskaper: [{ selskap: "Lilleakerveien 14 AS", belop: 5520.15, antallLinjer: 1, fakturaer: [{ fakturaNr: "24073", belop: 5520.15, forfallsdato: "2026-09-01" }] }] },
  { id: "r156", leietaker: "Demokunde 172", utestaende: 5519, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5519, antallLinjer: 1, fakturaer: [{ fakturaNr: "24645", belop: 5519, forfallsdato: "2026-08-15" }] }] },
  { id: "r157", leietaker: "Demokunde 173", utestaende: 5469, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 5469, antallLinjer: 3, fakturaer: [{ fakturaNr: "21635", belop: 1823, forfallsdato: "2023-06-01" }, { fakturaNr: "21634", belop: 1823, forfallsdato: "2023-05-01" }, { fakturaNr: "21633", belop: 1823, forfallsdato: "2023-04-01" }] }] },
  { id: "r158", leietaker: "Demokunde 174", utestaende: 5281, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5281, antallLinjer: 1, fakturaer: [{ fakturaNr: "24675", belop: 5281, forfallsdato: "2026-08-15" }] }] },
  { id: "r159", leietaker: "Demokunde 175", utestaende: 5238, selskaper: [{ selskap: "Lilleaker Service AS", belop: 5238, antallLinjer: 1, fakturaer: [{ fakturaNr: "24634", belop: 5238, forfallsdato: "2026-08-15" }] }] },
  { id: "r160", leietaker: "Demokunde 176", utestaende: 4812, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 3594, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24833", belop: 3594, forfallsdato: "2025-04-01", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 1218, antallLinjer: 1, fakturaer: [{ fakturaNr: "24667", belop: 1218, forfallsdato: "2026-08-15" }] }] },
  { id: "r161", leietaker: "Demokunde 177", utestaende: 4720.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 4720.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24676", belop: 4720.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r162", leietaker: "Demokunde 178", utestaende: 4687.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 4687.5, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "2654", belop: 4687.5, forfallsdato: "2023-06-27", underInkasso: true }] }] },
  { id: "r163", leietaker: "Demokunde 179", utestaende: 4167.24, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 4167.24, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "4692", belop: 4167.24, forfallsdato: "2025-04-04", underInkasso: true }] }] },
  { id: "r164", leietaker: "Demokunde 180", utestaende: 4150, selskaper: [{ selskap: "Lilleaker Service AS", belop: 4150, antallLinjer: 1, fakturaer: [{ fakturaNr: "24650", belop: 4150, forfallsdato: "2026-08-15" }] }] },
  { id: "r165", leietaker: "Demokunde 181", utestaende: 3828.1, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3828.1, antallLinjer: 2, fakturaer: [{ fakturaNr: "24637", belop: 3626.1, forfallsdato: "2026-08-15" }, { fakturaNr: "24640", belop: 202, forfallsdato: "2026-08-15" }] }] },
  { id: "r166", leietaker: "Demokunde 182", utestaende: 3784, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3784, antallLinjer: 1, fakturaer: [{ fakturaNr: "24680", belop: 3784, forfallsdato: "2026-08-15" }] }] },
  { id: "r167", leietaker: "Demokunde 183", utestaende: 3724, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3724, antallLinjer: 1, fakturaer: [{ fakturaNr: "24660", belop: 3724, forfallsdato: "2026-08-15" }] }] },
  { id: "r168", leietaker: "Demokunde 184", utestaende: 3616, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2636, antallLinjer: 1, fakturaer: [{ fakturaNr: "24649", belop: 2636, forfallsdato: "2026-08-15" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 980, antallLinjer: 1, fakturaer: [{ fakturaNr: "24890", belop: 980, forfallsdato: "2026-08-18" }] }] },
  { id: "r169", leietaker: "Demokunde 185", utestaende: 3577.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3577.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24653", belop: 3577.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r170", leietaker: "Demokunde 186", utestaende: 3521, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3521, antallLinjer: 1, fakturaer: [{ fakturaNr: "24663", belop: 3521, forfallsdato: "2026-08-15" }] }] },
  { id: "r171", leietaker: "Demokunde 187", utestaende: 3262.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 3262.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24688", belop: 3262.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r172", leietaker: "Demokunde 188", utestaende: 2854, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2854, antallLinjer: 1, fakturaer: [{ fakturaNr: "31239", belop: 2854, forfallsdato: "2022-04-01" }] }] },
  { id: "r173", leietaker: "Demokunde 189", utestaende: 2723, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 2723, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "4694", belop: 2723, forfallsdato: "2025-04-04", underInkasso: true }] }] },
  { id: "r174", leietaker: "Demokunde 190", utestaende: 2644, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2644, antallLinjer: 1, fakturaer: [{ fakturaNr: "24686", belop: 2644, forfallsdato: "2026-08-15" }] }] },
  { id: "r175", leietaker: "Demokunde 191", utestaende: 2542.17, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2429.67, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "36591", belop: 2429.67, forfallsdato: "2024-10-01", underInkasso: true }] }, { selskap: "Lilleaker Service AS", belop: 112, antallLinjer: 1, fakturaer: [{ fakturaNr: "24664", belop: 112, forfallsdato: "2026-08-15" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 0.5, antallLinjer: 0, fakturaer: [] }] },
  { id: "r176", leietaker: "Demokunde 192", utestaende: 2416, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2416, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24557", belop: 2416, forfallsdato: "2026-07-15", underInkasso: true }] }] },
  { id: "r177", leietaker: "Demokunde 193", utestaende: 2381.84, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2381.48, antallLinjer: 1, fakturaer: [{ fakturaNr: "24672", belop: 2381.48, forfallsdato: "2026-08-15" }] }, { selskap: "Mustad Eiendomsdrift AS", belop: 0.36, antallLinjer: 0, fakturaer: [] }] },
  { id: "r178", leietaker: "Demokunde 194", utestaende: 2292.97, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2292.97, antallLinjer: 2, underInkasso: true, fakturaer: [{ belop: 197.97, forfallsdato: "2025-07-15" }, { fakturaNr: "36205", belop: 2095, forfallsdato: "2024-07-29", underInkasso: true }] }] },
  { id: "r179", leietaker: "Demokunde 195", utestaende: 2283, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2283, antallLinjer: 1, fakturaer: [{ fakturaNr: "24644", belop: 2283, forfallsdato: "2026-08-15" }] }] },
  { id: "r180", leietaker: "Demokunde 196", utestaende: 2187.5, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 2187.5, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "2745", belop: 2187.5, forfallsdato: "2024-01-02", underInkasso: true }] }] },
  { id: "r181", leietaker: "Demokunde 197", utestaende: 2139, selskaper: [{ selskap: "Lilleaker Service AS", belop: 2139, antallLinjer: 1, fakturaer: [{ fakturaNr: "24670", belop: 2139, forfallsdato: "2026-08-15" }] }] },
  { id: "r182", leietaker: "Demokunde 198", utestaende: 1821, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1821, antallLinjer: 1, fakturaer: [{ fakturaNr: "24678", belop: 1821, forfallsdato: "2026-08-15" }] }] },
  { id: "r183", leietaker: "Demokunde 199", utestaende: 1797, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1797, antallLinjer: 1, fakturaer: [{ fakturaNr: "24684", belop: 1797, forfallsdato: "2026-08-15" }] }] },
  { id: "r184", leietaker: "Demokunde 200", utestaende: 1635, selskaper: [{ selskap: "Lilleaker Sentrum AS", belop: 1635, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "369", belop: 1635, forfallsdato: "2024-09-05", underInkasso: true }] }] },
  { id: "r185", leietaker: "Demokunde 201", utestaende: 1622, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1622, antallLinjer: 1, fakturaer: [{ fakturaNr: "24683", belop: 1622, forfallsdato: "2026-08-15" }] }] },
  { id: "r186", leietaker: "Demokunde 202", utestaende: 1596.75, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1596.75, antallLinjer: 1, fakturaer: [{ fakturaNr: "24632", belop: 1596.75, forfallsdato: "2026-08-15" }] }] },
  { id: "r187", leietaker: "Demokunde 203", utestaende: 1582.15, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1582.15, antallLinjer: 1, fakturaer: [{ fakturaNr: "24690", belop: 1582.15, forfallsdato: "2026-08-30" }] }] },
  { id: "r188", leietaker: "Demokunde 204", utestaende: 1568.8, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 1568.8, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "25779", belop: 1568.8, forfallsdato: "2025-07-21", underInkasso: true }] }] },
  { id: "r189", leietaker: "Demokunde 205", utestaende: 1260, selskaper: [{ selskap: "Mustad Eiendomsdrift AS", belop: 1260, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24844", belop: 1260, forfallsdato: "2026-08-01", underInkasso: true }] }] },
  { id: "r190", leietaker: "Demokunde 206", utestaende: 1038, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1038, antallLinjer: 1, fakturaer: [{ fakturaNr: "24642", belop: 1038, forfallsdato: "2026-08-15" }] }] },
  { id: "r191", leietaker: "Demokunde 207", utestaende: 1008, selskaper: [{ selskap: "Lilleaker Service AS", belop: 1008, antallLinjer: 1, fakturaer: [{ fakturaNr: "24669", belop: 1008, forfallsdato: "2026-08-15" }] }] },
  { id: "r192", leietaker: "Demokunde 208", utestaende: 984.9, selskaper: [{ selskap: "Lilleaker Service AS", belop: 984.9, antallLinjer: 1, fakturaer: [{ fakturaNr: "24666", belop: 984.9, forfallsdato: "2026-08-15" }] }] },
  { id: "r193", leietaker: "Demokunde 209", utestaende: 897, selskaper: [{ selskap: "Lilleaker Service AS", belop: 897, antallLinjer: 1, fakturaer: [{ fakturaNr: "24647", belop: 897, forfallsdato: "2026-08-15" }] }] },
  { id: "r194", leietaker: "Demokunde 210", utestaende: 828.13, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 828.13, antallLinjer: 1, fakturaer: [{ fakturaNr: "25245", belop: 828.13, forfallsdato: "2026-09-01" }] }] },
  { id: "r195", leietaker: "Demokunde 211", utestaende: 665, selskaper: [{ selskap: "Lilleaker Service AS", belop: 665, antallLinjer: 1, fakturaer: [{ fakturaNr: "24639", belop: 665, forfallsdato: "2026-08-15" }] }] },
  { id: "r196", leietaker: "Demokunde 212", utestaende: 406, selskaper: [{ selskap: "Lilleaker Service AS", belop: 406, antallLinjer: 1, fakturaer: [{ fakturaNr: "24655", belop: 406, forfallsdato: "2026-08-15" }] }] },
  { id: "r197", leietaker: "Demokunde 213", utestaende: 400.33, selskaper: [{ selskap: "CC Vest Stormarked AS", belop: 400.33, antallLinjer: 1, underInkasso: true, fakturaer: [{ fakturaNr: "24342", belop: 400.33, forfallsdato: "2026-06-29", underInkasso: true }] }] },
  { id: "r198", leietaker: "Demokunde 214", utestaende: 354.5, selskaper: [{ selskap: "Lilleaker Service AS", belop: 354.5, antallLinjer: 1, fakturaer: [{ fakturaNr: "24638", belop: 354.5, forfallsdato: "2026-08-15" }] }] },
  { id: "r199", leietaker: "Demokunde 215", utestaende: 306, selskaper: [{ selskap: "Lilleaker Service AS", belop: 306, antallLinjer: 1, fakturaer: [{ fakturaNr: "24668", belop: 306, forfallsdato: "2026-08-15" }] }] },
  { id: "r200", leietaker: "Demokunde 216", utestaende: 135, selskaper: [{ selskap: "Lilleaker Service AS", belop: 135, antallLinjer: 1, fakturaer: [{ fakturaNr: "24652", belop: 135, forfallsdato: "2026-08-15" }] }] },
  { id: "r201", leietaker: "Demokunde 217", utestaende: 81, selskaper: [{ selskap: "Lilleaker Service AS", belop: 81, antallLinjer: 1, fakturaer: [{ fakturaNr: "24657", belop: 81, forfallsdato: "2026-08-15" }] }] },
  { id: "r202", leietaker: "Demokunde 218", utestaende: 50, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 50, antallLinjer: 1, fakturaer: [{ fakturaNr: "35073", belop: 50, forfallsdato: "2024-02-12" }] }] },
  { id: "r203", leietaker: "Demokunde 219", utestaende: 0.09, selskaper: [{ selskap: "Mustad Eiendom AS", belop: 0.09, antallLinjer: 0, fakturaer: [] }] },
];

export interface ExpiringLine {
  linjeId: number;
  beskrivelse: string;
  bygg: string;
  arealtype: string;
  leietype: string;
  slutt: string; // "YYYY-MM-DD"
  dagerTilUtlop: number;
  totalArsleie: number;
  reforhandlet: boolean;
  nyKontraktsnokkel?: string;
  nyKontraktStart?: string;
  gapDager?: number;
}

export type ExpiryStatus = "Reforhandlet" | "Terminert" | "Mulig endring" | "Reforhandling pågår" | "Ingen varsel";

export interface ExpiringTenant {
  leietaker: string;
  customerId: number;
  bygg: string;
  totalArsleie: number;
  status: ExpiryStatus;
  statusKilde?: string;
  lines: ExpiringLine[];
}

/**
 * MIDLERTIDIG ANONYMISERT — se merknad over CONTRACTS. Beløp/datoer/arealtype ekte (fra Fazile,
 * hentet 2026-08-12 via kontraktsutlop-verktøyet, maneder_frem=1, hele porteføljen). Vinduet er
 * 2026-08-12 til 2026-09-12 (31 dager — verktøyet støtter kun hele måneder). Leietakernavn byttet
 * til samme "Demokunde N"-nummerering som CONTRACTS/GUARANTEES/RECEIVABLES der samme leietaker
 * opptrer flere steder (Demokunde 1, 10, 13 — se lib/widgets.local.ts for hvilken ekte leietaker
 * hvert nummer tilsvarer; navnene skal IKKE stå i denne filen). "kontraktsutløp" er LINJENS
 * sluttdato, ikke kontraktens. Rene "leiefritak"-linjer er filtrert bort (2 linjer, hver eneste
 * linje for sin leietaker, fjernet 2026-08-12 — derfor "hopper" Demokunde-nummereringen over 17 og
 * 28). `status`/`statusKilde` er et manuelt kryssreferert øyeblikksbilde (Fazile
 * `reforhandlet`-flagg + Salesforce Case/Prosjekt-søk 2026-08-12), IKKE en live sjekk — se
 * AGENTS.md-historikk for research-grunnlaget. `ExpiringTenant.bygg` er leietakerens HOVEDBYGG
 * (bygget knyttet til kontor-/husleielinjen, ikke en kommaseparert liste over alle bygg) —
 * leietakere med linjer i flere bygg viser de andre byggene per linje i `ExpiringLine.bygg` i stedet.
 */
export const EXPIRIES_WINDOW = { fraDato: "2026-08-12", tilDato: "2026-09-12" };
export const EXPIRIES_TOTAL_ARSLEIE = 9109581.5;
export const EXPIRIES_REELL_EKSPONERING = 8922781.5;
export const EXPIRIES: ExpiringTenant[] = [
  {
    leietaker: "Demokunde 16", customerId: 67110, bygg: "Lilleakerveien 4A", totalArsleie: 384649.65,
    status: "Ingen varsel",
    lines: [
      { linjeId: 158079, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-14", dagerTilUtlop: 2, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158080, beskrivelse: "Husleie avg.fritt", bygg: "Lilleakerveien 4A", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-14", dagerTilUtlop: 2, totalArsleie: 384649.65, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 13", customerId: 67267, bygg: "Lilleakerveien 2E", totalArsleie: 101081,
    status: "Reforhandling pågår",
    statusKilde: "SF-prosjekt (Reforhandling, Gjennomføring): «Selskapslokaler - Lilleakerveien 2 E» — byggnavn-match, ikke direkte kontraktkobling",
    lines: [
      { linjeId: 185901, beskrivelse: "Felleskostnader for Husleie avg.pl", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-18", dagerTilUtlop: 6, totalArsleie: 0, reforhandlet: false },
      { linjeId: 185902, beskrivelse: "Husleie avg.pl", bygg: "Lilleakerveien 2E", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-18", dagerTilUtlop: 6, totalArsleie: 101081, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 18", customerId: 67199, bygg: "Vollsveien 13D", totalArsleie: 4318.1,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159175, beskrivelse: "Felleskostnader for Lagerleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-30", dagerTilUtlop: 18, totalArsleie: 0, reforhandlet: false },
      { linjeId: 213729, beskrivelse: "Energi fast avg.pl.", bygg: "Vollsveien 13D", arealtype: "Lager", leietype: "Energi", slutt: "2026-08-30", dagerTilUtlop: 18, totalArsleie: 1816.05, reforhandlet: false },
      { linjeId: 159176, beskrivelse: "Lagerleie avg.fritt", bygg: "Vollsveien 13D", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-30", dagerTilUtlop: 18, totalArsleie: 2502.05, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 19", customerId: 68074, bygg: "Gamle Drammensvei 10", totalArsleie: 120000,
    status: "Ingen varsel",
    lines: [
      { linjeId: 186558, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 186559, beskrivelse: "Husleie avg.fritt", bygg: "Gamle Drammensvei 10", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 120000, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 20", customerId: 68084, bygg: "Gamle Drammensvei 10", totalArsleie: 171587.88,
    status: "Mulig endring",
    statusKilde: "SF-sak: «Flytte ut?» / «Re: Flytte ut?» (uklart utfall)",
    lines: [
      { linjeId: 214104, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 214105, beskrivelse: "Husleie avg.fritt", bygg: "Gamle Drammensvei 10", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 171587.88, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 21", customerId: 68091, bygg: "Gamle Drammensvei 10", totalArsleie: 184367.88,
    status: "Mulig endring",
    statusKilde: "SF-sak: «Flyttedato» (Avventer kunde)",
    lines: [
      { linjeId: 159219, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 159220, beskrivelse: "Husleie avg.fritt", bygg: "Gamle Drammensvei 10", arealtype: "Lager", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 184367.88, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 22", customerId: 68163, bygg: "Arnstein Arnebergsvei 4", totalArsleie: 279731.6,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159211, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 159212, beskrivelse: "Husleie avg.fritt", bygg: "Arnstein Arnebergsvei 4", arealtype: "Annet", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 279731.6, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 23", customerId: 67275, bygg: "Lilleakerveien 4CDEF Uteparkering", totalArsleie: 86623.05,
    status: "Ingen varsel",
    lines: [
      { linjeId: 158099, beskrivelse: "Felleskostnader for Parkering avg.pl. fri flyt 3 pl.", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158101, beskrivelse: "Parkering avg.pl. fri flyt 3 pl.", bygg: "Lilleakerveien 4CDEF Uteparkering", arealtype: "Fri flyt", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 86623.05, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 24", customerId: 67521, bygg: "Lilleakerveien 10", totalArsleie: 5249828.64,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159924, beskrivelse: "Felleskostnader", bygg: "(ukjent bygg)", arealtype: "Fast plass", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158611, beskrivelse: "Felleskostnader for Garasje avg.pl. 19 pl", bygg: "(ukjent bygg)", arealtype: "El-bil plass", leietype: "Garasjeleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158610, beskrivelse: "Felleskostnader avg.pl.", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 727430, reforhandlet: false },
      { linjeId: 158609, beskrivelse: "Felleskostnader for Parkering avg.pl. 2 pl", bygg: "(ukjent bygg)", arealtype: "Annet", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158778, beskrivelse: "Felleskostnader", bygg: "(ukjent bygg)", arealtype: "El-bil plass", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 156917, beskrivelse: "Felleskostnader avg.pl.", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 36639, reforhandlet: false },
      { linjeId: 161284, beskrivelse: "à konto energi avg.pl.", bygg: "Lilleakerveien 14", arealtype: "Lager", leietype: "Energi", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 116601.44, reforhandlet: false },
      { linjeId: 161848, beskrivelse: "à konto energi avg.pl.", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Energi", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 304885.56, reforhandlet: false },
      { linjeId: 161849, beskrivelse: "Kantinebidrag avg.fritt (47)", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Kantinebidrag", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 200000.04, reforhandlet: false },
      { linjeId: 158613, beskrivelse: "Husleie avg.pl.", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 2461799.14, reforhandlet: false },
      { linjeId: 158779, beskrivelse: "Parkering avg.pl. el-bil", bygg: "P-Bro Uteparkering", arealtype: "El-bil plass", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 17875.78, reforhandlet: false },
      { linjeId: 158614, beskrivelse: "Garasje avg.pl. 19 pl", bygg: "Lilleakerveien 10", arealtype: "El-bil plass", leietype: "Garasjeleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 433921.95, reforhandlet: false },
      { linjeId: 159925, beskrivelse: "Parkering avg.pl. 5 pl", bygg: "Lilleakerveien 6 Uteparkering", arealtype: "Fast plass", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 113852.7, reforhandlet: false },
      { linjeId: 158612, beskrivelse: "Parkering avg.pl. 2 pl", bygg: "Lilleakerveien 10", arealtype: "Annet", leietype: "Parkering", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 26482.64, reforhandlet: false },
      { linjeId: 156918, beskrivelse: "Lagerleie avg.pl.", bygg: "Lilleakerveien 14", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 719355.79, reforhandlet: false },
      { linjeId: 161850, beskrivelse: "Eiendomsskatt avg.pl.", bygg: "Lilleakerveien 10", arealtype: "Kontor", leietype: "Annet", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 90984.6, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 25", customerId: 66939, bygg: "Lilleakerveien 31", totalArsleie: 92535.21,
    status: "Terminert",
    statusKilde: "SF-sak: «Oppsigelse - Lilleakerveien 31, oppgang B» (Lukket)",
    lines: [
      { linjeId: 156850, beskrivelse: "Felleskostnader for Kontorleie avg.pl.", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 156852, beskrivelse: "Kontorleie avg.pl.", bygg: "Lilleakerveien 31", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 92535.21, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 1", customerId: 68049, bygg: "Lilleakerveien 31", totalArsleie: 186800,
    status: "Reforhandlet",
    statusKilde: "Fazile: signert etterfølgerkontrakt RM6909",
    lines: [
      { linjeId: 156687, beskrivelse: "Felleskostnader for Lagerleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 },
      { linjeId: 156688, beskrivelse: "Felleskostnader for Lagerleie avg.fritt.", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 },
      { linjeId: 156689, beskrivelse: "Lagerleie avg.fritt", bygg: "Lilleakerveien 31", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 95600, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 },
      { linjeId: 156690, beskrivelse: "Lagerleie avg.fritt.", bygg: "Lilleakerveien 31", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 91200, reforhandlet: true, nyKontraktsnokkel: "RM6909", nyKontraktStart: "2026-09-01", gapDager: 1 }
    ],
  },
  {
    leietaker: "Demokunde 26", customerId: 67290, bygg: "Vollsveien 13D", totalArsleie: 22957.17,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159165, beskrivelse: "Felleskostnader for Lagerleie avg.pl.", bygg: "(ukjent bygg)", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 159166, beskrivelse: "Lagerleie avg.pl.", bygg: "Vollsveien 13D", arealtype: "Lager", leietype: "Lagerleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 22957.17, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 27", customerId: 67283, bygg: "Vollsveien 13B", totalArsleie: 211694.04,
    status: "Ingen varsel",
    lines: [
      { linjeId: 178697, beskrivelse: "Felleskostnader for Kantine", bygg: "(ukjent bygg)", arealtype: "Kantine", leietype: "Felleskostnader", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false },
      { linjeId: 158931, beskrivelse: "Felleskostnader for Husleie avg.fritt", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 48256, reforhandlet: false },
      { linjeId: 161914, beskrivelse: "à konto energi avg.pl.", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Energi", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 13581.3, reforhandlet: false },
      { linjeId: 161916, beskrivelse: "Kantinebidrag avg.fritt (1)", bygg: "Vollsveien 19", arealtype: "Kantine", leietype: "Kantinebidrag", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 6000, reforhandlet: false },
      { linjeId: 158932, beskrivelse: "Husleie avg.fritt", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 143856.74, reforhandlet: false },
      { linjeId: 178698, beskrivelse: "Kantine", bygg: "Vollsveien 19", arealtype: "Kantine", leietype: "Annet", slutt: "2026-08-31", dagerTilUtlop: 19, totalArsleie: 0, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 10", customerId: 67352, bygg: "Vollsveien 13B", totalArsleie: 1383407.28,
    status: "Ingen varsel",
    lines: [
      { linjeId: 159040, beskrivelse: "Felleskostnader kontor avg.pl", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Felleskostnader", slutt: "2026-09-03", dagerTilUtlop: 22, totalArsleie: 302592, reforhandlet: false },
      { linjeId: 161954, beskrivelse: "à konto energi avg.pl. kontor", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Energi", slutt: "2026-09-03", dagerTilUtlop: 22, totalArsleie: 85162.74, reforhandlet: false },
      { linjeId: 159044, beskrivelse: "Kontorleie avg.pl", bygg: "Vollsveien 13B", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-09-03", dagerTilUtlop: 22, totalArsleie: 995652.54, reforhandlet: false }
    ],
  },
  {
    leietaker: "Demokunde 29", customerId: 101620, bygg: "Lilleakerveien 8", totalArsleie: 630000,
    status: "Ingen varsel",
    lines: [
      { linjeId: 226388, beskrivelse: "Felleskostnader for Kantinebidrag  (4)", bygg: "(ukjent bygg)", arealtype: "Kantine", leietype: "Kantinebidrag", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 0, reforhandlet: false },
      { linjeId: 215236, beskrivelse: "Felleskostnader avg.pl.", bygg: "(ukjent bygg)", arealtype: "Kontor", leietype: "Felleskostnader", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 82500, reforhandlet: false },
      { linjeId: 215238, beskrivelse: "à konto energi avg.pl.", bygg: "Lilleakerveien 8", arealtype: "Kontor", leietype: "Energi", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 22500, reforhandlet: false },
      { linjeId: 215235, beskrivelse: "Kontorleie avg.pl.", bygg: "Lilleakerveien 8", arealtype: "Kontor", leietype: "Husleie", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 525000, reforhandlet: false },
      { linjeId: 226389, beskrivelse: "Kantinebidrag  (4)", bygg: "Lilleakerveien 8", arealtype: "Kantine", leietype: "Kantinebidrag", slutt: "2026-09-04", dagerTilUtlop: 23, totalArsleie: 0, reforhandlet: false }
    ],
  },
];


/**
 * Kompakt tekst-sammendrag av dashboardets egne data, til bruk som kontekst for chatboten.
 * Ekte data: kontrakter (Fazile+Salesforce), inntektsprognose (Fazile+Visma NXT, se
 * lib/incomeForecast.ts), kalender (Outlook), garantioversikt (Asana) og kundefordringer
 * (Visma Business NXT). Fortsatt testdata: den ukentlige utviklings-grafen for
 * kundefordringer (NXT har ikke ukentlig historikk) og Privat-fanen.
 */
export function buildDashboardContext(): string {
  const lines: string[] = [];

  lines.push("KALENDER (ekte, fra Outlook — kun møter med andre deltakere, personlige blokker filtrert bort):");
  if (CALENDAR_EVENTS.length === 0) {
    lines.push("- Ingen møter i perioden.");
  } else {
    for (const m of CALENDAR_EVENTS) {
      lines.push(`- ${m.dato} ${m.start}–${m.slutt} ${m.mote} (${m.beskrivelse}, ${m.sted})${m.merknad ? ` — ${m.merknad}` : ""}`);
    }
  }

  const contractCutoff = new Date(localDateString());
  contractCutoff.setMonth(contractCutoff.getMonth() - 1);
  const recentContracts = CONTRACTS.filter((c) => c.signeringsdato >= contractCutoff.toISOString().slice(0, 10));
  lines.push(`\nNYE KONTRAKTER (siste måned, ${recentContracts.length} av ${CONTRACTS.length} totalt siden 2026):`);
  for (const c of recentContracts) {
    lines.push(
      `- ${c.kunde} | signert ${c.signeringsdato} | start ${c.startdato} | ${formatKr(c.arsbelop)}/år | ${c.bygg} | ${c.kvm} kvm | ${c.leietype}${c.sfUrl ? ` | SF: ${c.sfUrl}` : " | ikke funnet i Salesforce"}`,
    );
  }

  lines.push(`\nGARANTIOVERSIKT (ekte, fra Asana): ${GUARANTEE_TOTAL} innflyttinger mangler bankgaranti/depositum`);
  for (const g of GUARANTEES) lines.push(`- [${g.status}] ${g.leietaker}, frist ${g.frist}`);

  const totalFordringer = RECEIVABLES.reduce((s, r) => s + r.utestaende, 0);
  const antallUnderInkasso = RECEIVABLES.filter((r) => r.selskaper.some((s) => s.underInkasso)).length;
  lines.push(
    `\nKUNDEFORDRINGER (ekte, fra Visma Business NXT, ALLE 22 Mustad-selskaper): ${formatKr(totalFordringer)} totalt utestående fordelt på ${RECEIVABLES.length} leietakere, hvorav ${antallUnderInkasso} har minst én åpen post under purring/inkasso. Topp 10 størst:`,
  );
  for (const r of RECEIVABLES.slice(0, 10)) {
    const perSelskap = r.selskaper.map((s) => `${s.selskap}: ${formatKr(s.belop)}`).join(", ");
    lines.push(`- ${r.leietaker}: ${formatKr(r.utestaende)} totalt (${perSelskap})`);
  }

  lines.push(`\n${buildIncomeForecastContext()}`);

  lines.push(
    `\nUTLØPSLISTE (ekte, fra Fazile — kontraktslinjer som utløper ${EXPIRIES_WINDOW.fraDato} til ${EXPIRIES_WINDOW.tilDato}): ` +
      `${formatKr(EXPIRIES_TOTAL_ARSLEIE)} total eksponering, ${formatKr(EXPIRIES_REELL_EKSPONERING)} reell eksponering (ekskl. reforhandlede linjer)`,
  );
  for (const t of EXPIRIES) {
    const nearest = Math.min(...t.lines.map((l) => l.dagerTilUtlop));
    const renegotiated = t.lines.some((l) => l.reforhandlet);
    lines.push(
      `- ${t.leietaker}: ${formatKr(t.totalArsleie)}/år, ${t.lines.length} linje(r), nærmeste utløp om ${nearest} dager${renegotiated ? " (allerede reforhandlet/sikret)" : ""}`,
    );
  }

  return lines.join("\n");
}
