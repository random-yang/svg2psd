export const BLEND_MODE_MAP: Record<string, string> = {
  "normal": "normal",
  "multiply": "multiply",
  "screen": "screen",
  "overlay": "overlay",
  "darken": "darken",
  "lighten": "lighten",
  "color-dodge": "color dodge",
  "color-burn": "color burn",
  "hard-light": "hard light",
  "soft-light": "soft light",
  "difference": "difference",
  "exclusion": "exclusion",
  "hue": "hue",
  "saturation": "saturation",
  "color": "color",
  "luminosity": "luminosity",
  "plus-darker": "darken",
  "plus-lighter": "lighten",
};

export function toPsdOpacity(opacity: number | undefined | null): number {
  if (opacity === undefined || opacity === null) return 1;
  return Math.max(0, Math.min(1, opacity));
}

export function toPsdBlendMode(mode: string | null | undefined): string {
  if (!mode) return "normal";
  return BLEND_MODE_MAP[mode.trim().toLowerCase()] || "normal";
}
