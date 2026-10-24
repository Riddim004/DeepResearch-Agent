"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className="btn btn-quiet h-8 w-8 !p-0"
      aria-label="Toggle color theme"
      title="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="hidden size-4 dark:block" strokeWidth={1.7} />
      <Moon className="size-4 dark:hidden" strokeWidth={1.7} />
    </button>
  );
}
