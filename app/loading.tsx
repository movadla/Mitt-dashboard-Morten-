// Strømmes ut UMIDDELBART mens app/page.tsx (force-dynamic) rendres på
// serveren. Uten denne får nettleseren ingenting før hele siden er ferdig —
// som ga flere sekunder med blank skjerm når appen åpnes fra hjem-skjermen.
//
// Bevisst ingen import av klientkomponenter (SkeletonRows o.l.): denne skal
// være så lett som overhodet mulig, og trenger ingen JS for å vises.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] md:max-w-[1440px] md:px-8 sm:pt-[calc(env(safe-area-inset-top)+2.5rem)]">
      {/* Samme plassering som fane-velgeren i dashboard.tsx, så innholdet
          ikke hopper når den ekte siden overtar. */}
      <div className="flex items-center justify-end pb-3">
        <div className="h-9 w-40 animate-pulse rounded-full bg-surface-2" />
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="h-24 animate-pulse rounded-2xl border border-line bg-surface-1" />
        ))}
      </div>
    </div>
  );
}
