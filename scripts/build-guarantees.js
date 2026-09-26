// Bygger HAR_GARANTI/MANGLER_GARANTI-arrayene i lib/widgets.local.ts og lib/widgets.anon.ts fra to
// rå JSON-filer. Erstatter HELE den gamle Guarantee/GUARANTEES-modellen (Asana-only, "mangler
// garanti"-liste fra 2026-08-10, kun 5 rader) med to separate tabeller - se filhode-kommentaren
// over HAR_GARANTI/MANGLER_GARANTI i widgets.local.ts for hvorfor (2026-09-26: den gamle lista
// fanget KUN opp innflyttinger med en fortsatt-åpen Asana-onboarding-subtask, ikke porteføljens
// fulle garantibilde - 4 av 5 rader der var faktisk løst uten at noen oppdaterte lista).
//
// FULL REFRESH-PROSEDYRE (neste runde, ~1x i måneden eller når Morten ber om det). Gjør ALT dette
// i en Claude-økt (garantidata finnes ikke via noe frittstående API - Salesforce/SharePoint/Asana/
// Outlook/Teams er alle kun tilgjengelig via MCP-verktøy i en økt):
//
//   1. SHAREPOINT (hovedkilde for HELE porteføljen, ikke bare åpne saker):
//      sharepoint_search(query: "Garantioversikt") - finn NYESTE fil under enten
//      "sites/konomi/.../Konsern/12 Leietakere/Garantier generelt/" (Fenistra-eksport, Excel-pivot
//      + detaljark "Ark1") eller Mortens egen personlige "Garantioversikt.xlsx" i
//      "personal/morten_vadla.../Dokumenter/Inntektskontroller/Garanti - Depositum/" (onboarding-
//      sporing med fritekst-historikk). Les med read_resource - store filer (>700 rader) havner i
//      en outputfil, parse den med Node (se scripts/refresh-data/garantier-<dato>-har.json sitt
//      opphav for kolonneoppsett: Kundenr/Foretaksnr/Firma/Kontrakt ID/Kontrakt/StartDato/Eiendom/
//      Kontraktstype/Årsbeløp/Garantistatus/Garantitype/Mottatt dato/Garanti til/SluttDato/
//      Depositum konto/Garanti Nr/Garantibeløp/InfoText/Meldingsfrist). Filtrer Garantistatus:
//      "Mottatt" -> HAR_GARANTI-kandidat, "Ikke mottatt"/"Under arbeid"/"Skal fornyes" ->
//      MANGLER_GARANTI-kandidat, blank/"Ikke påkrevet"/"Frigitt" -> hopp over (se
//      widgets.local.ts sin kommentar for hvorfor). ADVARSEL: Fenistra-filene er FØR
//      Fazile-migreringen 2026-01-15 - kontrakt-ID-ene der matcher IKKE dagens Fazile-ID-er, kun
//      firmanavn og garantifakta er brukbare. Kryssjekk hvert firmanavn mot TENANTS/CONTRACTS/
//      RECEIVABLES i widgets.local.ts før du tar det med - dropp rader du ikke kan bekrefte
//      fortsatt er en aktiv leietaker.
//   2. SALESFORCE: dispatch_readonly med SOQL mot Case, filtrert på Subject/dato, f.eks.
//      `SELECT Id, Subject, Status, Account.Name, LastModifiedDate FROM Case WHERE Subject
//      LIKE '%garanti%' ORDER BY LastModifiedDate DESC LIMIT 100` (kjør samme mønster for
//      "depositum"/"bankgaranti"/"konserngaranti" - dette API-et støtter IKKE OR/disjunksjoner
//      eller lange IN-lister med norske tegn pålitelig, hold ett vilkår per spørring). Bruk
//      LastModifiedDate for å luke ut alt eldre enn forrige SharePoint-snapshot.
//   3. ASANA: enumerer ALLE fortsatt-åpne "Koordinere bankgaranti eller depositum"-subtasks under
//      Onboarding-prosjekter (search_objects, resource_type task, query "bankgaranti"/"depositum"/
//      "garanti") - dette ER den offisielle "mangler garanti akkurat nå"-kilden når den finnes,
//      slå den opp FØR du stoler på noe eldre. Sjekk også "Signerte dokumenter"-prosjektet (gid
//      1213398039629849) - hver signert-kontrakt-oppgave har egne Garantitype/Garantibeløp-felt
//      som kan gi et FRISKT beløp for en rad SharePoint mangler tall for.
//   4. OUTLOOK/TEAMS: søk siste ~2-3 mnd for "garanti"/"depositum"/"bankgaranti"/"konserngaranti" -
//      fanger opp alt nyere enn steg 1-3, særlig løsninger ("mottatt", "i orden") som gjør en
//      SharePoint/Asana-rad utdatert.
//   5. Reconciler for hånd (se scripts/reconcile-garanti.js-mønsteret brukt 2026-09-26 i
//      scratchpad, ikke committet - bygg et lignende Node-script fra bunnen av neste gang): FERSK
//      kilde (steg 2-4, <2 mnd) slår ALLTID en eldre SharePoint-rad for samme leietaker - fjern
//      duplikaten fra den andre tabben helt (samme leietaker skal ALDRI stå i begge). Alt som KUN
//      er bekreftet i det gamle SharePoint-snapshotet får `usikker: true` +
//      `usikkerhetsArsak: "Kun bekreftet i Fenistra-eksporten (pre-migrering), ikke kryssjekket
//      mot noe friskere i denne runden."`. Dropp rader der beløpet er `kr 0.00`/tomt i kilden -
//      IKKE vis en gjettet nullverdi. Ekskluder helt (verken tab): leietakere som er konkurs/
//      avviklet (sjekk mot Utløpsliste sin MANUELLE_STATUS_OVERRIDES for kjente saker), og
//      leietakere der kildene motsier hverandre uten at du kan avgjøre hvem som har rett - flagg
//      disse til Morten i prosa i stedet for å gjette.
//   6. Lagre de to reconsilierte listene som scripts/refresh-data/garantier-<dato>-har.json og
//      -mangler.json (gitignored, flat JSON-array som matcher GuaranteeSecured/GuaranteeMissing +
//      et ekstra `erPrivatperson: boolean`-felt scriptet bruker til Demokunde-suffiks).
//   7. Kjør: node scripts/build-guarantees.js scripts/refresh-data/garantier-<dato>-har.json
//      scripts/refresh-data/garantier-<dato>-mangler.json
//   8. Oppdater GUARANTEES_SIST_OPPDATERT i BEGGE filer til <dato> (scriptet gjør ikke dette selv).
//
// Anonymisering: gjenbruker et eksisterende Demokunde-nummer hvis nøyaktig samme leietakernavn
// allerede finnes i CONTRACTS (matchet via delt "cN"-id), RECEIVABLES (delt "rN"-id) eller EXPIRIES
// (delt customer_id - se 2026-09-25-kommentaren i widgets.anon.ts for hvorfor akkurat customer_id
// er stabilt). Finner ingen av delene, får leietakeren et FERSKT Demokunde-nummer. Kjente
// fritekstfelt som lekker et navn i en annen form eller en kontaktpersons navn saneres via
// FRITEKST_ANON_OVERRIDES under - legg til nye der etter hvert som du finner dem (grep
// widgets.anon.ts etter ekte navn FØR commit er den egentlige sikkerhetssjekken, se
// ANONYMISERING.md).

