"use client";

import { useEffect, useState } from "react";

export interface ChartTheme {
  series: string[];
  grid: string;
  axis: string;
  surface: string;
  text: string;
  muted: string;
}

const FALLBACK: ChartTheme = {
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
  grid: "#e5e7eb",
  axis: "#6b7280",
  surface: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
};

function read(): ChartTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const rgb = (name: string) => `rgb(${v(name)})`;
  return {
    series: [1, 2, 3, 4, 5, 6].map((i) => v(`--chart-${i}`) || FALLBACK.series[i - 1]),
    grid: v("--chart-grid") || FALLBACK.grid,
    axis: v("--chart-axis") || FALLBACK.axis,
    surface: rgb("--surface"),
    text: rgb("--gray-900"),
    muted: rgb("--gray-500"),
  };
}

// SVG presentation attributes can't reliably use var(), so resolve the theme
// tokens to concrete colors and re-resolve when the theme class flips.
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);
  useEffect(() => {
    setTheme(read());
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
