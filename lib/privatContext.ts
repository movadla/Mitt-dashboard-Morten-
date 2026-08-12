import { getSportEvents } from "./sports";
import { getFplData } from "./fpl";
import { getReminders } from "./reminders";
import { getPrivatEvents } from "./privatCalendar";
import { getNotes } from "./notes";
import { getLoans } from "./loans";
import { getSavings } from "./savings";
import { getSalaryEntries } from "./salary";
import { getAlfredProfile, getGrowthEntries, getMilestones } from "./alfred";
import { getShoppingItems } from "./shoppingList";
import { getLifeEvents, isPaydayToday, nextOccurrence, nextPaydayFrom } from "./events";
import { localDateString } from "./payday";
import { formatKr } from "./widgets";

/**
 * Utvidet kontekst for Privat-fanen: sport-fixtures, FPL og de ekte,
 * skyllagrede påminnelsene/kalenderhendelsene. Hver kilde hentes uavhengig
 * (Promise.allSettled) slik at én treg/feilende kilde ikke velter hele
 * chat-svaret.
 *
 * Egen fil, adskilt fra lib/widgets.ts: denne importerer til slutt inn
 * ioredis (via lib/reminders.ts/lib/privatCalendar.ts → lib/kv.ts), som
 * bruker Node-innebygde moduler (dns/net) og derfor IKKE kan havne i et
 * modulgraf som en klientkomponent importerer fra (dashboard.tsx importerer
 * lib/widgets.ts for formatKr/CONTRACTS osv. — hadde buildPrivatContext
 * ligget der, ville ioredis blitt dratt inn i nettleser-bunten og feilet
 * bygget). app/api/chat/route.ts (en server-only route) er eneste bruker.
 */
