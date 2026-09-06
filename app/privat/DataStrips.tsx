"use client";

// Små datastriper som gir hvert kort ett visuelt lag i tillegg til lista.
// Det er dette som skiller et dashboard fra en liste: du ser formen på uka,
// hvor på dagen du er og hvor langt du er kommet — uten å lese en eneste rad.
//
// Felles mønster: den ytre wrapperen får seksjonens fargeklasse (samme
// `iconColorClass` som CardHeader bruker), og alt inni tegnes med
// `currentColor`. Da trenger ingen av dem en egen farge-prop, og de kan ikke
// gli ut av sync med kortets identitet.

// Fyll som er "av" — token-basert, så den følger dag/kveld automatisk.
const EMPTY = "bg-ink-4/25";

// Rundt glødefelt i seksjonens farge. color-mix brukes allerede av
// .nav-tile-active i globals.css, så appen avhenger av det fra før.
const GLOW = "0 0 0 3px color-mix(in srgb, currentColor 18%, transparent)";

/** Andel fullført. Segmenter når antallet er lite nok til å telles, ellers
 *  én sammenhengende bar — 40 segmenter à 2px hadde bare blitt støy. */
export function RatioBar({
  done,
  total,
  colorClass,
  label,
}: {
  done: number;
  total: number;
  colorClass: string;
  label: string;
}) {
  if (total <= 0) return null;
  const clamped = Math.max(0, Math.min(done, total));

  if (total <= 12) {
    return (
      <div className={`flex gap-[3px] ${colorClass}`} role="img" aria-label={label}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < clamped ? "bg-current" : EMPTY}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={colorClass} role="img" aria-label={label}>
      <span className={`block h-1 w-full overflow-hidden rounded-full ${EMPTY}`}>
        <span
          className="block h-full rounded-full bg-current"
          style={{ width: `${(clamped / total) * 100}%` }}
        />
      </span>
    </div>
  );
}

// Aksen dekker 06:00–24:00. Alt før kl. 06 klemmes til venstre kant i stedet
// for å falle utenfor — en hendelse 05:30 skal fortsatt være synlig.
const AXIS_START_MIN = 6 * 60;
const AXIS_END_MIN = 24 * 60;

function minutesFromHHMM(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function axisPercent(minutes: number): number {
  const span = AXIS_END_MIN - AXIS_START_MIN;
  return Math.max(0, Math.min(100, ((minutes - AXIS_START_MIN) / span) * 100));
}

/** Døgnakse med en prikk per hendelse og en strek for hvor på dagen du er nå.
 *
 *  Heldagshendelser har ingen posisjon å tegne på — kalenderhendelser i denne
 *  appen har `startTime` som VALGFRITT felt. De telles derfor opp i en egen
 *  merkelapp i stedet for å bli gjettet inn på aksen. */
export function DayAxis({
  times,
  allDayCount = 0,
  nowMinutes,
  colorClass,
}: {
  times: string[];
  allDayCount?: number;
  // null = det er ikke i dag vi ser på, og "nå"-streken gir ingen mening.
  nowMinutes: number | null;
  colorClass: string;
}) {
  const points = times
    .map(minutesFromHHMM)
    .filter((m): m is number => m !== null)
    .map(axisPercent);

  if (points.length === 0 && allDayCount === 0) return null;

  return (
    <div className={colorClass}>
      {points.length > 0 && (
        // 30px, ikke 26: klokkeslett-etikettene under aksen ligger på top-4 og
        // trenger plass under seg, ellers kolliderer de med neste linje i kortet.
        <div className="relative h-[30px]" role="img" aria-label={`${points.length} hendelser fordelt over dagen`}>
          <span className="absolute inset-x-0 top-[9px] h-[2px] rounded-full bg-ink-4/25" />
          {nowMinutes !== null && (
            <span
              className="absolute top-1 h-3 w-[2px] -translate-x-1/2 rounded-full bg-ink-4"
              style={{ left: `${axisPercent(nowMinutes)}%` }}
              aria-hidden
            />
          )}
          {points.map((left, i) => (
            <span
              key={i}
              className="absolute top-[5px] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-current"
              style={{ left: `${left}%`, boxShadow: GLOW }}
              aria-hidden
            />
          ))}
          {[
            [AXIS_START_MIN, "06"],
            [12 * 60, "12"],
            [18 * 60, "18"],
            [AXIS_END_MIN, "24"],
          ].map(([min, txt]) => (
            <span
              key={txt as string}
              className="absolute top-4 -translate-x-1/2 text-[8.5px] tabular-nums text-ink-4"
              style={{ left: `${axisPercent(min as number)}%` }}
              aria-hidden
            >
              {txt}
            </span>
          ))}
        </div>
      )}
      {allDayCount > 0 && (
        <p className="mt-1 text-2xs text-ink-4">
          {allDayCount === 1 ? "1 hendelse uten klokkeslett" : `${allDayCount} hendelser uten klokkeslett`}
        </p>
      )}
    </div>
  );
}

const WEEKDAY_LABELS = ["M", "T", "O", "T", "F", "L", "S"];

/** Ukesstripe, mandag til søndag. Bevisst binær (trent / ikke trent) og ikke
 *  høydekodet — antall øvelser i en økt sier lite om hvor hard den var, så en
 *  søylehøyde ville vært en påstand dataen ikke dekker. */
export function WeekStrip({
  activeDays,
  todayIndex,
  colorClass,
  label,
}: {
  // 7 verdier, mandag først.
  activeDays: boolean[];
  // 0–6, eller null hvis uka som vises ikke er inneværende uke.
  todayIndex: number | null;
  colorClass: string;
  label: string;
}) {
  return (
    <div className={colorClass}>
      <div className="flex gap-1" role="img" aria-label={label}>
        {WEEKDAY_LABELS.map((_, i) => (
          <span
            key={i}
            className={`h-[26px] flex-1 rounded-md ${activeDays[i] ? "bg-current opacity-80" : EMPTY}`}
            style={i === todayIndex ? { boxShadow: "inset 0 0 0 1.5px currentColor" } : undefined}
          />
        ))}
      </div>
      <div className="mt-0.5 flex gap-1" aria-hidden>
        {WEEKDAY_LABELS.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[8.5px] text-ink-4">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Grupperingsoverskrift inne i et kort ("I dag" / "Senere"), med en linje
 *  som løper ut til høyre. `now` gir den seksjonens farge i stedet for grått. */
export function GroupLabel({ children, now = false }: { children: React.ReactNode; now?: boolean }) {
  return (
    <p
      className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.13em] ${
        now ? "" : "text-ink-4"
      }`}
    >
      <span className={now ? "" : undefined}>{children}</span>
      <span
        className={`h-px flex-1 ${now ? "bg-current opacity-30" : "bg-line"}`}
        aria-hidden
      />
    </p>
  );
}
