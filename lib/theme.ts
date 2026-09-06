// Dagmodus/kveldsmodus — delt mellom det synkrone temascriptet i
// app/layout.tsx (som må kjøre FØR første maling for å unngå at feil tema
// blinker) og ThemeToggle-knappen. Én kilde til sannhet for nøkkelen og
// bakgrunnsfargene, slik at de to ikke kan gli fra hverandre.

export type Theme = "dag" | "kveld";

export const THEME_STORAGE_KEY = "mitt-dashboard:theme:v1";

// Brukes til <html>-elementets inline bakgrunn og til <meta name="theme-color">
// (iOS-statuslinjen i PWA-en). Må matche --t-surface-0 i globals.css for
// hvert tema, ellers ser man en fargekant rundt innholdet under oppstart.
export const THEME_BG: Record<Theme, string> = {
  kveld: "#12161e",
  dag: "#dfe5ef",
};

// Kveld er standard: appens opprinnelige utseende, og det man får hvis
// localStorage er tomt, utilgjengelig (privat modus) eller inneholder søppel.
export const DEFAULT_THEME: Theme = "kveld";

// Kjøres synkront fra <body> sitt første <script> — se app/layout.tsx.
// Skrevet som en streng (ikke en importert funksjon) fordi den må ligge
// inline i HTML-en og kjøre før noe JavaScript-bundle lastes.
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="dag"&&t!=="kveld"){t=${JSON.stringify(DEFAULT_THEME)};}var r=document.documentElement;r.dataset.theme=t;var b=t==="dag"?${JSON.stringify(THEME_BG.dag)}:${JSON.stringify(THEME_BG.kveld)};r.style.backgroundColor=b;var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",b);}}catch(e){}})();`;

// Setter temaet på <html> og synkroniserer de to tingene CSS ikke kan nå:
// inline-bakgrunnen (som hindrer hvitt blink ved oppstart) og theme-color
// (statuslinjen). Kun klientside.
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.backgroundColor = THEME_BG[theme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BG[theme]);
}