export async function buildPrivatContext(): Promise<string> {
  const [
    sportsResult,
    fplResult,
    remindersResult,
    eventsResult,
    notesResult,
    loansResult,
    savingsResult,
    salaryResult,
    alfredProfileResult,
    growthResult,
    milestonesResult,
    shoppingResult,
    lifeEventsResult,
  ] = await Promise.allSettled([
    getSportEvents(),
    getFplData(),
    getReminders(),
    getPrivatEvents(),
    getNotes(),
    getLoans(),
    getSavings(),
    getSalaryEntries(),
    getAlfredProfile(),
    getGrowthEntries(),
    getMilestones(),
    getShoppingItems(),
    getLifeEvents(),
  ]);

  const lines: string[] = [];

  lines.push("\nSPORT (kommende, hentet live):");
  if (sportsResult.status === "fulfilled" && sportsResult.value.length > 0) {
    for (const e of sportsResult.value.slice(0, 15)) {
      lines.push(`- ${e.date}${e.time ? ` ${e.time}` : ""} ${e.name} (${e.competition})${e.venue ? ` — ${e.venue}` : ""}`);
    }
  } else {
    lines.push("- Ingen sportsdata tilgjengelig akkurat nå.");
  }

  lines.push("\nFANTASY PREMIER LEAGUE:");
  if (fplResult.status === "fulfilled" && fplResult.value.active && fplResult.value.teams?.length) {
    const fpl = fplResult.value;
    lines.push(`Neste deadline: ${fpl.gw?.deadline ?? "ukjent"} (${fpl.gw?.name ?? ""})`);
    for (const t of fpl.teams ?? []) {
      lines.push(
        `- ${t.teamName}: ${t.totalPoints ?? "—"} poeng totalt, verdensrangering ${t.overallRank ?? "—"}, GW${t.currentGw ?? "—"}: ${t.currentGwPoints ?? "—"} poeng`,
      );
    }
  } else {
    lines.push("- Ingen FPL-data tilgjengelig akkurat nå.");
  }

  lines.push("\nPÅMINNELSER (ekte, kan endres av deg eller av deg via chat):");
  if (remindersResult.status === "fulfilled" && remindersResult.value.length > 0) {
    for (const r of remindersResult.value) {
      lines.push(
        `- [${r.done ? "Ferdig" : "Ikke ferdig"}] ${r.text}${r.dueDate ? ` (frist ${r.dueDate})` : ""}${r.recurrence !== "none" ? ` — gjentar ${r.recurrence}` : ""}`,
      );
    }
  } else {
    lines.push("- Ingen påminnelser lagt inn ennå.");
  }

  lines.push("\nPRIVAT KALENDER (ekte, redigerbar):");
  if (eventsResult.status === "fulfilled" && eventsResult.value.length > 0) {
    for (const e of eventsResult.value) {
      lines.push(
        `- ${e.date}${e.startTime ? ` ${e.startTime}` : ""}${e.endTime ? `–${e.endTime}` : ""} ${e.title}${e.note ? ` — ${e.note}` : ""}`,
      );
    }
  } else {
    lines.push("- Ingen hendelser lagt inn ennå.");
  }

  lines.push("\n#NOTATER (ekte, fritekst-idéer uten frist/dato — redigerbart via #Notater-boksen):");
  if (notesResult.status === "fulfilled" && notesResult.value.length > 0) {
    for (const n of notesResult.value) {
      lines.push(`- ${n.text}`);
    }
  } else {
    lines.push("- Ingen notater lagt inn ennå.");
  }

  lines.push("\nØKONOMI — LÅN (ekte, redigerbart via Økonomi-boksen):");
  if (loansResult.status === "fulfilled" && loansResult.value.length > 0) {
    const total = loansResult.value.reduce((sum, l) => sum + l.remainingAmount, 0);
    lines.push(`Totalt gjenstående på tvers av alle lån: ${formatKr(total)}.`);
    for (const l of loansResult.value) {
      lines.push(
        `- ${l.name} (${l.lender}): ${formatKr(l.remainingAmount)} gjenstående av ${l.originalAmount ? formatKr(l.originalAmount) : "ukjent opprinnelig beløp"}` +
          `${l.nominalRate !== undefined ? `, ${l.nominalRate}% nominell rente` : ""}${l.nextPaymentDate ? `, neste betaling ${l.nextPaymentDate}` : ""}` +
          `${l.rateFixedUntil ? `, fastrente til ${l.rateFixedUntil}` : ""}${l.maturityDate ? `, innfrielsesdato ${l.maturityDate}` : ""}`,
      );
    }
  } else {
    lines.push("- Ingen lån lagt inn ennå.");
  }

  lines.push("\nØKONOMI — SPARING (ekte, redigerbart via Økonomi-boksen):");
  if (savingsResult.status === "fulfilled" && savingsResult.value.length > 0) {
    const total = savingsResult.value.reduce((sum, s) => sum + s.balance, 0);
    lines.push(`Totalt på tvers av alle sparekontoer: ${formatKr(total)}.`);
    for (const s of savingsResult.value) {
      lines.push(`- ${s.name} (${s.institution}): ${formatKr(s.balance)}${s.note ? ` — ${s.note}` : ""}`);
    }
  } else {
    lines.push("- Ingen sparing lagt inn ennå.");
  }

  lines.push("\nØKONOMI — LØNN (ekte, redigerbart via Økonomi-boksen):");
  if (salaryResult.status === "fulfilled" && salaryResult.value.length > 0) {
    for (const s of salaryResult.value) {
      lines.push(
        `- ${s.person} (${s.employer}): ${formatKr(s.grossMonthly)}/mnd brutto${s.netMonthly !== undefined ? `, ${formatKr(s.netMonthly)}/mnd netto` : ""}${s.note ? ` — ${s.note}` : ""}`,
      );
    }
  } else {
    lines.push("- Ingen lønn lagt inn ennå.");
  }

  lines.push("\nALFRED (Mortens sønn, født 29.12.2025 — ekte, redigerbart via Alfred-boksen):");
  if (alfredProfileResult.status === "fulfilled" && alfredProfileResult.value) {
    const p = alfredProfileResult.value;
    lines.push(`Foreldre: ${p.parents}. Bor: ${p.address}.`);
    if (p.helseNotat) lines.push(`Helse: ${p.helseNotat}`);
    if (p.matOgSovnNotat) lines.push(`Mat og søvn: ${p.matOgSovnNotat}`);
    if (p.motorikkNotat) lines.push(`Motorisk (notat): ${p.motorikkNotat}`);
    if (p.permisjonNotat) lines.push(`Permisjon: ${p.permisjonNotat}`);
    if (p.barnehageNotat) lines.push(`Barnehage: ${p.barnehageNotat}`);
    if (p.barnesikringNotat) lines.push(`Barnesikring: ${p.barnesikringNotat}`);
  }
  if (growthResult.status === "fulfilled" && growthResult.value.length > 0) {
    const latest = growthResult.value[growthResult.value.length - 1];
    lines.push(
      `Siste vekstmåling: ${latest.weightKg} kg${latest.lengthCm ? ` / ${latest.lengthCm} cm` : ""} (${latest.date}).`,
    );
  }
  if (milestonesResult.status === "fulfilled" && milestonesResult.value.length > 0) {
    const open = milestonesResult.value.filter((m) => !m.done);
    const done = milestonesResult.value.filter((m) => m.done);
    if (done.length > 0) lines.push(`Allerede oppnådd: ${done.map((m) => m.label).join("; ")}.`);
    if (open.length > 0) lines.push(`Gjenstår/kommende fokus: ${open.map((m) => m.label).join("; ")}.`);
  }
  if (
    (alfredProfileResult.status !== "fulfilled" || !alfredProfileResult.value) &&
    (growthResult.status !== "fulfilled" || growthResult.value.length === 0)
  ) {
    lines.push("- Ingen data om Alfred lagt inn ennå.");
  }

  lines.push("\nHANDLELISTE (ekte, redigerbar via Handleliste-boksen):");
  if (shoppingResult.status === "fulfilled" && shoppingResult.value.length > 0) {
    const open = shoppingResult.value.filter((i) => !i.done);
    if (open.length > 0) {
      for (const i of open) {
        lines.push(`- ${i.name}${i.quantity ? ` (${i.quantity})` : ""} — ${i.section}`);
      }
    } else {
      lines.push("- Alt er huket av som kjøpt.");
    }
  } else {
    lines.push("- Ingen varer lagt inn ennå.");
  }

  lines.push("\nHENDELSER (bursdager, permisjon, bolig, annet — ekte, redigerbart via Hendelser-boksen):");
  const today = localDateString();
  lines.push(`- Neste lønningsdag: ${nextPaydayFrom(today)}${isPaydayToday(today) ? " (i dag)" : ""}.`);
  if (lifeEventsResult.status === "fulfilled" && lifeEventsResult.value.length > 0) {
    for (const e of lifeEventsResult.value) {
      lines.push(`- ${e.title} (${e.category}) — ${nextOccurrence(e, today)}${e.yearly ? " (årlig)" : ""}`);
    }
  } else {
    lines.push("- Ingen andre hendelser lagt inn ennå.");
  }

  return lines.join("\n");
}