const fs = require("fs");
const path = require("path");

const LOCAL_FILE = path.join(__dirname, "..", "lib", "widgets.local.ts");
const ANON_FILE = path.join(__dirname, "..", "lib", "widgets.anon.ts");

function esc(s) {
  return String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function jsVal(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  return `"${esc(v)}"`;
}

// Kjente fritekstfelt som nevner leietakerens eget navn (i en annen form) eller en kontaktperson -
// MÅ saniteres for anon-fila (samme "ALLE selskapsnavn/personnavn i fritekst"-policy som
// CONTRACT_DETALJER, se widgets.anon.ts sin kommentar der). Nøkkel = leietaker (ekte navn).
const FRITEKST_ANON_OVERRIDES = {
  "Heidelberg Materials Betong Norge AS": {
    field: "kilde",
    replace: ["Heidelberg Materials Norway AS", "et tilknyttet selskap"],
  },
  "Onesubsea Processing AS": {
    field: "kilde",
    replace: ["Onesubsea AS", "et tilknyttet selskap"],
  },
  "Lakkbar AS": {
    field: "sisteStatusFritekst",
    replace: ["mail til Fanny 18.08", "mail til kontaktperson 18.08"],
  },
  Dyresen: {
    field: "sisteStatusFritekst",
    replace: ["Magnus eneleietaker", "eneleietaker"],
  },
  "Arbion Industries AS": {
    field: "usikkerhetsArsak",
    replace: [
      "Vow Green Metals AS i 2025-10-24-uttrekket, Arbion Industries AS i 2026-02-27-uttrekket",
      "to ulike selskapsnavn i de to uttrekkene",
    ],
  },
};

function nesteDemokundeNummer(tekst) {
  const alle = [...tekst.matchAll(/Demokunde (\d+)/g)].map((m) => Number(m[1]));
  return Math.max(...alle) + 1;
}

// Bygger et navn->anonNavn-oppslag fra alle tre kildearrayene, matchet via deres respektive
// delte ID-er (IKKE linjeposisjon - se 2026-09-26-kommentaren i build-new-contracts.js for hvorfor
// posisjonsmatching er utrygt).
function byggNavnTilAnon(localTekst, anonTekst) {
  const map = new Map();

  const cLocal = new Map([...localTekst.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const cAnon = new Map([...anonTekst.matchAll(/id: "(c\d+)", kunde: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const [id, kunde] of cLocal) if (cAnon.has(id)) map.set(kunde, cAnon.get(id));

  const rLocal = new Map([...localTekst.matchAll(/id: "(r\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const rAnon = new Map([...anonTekst.matchAll(/id: "(r\d+)", leietaker: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const [id, navn] of rLocal) if (rAnon.has(id) && !map.has(navn)) map.set(navn, rAnon.get(id));

  const eLocal = new Map(
    [...localTekst.matchAll(/leietaker: "([^"]+)", customerId: (\d+),/g)].map((m) => [Number(m[2]), m[1]]),
  );
  const eAnon = new Map(
    [...anonTekst.matchAll(/leietaker: "([^"]+)", customerId: (\d+),/g)].map((m) => [Number(m[2]), m[1]]),
  );
  for (const [id, navn] of eLocal) if (eAnon.has(id) && !map.has(navn)) map.set(navn, eAnon.get(id));

  return map;
}

function renderSecured(g, leietaker, id) {
  let out = `  { id: "${id}", leietaker: "${esc(leietaker)}", belop: ${g.belop}, type: "${g.type}",\n`;
  out += `    garantiUtlop: ${jsVal(g.garantiUtlop)}, leieforholdUtlop: ${jsVal(g.leieforholdUtlop)}, bygg: ${jsVal(g.bygg)}, lenke: ${jsVal(g.lenke)},\n`;
  out += `    kilde: "${esc(g.kilde)}"`;
  if (g.usikker) out += `, usikker: true, usikkerhetsArsak: "${esc(g.usikkerhetsArsak)}"`;
  out += " },";
  return out;
}

function renderMissing(g, leietaker, id) {
  let out = `  { id: "${id}", leietaker: "${esc(leietaker)}", bygg: ${jsVal(g.bygg)}, innflytting: ${jsVal(g.innflytting)},\n`;
  out += `    type: ${jsVal(g.type)}, belopAvtalt: ${jsVal(g.belopAvtalt)}, status: "${g.status}",\n`;
  out += `    sisteStatusFritekst: ${jsVal(g.sisteStatusFritekst)}, kilde: "${esc(g.kilde)}"`;
  if (g.usikker) out += `, usikker: true, usikkerhetsArsak: "${esc(g.usikkerhetsArsak)}"`;
  out += " },";
  return out;
}

function applyFritekstOverride(g, ektNavn) {
  const override = FRITEKST_ANON_OVERRIDES[ektNavn];
  if (!override) return g;
  const value = g[override.field];
  if (!value || !value.includes(override.replace[0])) return g;
  return { ...g, [override.field]: value.replace(override.replace[0], override.replace[1]) };
}

function main() {
  const harPath = process.argv[2];
  const manglerPath = process.argv[3];
  if (!harPath || !manglerPath) {
    console.error("Bruk: node scripts/build-guarantees.js <har-garanti.json> <mangler-garanti.json>");
    process.exit(1);
  }
  const harData = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const manglerData = JSON.parse(fs.readFileSync(manglerPath, "utf8"));

  let localTekst = fs.readFileSync(LOCAL_FILE, "utf8");
  let anonTekst = fs.readFileSync(ANON_FILE, "utf8");

  const navnTilAnon = byggNavnTilAnon(localTekst, anonTekst);
  let demokundeTeller = nesteDemokundeNummer(anonTekst);
  const ikkeGjenfunnet = [];

  function anonNavnFor(ektNavn, erPrivatperson) {
    if (navnTilAnon.has(ektNavn)) return navnTilAnon.get(ektNavn);
    const navn = `Demokunde ${demokundeTeller++}` + (erPrivatperson ? "" : " AS");
    ikkeGjenfunnet.push(ektNavn);
    return navn;
  }

  const harLocalBlokker = [];
  const harAnonBlokker = [];
  harData.forEach((g, i) => {
    const id = `hg${i + 1}`;
    harLocalBlokker.push(renderSecured(g, g.leietaker, id));
    const anonNavn = anonNavnFor(g.leietaker, g.erPrivatperson);
    harAnonBlokker.push(renderSecured(applyFritekstOverride(g, g.leietaker), anonNavn, id));
  });

  const manglerLocalBlokker = [];
  const manglerAnonBlokker = [];
  manglerData.forEach((g, i) => {
    const id = `mg${i + 1}`;
    manglerLocalBlokker.push(renderMissing(g, g.leietaker, id));
    const anonNavn = anonNavnFor(g.leietaker, g.erPrivatperson);
    manglerAnonBlokker.push(renderMissing(applyFritekstOverride(g, g.leietaker), anonNavn, id));
  });

  const harLocalArray = `export const HAR_GARANTI: GuaranteeSecured[] = [\n${harLocalBlokker.join("\n")}\n];`;
  const harAnonArray = `export const HAR_GARANTI: GuaranteeSecured[] = [\n${harAnonBlokker.join("\n")}\n];`;
  const manglerLocalArray = `export const MANGLER_GARANTI: GuaranteeMissing[] = [\n${manglerLocalBlokker.join("\n")}\n];`;
  const manglerAnonArray = `export const MANGLER_GARANTI: GuaranteeMissing[] = [\n${manglerAnonBlokker.join("\n")}\n];`;

  const harRegex = /export const HAR_GARANTI: GuaranteeSecured\[\] = \[[\s\S]*?\n\];/;
  const manglerRegex = /export const MANGLER_GARANTI: GuaranteeMissing\[\] = \[[\s\S]*?\n\];/;

  if (!harRegex.test(localTekst) || !manglerRegex.test(localTekst)) {
    console.error("Fant ikke HAR_GARANTI/MANGLER_GARANTI-arrayene i widgets.local.ts - avbryter.");
    process.exit(1);
  }
  localTekst = localTekst.replace(harRegex, harLocalArray).replace(manglerRegex, manglerLocalArray);
  anonTekst = anonTekst.replace(harRegex, harAnonArray).replace(manglerRegex, manglerAnonArray);

  fs.writeFileSync(LOCAL_FILE, localTekst);
  fs.writeFileSync(ANON_FILE, anonTekst);
  console.log(`Skrev ${harData.length} HAR_GARANTI-rader og ${manglerData.length} MANGLER_GARANTI-rader.`);
  if (ikkeGjenfunnet.length > 0) {
    console.log(`\n${ikkeGjenfunnet.length} leietaker(e) fikk et FERSKT Demokunde-nummer (ingen eksisterende match funnet):`);
    for (const navn of ikkeGjenfunnet) console.log(`  - ${navn}`);
  }
  console.log("\nHusk: grep gjennom widgets.anon.ts etter ekte navn FØR commit (se ANONYMISERING.md).");
}

if (require.main === module) main();

module.exports = { byggNavnTilAnon, renderSecured, renderMissing };
