export type Theme = 'dark' | 'light';

/**
 * Hues for the operators worth recognising on sight, keyed by the two-letter code the feed's
 * agency ids carry. A feed has more operators than anyone has memorised colours for, so the rest
 * are given a stable hue derived from the code.
 */
const OPERATOR_HUES: Readonly<Record<string, number>> = {
  GR: 238, // LNER
  VT: 355, // Avanti West Coast
  EM: 25, // EMR
  GW: 170, // GWR
  XC: 305, // CrossCountry
  TP: 205, // TransPennine Express
  NT: 145, // Northern
  SW: 95, // South Western Railway
  SN: 115, // Southern
  SE: 190, // Southeastern
  LE: 12, // Greater Anglia
  GN: 260, // Great Northern
  SR: 225, // ScotRail
  AW: 160, // Transport for Wales
  LM: 285, // West Midlands Trains
  CH: 50, // Chiltern
  TL: 320, // Thameslink
  LO: 40, // London Overground
  LT: 265, // London Underground
  ME: 350, // Merseyrail
  CC: 300, // c2c
  XR: 280, // Elizabeth line
  CS: 250, // Caledonian Sleeper
  GC: 3, // Grand Central
  HT: 210, // Hull Trains
  LD: 180, // Lumo
  GX: 130, // Gatwick Express
  HX: 20, // Heathrow Express
  TW: 85, // Tyne & Wear Metro
};

/** Scatter an unknown operator's code across the wheel, the same way every time. */
function hueOf(toc: string): number {
  let hash = 2166136261;
  for (let i = 0; i < toc.length; i++) {
    hash ^= toc.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash % 360;
}

export const operatorColor = (toc: string): string =>
  `oklch(0.72 0.15 ${OPERATOR_HUES[toc] ?? hueOf(toc)})`;

export const plannerColor = (planner: { hue: number }): string =>
  `oklch(0.74 0.145 ${planner.hue})`;

/**
 * Token values the map needs as concrete colours. Leaflet paints into a canvas, so it cannot use
 * `var(--dim)` — and reading it back out of the DOM with getComputedStyle is what the original had
 * to do.
 */
export const MAP_COLORS: Record<Theme, { dim: string; panel: string }> = {
  dark: { dim: '#7d8896', panel: '#11141a' },
  light: { dim: '#61686f', panel: '#f7f6f3' },
};
