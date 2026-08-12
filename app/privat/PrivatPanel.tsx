"use client";

import { useEffect, useState } from "react";
import { FplBox, type FplData } from "./FplSection";
import { SportSection, WorldCupSection, type SportEvent } from "./SportSection";
import RemindersSection from "./RemindersSection";
import CalendarSection from "./CalendarSection";
import TodaySummary from "./TodaySummary";
import DartsBox from "./DartsBox";
import FinanceSection from "./FinanceSection";
import AlfredSection from "./AlfredSection";
import ShoppingListSection from "./ShoppingListSection";
import NewsSection from "./NewsSection";
import EventsSection from "./EventsSection";
import NotesSection from "./NotesSection";
import { CARD_SHELL, SkeletonRows } from "../CardShell";

export default function PrivatPanel() {
  const [fpl, setFpl] = useState<FplData | null>(null);
  const [fplLoading, setFplLoading] = useState(true);
  const [sports, setSports] = useState<SportEvent[]>([]);
  const [sportsLoading, setSportsLoading] = useState(true);
  const [sportsFetchedAt, setSportsFetchedAt] = useState<number | null>(null);
  const [worldCup, setWorldCup] = useState<SportEvent[]>([]);

  useEffect(() => {
    fetch("/api/fpl")
      .then(r => r.json())
      .then(setFpl)
      .finally(() => setFplLoading(false));
    fetch("/api/sports")
      .then(r => r.json())
      .then(d => {
        setSports(d.events ?? []);
        setSportsFetchedAt(d.fetchedAt ?? null);
      })
      .finally(() => setSportsLoading(false));
    fetch("/api/worldcup")
      .then(r => r.json())
      .then(d => setWorldCup(d.events ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <TodaySummary />
      {/* Én seksjon per linje, full bredde — en kollapset seksjon er én rad, en
          utvidet seksjon vokser nedover på samme plass. Ingen grid-reflow av
          naboseksjoner (samme mønster som Jobb-fanen bruker). */}
      <div className="flex flex-col gap-3">
        <RemindersSection />
        <CalendarSection />
        <EventsSection />
        <NotesSection />
        <FinanceSection />
        <SportSection events={sports} loading={sportsLoading} fetchedAt={sportsFetchedAt} />
        <WorldCupSection events={worldCup} />
        <AlfredSection />
        <ShoppingListSection />
        <NewsSection />
        {fplLoading ? (
          <div className={`${CARD_SHELL} p-4`}>
            <SkeletonRows count={1} className="h-5" />
          </div>
        ) : (
          fpl && <FplBox fpl={fpl} />
        )}
        <DartsBox />
      </div>
    </div>
  );
}
