"use client";

import { useEffect, useState } from "react";

// "auto" follows the device (and so the car's day/night switch, where the
// browser reports it); the other two override it. See the script in layout.tsx,
// which applies the stored choice before the first paint.
const MODES = ["auto", "light", "dark"] as const;
type Mode = (typeof MODES)[number];

const STORAGE_KEY = "lyrical-theme";

const ICONS: Record<Mode, React.ReactNode> = {
  auto: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
};

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored === "light" || stored === "dark") setMode(stored);
  }, []);

  const cycle = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setMode(next);
    if (next === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts until reload.
    }
  };

  return (
    <button className="control" onClick={cycle} aria-label={`Theme: ${mode}. Change theme`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[mode]}
      </svg>
      <span>{mode}</span>
    </button>
  );
}
