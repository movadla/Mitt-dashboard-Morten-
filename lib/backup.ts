import { getReminders } from "./reminders";
import { getPrivatEvents } from "./privatCalendar";
import { getLoans } from "./loans";
import { getSavings } from "./savings";
import { getSalaryEntries } from "./salary";
import { getAlfredProfile, getGrowthEntries, getMilestones } from "./alfred";
import { getShoppingItems } from "./shoppingList";
import { getLifeEvents } from "./events";
import { getCustomSportEvents } from "./customSports";
import { getChatHistory } from "./chatHistory";
import { getManualIncomeLines } from "./incomeForecastManual";
import { getAllComments } from "./comments";
import { getJobbReminders } from "./jobbReminders";
import { getJobbEvents } from "./jobbEvents";
import { getLeasingManagers } from "./leasingManagers";
import { getProcedureNotes } from "./procedureNotes";
import { getNotes } from "./notes";
import { getQuickPicks } from "./shoppingQuickPicks";

/**
 * Full dump av alt ekte data i Redis (Privat- og Jobb-fanen). Redis Cloud-
 * gratisplanen som brukes her er RAM-only (ingen persistens/HA) — dette er
 * et manuelt/planlagt sikkerhetsnett, ikke en erstatning for ekte
 * databasepersistens. Cache-nøkler (sport/FPL) er bevisst utelatt — de er
 * regenererbare fra eksterne API-er og ikke verdt å ta vare på.
 */
export async function buildBackup() {
  const [
    reminders,
    events,
    loans,
    savings,
    salary,
    alfredProfile,
    growth,
    milestones,
    shopping,
    lifeEvents,
    customSports,
    chatHistory,
    manualIncomeLines,
    comments,
    jobbReminders,
    jobbEvents,
    leasingManagers,
    procedureNotes,
    notes,
    shoppingQuickPicks,
  ] = await Promise.all([
    getReminders(),
    getPrivatEvents(),
    getLoans(),
    getSavings(),
    getSalaryEntries(),
    getAlfredProfile(),
    getGrowthEntries(),
    getMilestones(),
    getShoppingItems(),
    getLifeEvents(),
    getCustomSportEvents(),
    getChatHistory(),
    getManualIncomeLines(),
    getAllComments(),
    getJobbReminders(),
    getJobbEvents(),
    getLeasingManagers(),
    getProcedureNotes(),
    getNotes(),
    getQuickPicks(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    reminders,
    calendar: events,
    loans,
    savings,
    salary,
    alfred: { profile: alfredProfile, growth, milestones },
    shopping,
    lifeEvents,
    customSports,
    chatHistory,
    manualIncomeLines,
    comments,
    jobbReminders,
    jobbEvents,
    leasingManagers,
    procedureNotes,
    notes,
    shoppingQuickPicks,
  };
}
