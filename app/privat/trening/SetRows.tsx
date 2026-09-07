"use client";

import { useState } from "react";
import { CheckIcon } from "../../CardShell";
import type { SetIntensity, SetLog } from "@/lib/workouts";
import { vibrate } from "@/lib/haptics";
import SwipeableRow from "../SwipeableRow";
import { X } from "lucide-react";
import { INTENSITY_LABEL, chartCoords, formatKg, roundKg, type ExerciseHistoryPoint } from "./treningHelpers";

// Gjenbrukt "done"-avkrysning — samme visuelle mønster (fylt grønn sirkel med
// hake) som MilestoneRow i AlfredSection.tsx og ItemRow i ShoppingListSection.tsx.
export function DoneToggle({
  done,
  onToggle,
  size = "md",
  label,
}: {
  done: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  label: string;
}) {
  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={label}
      className={`grid ${dim} shrink-0 place-items-center rounded-full ring-1 transition ${
        done ? "bg-status-positive ring-status-positive" : "bg-transparent ring-line-strong hover:ring-line-strong"
      }`}
    >
      {done && <CheckIcon className="h-3.5 w-3.5 text-surface-0" />}
    </button>
  );
}

// Enkel innebygd SVG-linjegraf — ingen chart-bibliotek i prosjektet, og en
// håndfull punkter (typisk et titalls økter) trenger ikke noe tyngre enn dette.
// To linjer (vekt + totalt antall reps), hver normalisert til egen skala —
// se chartCoords.
export function ProgressChart({ points }: { points: ExerciseHistoryPoint[] }) {
  if (points.length < 2) {
    return <p className="text-2xs text-ink-4">Ikke nok data ennå for graf.</p>;
  }

  const width = 260;
  const height = 64;
  const pad = 6;
  const kgValues = points.map((p) => p.maxKg);
  const repValues = points.map((p) => p.totalReps);
  const kgCoords = chartCoords(kgValues, width, height, pad);
  const repCoords = chartCoords(repValues, width, height, pad);

  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Rå farger, ikke status-positive/status-action — de er reservert
            ekte suksess-/handlings-tilstander andre steder i appen (se
            SportSection.tsx). Reps-linjen er stiplet i tillegg til å ha
            egen farge, så de to seriene skiller seg selv i gråtoner. */}
        <polyline
          points={kgCoords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          className="text-emerald-400"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {kgCoords.map((c, i) => (
          <circle key={`kg-${i}`} cx={c.x} cy={c.y} r="2.5" className="text-emerald-400" fill="currentColor" />
        ))}
        <polyline
          points={repCoords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          className="text-sky-400"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {repCoords.map((c, i) => (
          <circle key={`reps-${i}`} cx={c.x} cy={c.y} r="2" className="text-sky-400" fill="currentColor" />
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-4">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          {formatKg(Math.min(...kgValues))}–{formatKg(Math.max(...kgValues))} kg
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
          {Math.min(...repValues)}–{Math.max(...repValues)} reps totalt
        </span>
        <span>siste {points.length} {points.length === 1 ? "økt" : "økter"}</span>
      </div>
    </div>
  );
}

// Kg/reps lagres lokalt til feltet mister fokus (samme mønster som andre
// inline-redigerbare felt i appen) — unngår at hver tastetrykk sender en
// egen nettverksforespørsel.
// Liten +/- knapp brukt av kg/reps-stepperne under.
export function StepperButton({ symbol, label, onClick }: { symbol: "+" | "−"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-1 text-sm text-ink-2 transition hover:border-line-strong hover:bg-surface-3 hover:text-ink-1 active:scale-95"
    >
      {symbol}
    </button>
  );
}

// bg-surface-2 (ett hakk lysere enn EntryRow sin surface-1) — settraden skal
// alternere tydelig fra øvelse-nivået rundt, i stedet for å dele bakgrunn med
// den (tidligere: begge surface-1, så settet "forsvant" inn i øvelsen).
// Ingen egen border her lenger — tone+avstand alene skiller radene, samme
// prinsipp som Strong/Hevy bruker for tette sett-lister.
export function SetRowShell({
  index,
  done,
  previousLabel,
  pr = false,
  onToggleDone,
  onRemove,
  children,
}: {
  index: number;
  done: boolean;
  previousLabel?: string;
  // Satt når vekten i dette settet slår alt tidligere logget på øvelsen —
  // en liten motiverende markør, ikke noe som lagres på settet selv.
  pr?: boolean;
  onToggleDone: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <SwipeableRow onSwipeLeft={onRemove} leftLabel="Slett">
      <div
        className={`flex flex-col gap-1.5 rounded-xl px-2 py-2 transition ${
          done ? "bg-status-positive/10" : "bg-surface-2"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <DoneToggle done={done} onToggle={onToggleDone} size="sm" label={done ? "Merk sett som ikke fullført" : "Merk sett som fullført"} />
            <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-4">Sett {index + 1}</span>
            {pr && (
              <span className="shrink-0 rounded-full bg-status-positive/15 px-1.5 py-0.5 text-2xs font-semibold uppercase text-status-positive">
                PR
              </span>
            )}
            {/* "Spøkelses"-verdi fra forrige gang samme sett-indeks ble logget
                — gir progresjon sett-for-sett, ikke bare et sammendrag øverst
                i øvelsen. */}
            {previousLabel && <span className="truncate text-2xs text-ink-4">Sist: {previousLabel}</span>}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Slett sett"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-4 transition hover:bg-surface-3 hover:text-status-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </SwipeableRow>
  );
}

export function StrengthSetRow({
  set,
  index,
  previousLabel,
  bodyweight = false,
  bestEverKg = 0,
  onUpdate,
  onToggleDone,
  onRemove,
}: {
  set: SetLog;
  index: number;
  previousLabel?: string;
  bodyweight?: boolean;
  // Høyeste vekt noensinne logget på denne øvelsen (på tvers av ALLE
  // tidligere økter, ikke bare forrige) — brukt til å avgjøre om dette
  // settet er en ny personlig rekord.
  bestEverKg?: number;
  onUpdate: (updates: { kg: number | null; reps: number | null }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
}) {
  const [kg, setKg] = useState(set.kg?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const kgNum = kg.trim() ? Number(kg) : null;
  const isPr = !bodyweight && kgNum != null && kgNum > bestEverKg;

  function commit(nextKg: string, nextReps: string) {
    onUpdate({
      kg: nextKg.trim() ? Number(nextKg) : null,
      reps: nextReps.trim() ? Number(nextReps) : null,
    });
  }

  // Knappe-trykk er en diskret handling og committer umiddelbart — i
  // motsetning til fritekst-inntasting i feltene, som fortsatt committer på
  // blur (unngår ett nettverkskall per tastetrykk der).
  function adjustKg(delta: number) {
    vibrate(6);
    const current = kg.trim() ? Number(kg) : 0;
    const next = roundKg(Math.max(0, current + delta));
    const nextStr = formatKg(next);
    setKg(nextStr);
    commit(nextStr, reps);
  }

  function adjustReps(delta: number) {
    vibrate(6);
    const current = reps.trim() ? Number(reps) : 0;
    const next = Math.max(0, current + delta);
    const nextStr = String(next);
    setReps(nextStr);
    commit(kg, nextStr);
  }

  return (
    <SetRowShell index={index} done={!!set.done} previousLabel={previousLabel} pr={isPr} onToggleDone={onToggleDone} onRemove={onRemove}>
      {/* Enhets-etiketten ligger UNDER feltet, ikke inni det. Et suffiks inni
          krevde stor høyre-padding, og på en smal mobilkolonne ble det da for
          lite plass igjen til to sifre — tallet forsvant bak "kg"/"reps".
          Etiketten er samtidig alltid synlig nå (ikke bare når feltet er
          tomt, som en placeholder ville vært). */}
      <div className={`grid gap-2 ${bodyweight ? "grid-cols-1" : "grid-cols-2"}`}>
        {!bodyweight && (
          <div className="flex min-w-0 flex-col items-center gap-0.5">
            <div className="flex w-full items-center gap-1">
              <StepperButton symbol="−" label="Reduser vekt" onClick={() => adjustKg(-2.5)} />
              <input
                type="number"
                step="0.5"
                inputMode="decimal"
                value={kg}
                onChange={(e) => setKg(e.target.value)}
                onBlur={() => commit(kg, reps)}
                aria-label="Vekt i kg"
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-1 py-1.5 text-center text-lg font-semibold tabular-nums text-ink-1 outline-none focus:border-line-strong"
              />
              <StepperButton symbol="+" label="Øk vekt" onClick={() => adjustKg(2.5)} />
            </div>
            <span className="text-2xs font-medium uppercase tracking-wide text-ink-4">kg</span>
          </div>
        )}
        <div className="flex min-w-0 flex-col items-center gap-0.5">
          <div className="flex w-full items-center gap-1">
            <StepperButton symbol="−" label="Reduser reps" onClick={() => adjustReps(-1)} />
            <input
              type="number"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              onBlur={() => commit(kg, reps)}
              aria-label="Antall reps"
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-1 px-1 py-1.5 text-center text-lg font-semibold tabular-nums text-ink-1 outline-none focus:border-line-strong"
            />
            <StepperButton symbol="+" label="Øk reps" onClick={() => adjustReps(1)} />
          </div>
          <span className="text-2xs font-medium uppercase tracking-wide text-ink-4">reps</span>
        </div>
      </div>
    </SetRowShell>
  );
}

const INTENSITY_OPTIONS: SetIntensity[] = ["lav", "middels", "hoy"];

export function CardioSetRow({
  set,
  index,
  previousLabel,
  onUpdate,
  onToggleDone,
  onRemove,
}: {
  set: SetLog;
  index: number;
  previousLabel?: string;
  onUpdate: (updates: { minutes: number | null; kmt: number | null; distanceKm: number | null; intensity: SetIntensity | null }) => void;
  onToggleDone: () => void;
  onRemove: () => void;
}) {
  const [minutes, setMinutes] = useState(set.minutes?.toString() ?? "");
  const [kmt, setKmt] = useState(set.kmt?.toString() ?? "");
  const [distanceKm, setDistanceKm] = useState(set.distanceKm?.toString() ?? "");
  const [intensity, setIntensity] = useState<SetIntensity | "">(set.intensity ?? "");

  function commit(nextMinutes: string, nextKmt: string, nextDistanceKm: string, nextIntensity: SetIntensity | "") {
    onUpdate({
      minutes: nextMinutes.trim() ? Number(nextMinutes) : null,
      kmt: nextKmt.trim() ? Number(nextKmt) : null,
      distanceKm: nextDistanceKm.trim() ? Number(nextDistanceKm) : null,
      intensity: nextIntensity || null,
    });
  }

  function adjustMinutes(delta: number) {
    vibrate(6);
    const current = minutes.trim() ? Number(minutes) : 0;
    const next = Math.max(0, current + delta);
    const nextStr = String(next);
    setMinutes(nextStr);
    commit(nextStr, kmt, distanceKm, intensity);
  }

  function adjustKmt(delta: number) {
    vibrate(6);
    const current = kmt.trim() ? Number(kmt) : 0;
    const next = roundKg(Math.max(0, current + delta));
    const nextStr = formatKg(next);
    setKmt(nextStr);
    commit(minutes, nextStr, distanceKm, intensity);
  }

  function adjustDistanceKm(delta: number) {
    vibrate(6);
    const current = distanceKm.trim() ? Number(distanceKm) : 0;
    const next = roundKg(Math.max(0, current + delta));
    const nextStr = formatKg(next);
    setDistanceKm(nextStr);
    commit(minutes, kmt, nextStr, intensity);
  }

  return (
    <SetRowShell index={index} done={!!set.done} previousLabel={previousLabel} onToggleDone={onToggleDone} onRemove={onRemove}>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser minutter" onClick={() => adjustMinutes(-1)} />
          <div className="relative min-w-0 flex-1">
            <input
              type="number"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Min"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-1 py-1.5 pl-2 pr-8 text-left text-base font-semibold tabular-nums text-ink-1 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-ink-4 focus:border-line-strong sm:text-lg"
            />
            {minutes.trim() && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-4">min</span>
            )}
          </div>
          <StepperButton symbol="+" label="Øk minutter" onClick={() => adjustMinutes(1)} />
        </div>
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser km/t" onClick={() => adjustKmt(-0.5)} />
          <div className="relative min-w-0 flex-1">
            <input
              type="number"
              step="0.5"
              inputMode="decimal"
              value={kmt}
              onChange={(e) => setKmt(e.target.value)}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Km/t"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-1 py-1.5 pl-2 pr-10 text-left text-base font-semibold tabular-nums text-ink-1 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-ink-4 focus:border-line-strong sm:text-lg"
            />
            {kmt.trim() && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-4">km/t</span>
            )}
          </div>
          <StepperButton symbol="+" label="Øk km/t" onClick={() => adjustKmt(0.5)} />
        </div>
        <div className="flex items-center gap-1">
          <StepperButton symbol="−" label="Reduser distanse" onClick={() => adjustDistanceKm(-0.5)} />
          <div className="relative min-w-0 flex-1">
            <input
              type="number"
              step="0.5"
              inputMode="decimal"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              onBlur={() => commit(minutes, kmt, distanceKm, intensity)}
              placeholder="Distanse"
              className="w-full min-w-0 rounded-lg border border-transparent bg-surface-1 py-1.5 pl-2 pr-8 text-left text-base font-semibold tabular-nums text-ink-1 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-ink-4 focus:border-line-strong sm:text-lg"
            />
            {distanceKm.trim() && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-4">km</span>
            )}
          </div>
          <StepperButton symbol="+" label="Øk distanse" onClick={() => adjustDistanceKm(0.5)} />
        </div>
        <select
          value={intensity}
          onChange={(e) => {
            const next = e.target.value as SetIntensity | "";
            setIntensity(next);
            commit(minutes, kmt, distanceKm, next);
          }}
          className="w-full rounded-lg border border-transparent bg-surface-1 px-2 py-1.5 text-xs text-ink-2 outline-none focus:border-line-strong"
        >
          <option value="">Intensitet...</option>
          {INTENSITY_OPTIONS.map((i) => (
            <option key={i} value={i}>
              {INTENSITY_LABEL[i]}
            </option>
          ))}
        </select>
      </div>
    </SetRowShell>
  );
}
