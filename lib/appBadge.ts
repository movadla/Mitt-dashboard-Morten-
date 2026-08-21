// Delt mellom Privat (TodaySummary.tsx) og Jobb (JobbView.tsx) — begge faner
// setter iOS-appens badge-tall når de er aktive, i stedet for at kun én av
// dem (tidligere: bare påminnelser fra Privat) styrer badgen uansett hvilken
// fane man faktisk står i.
export function setAppBadgeCount(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}
