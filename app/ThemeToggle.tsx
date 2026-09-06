"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { applyTheme, DEFAULT_THEME, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

// Ett trykk bytter mellom dagmodus (lys "skifer") og kveldsmodus (appens
// opprinnelige mørke glassdesign). Selve temaet er allerede satt på <html>
// av det synkrone scriptet i layout.tsx før dette monteres — denne knappen
// leser bare hva som står der og skriver en ny verdi ved klikk.
export default function ThemeToggle() {
  // Starter som null: hvilket tema som gjelder kan ikke vites under SSR
  // (det ligger i localStorage), og å gjette ville gitt hydreringsavvik og
  // et synlig ikonbytte ved oppstart. Knappen er reservert plass, men uten
  // ikon, i det ene rammeverket før effekten under kjører.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current === "dag" ? "dag" : DEFAULT_THEME);
  }, []);

  function toggle() {
    const next: Theme = theme === "dag" ? "kveld" : "dag";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* privat modus / full kvote — temaet gjelder fortsatt for denne økten */
    }
  }

  const isDag = theme === "dag";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDag ? "Bytt til kveldsmodus" : "Bytt til dagmodus"}
      title={isDag ? "Bytt til kveldsmodus" : "Bytt til dagmodus"}
      aria-pressed={isDag}
      className="nav-tile inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-2xs font-semibold text-ink-2 transition hover:text-ink-1"
    >
      {theme === null ? (
        <span className="h-4 w-4" aria-hidden />
      ) : isDag ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">{theme === null ? "" : isDag ? "Dag" : "Kveld"}</span>
    </button>
  );
}
