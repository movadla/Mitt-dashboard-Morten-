"use client";

import { useEffect, useState } from "react";
import { FplBox, type FplData } from "./FplSection";
import { SportSection, WorldCupSection, type SportEvent } from "./SportSection";
import RemindersSection from "./RemindersSection";
import CalendarSection from "./CalendarSection";
import TodaySummary from "./TodaySummary";

export default function PrivatPanel() {
  const [fpl, setFpl] = useState<FplData | null>(null);
  const [sports, setSports] = useState<SportEvent[]>([]);
  const [sportsLoading, setSportsLoading] = useState(true);
  const [worldCup, setWorldCup] = useState<SportEvent[]>([]);

  useEffect(() => {
    fetch("/api/fpl").then(r => r.json()).then(setFpl);
    fetch("/api/sports")
      .then(r => r.json())
      .then(d => setSports(d.events ?? []))
      .finally(() => setSportsLoading(false));
    fetch("/api/worldcup")
      .then(r => r.json())
      .then(d => setWorldCup(d.events ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <TodaySummary />
      {fpl && <FplBox fpl={fpl} />}
      <RemindersSection />
      <CalendarSection />
      <SportSection events={sports} loading={sportsLoading} />
      <WorldCupSection events={worldCup} />
    </div>
  );
}
