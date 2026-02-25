/**
 * SVG 效果 → PSD 效果映射模块
 */

/** SVG mix-blend-mode → PSD blend mode 完整映射 */
export const BLEND_MODE_MAP = {
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
  // 额外 CSS 混合模式
  "plus-darker": "darken",
  "plus-lighter": "lighten",
};

/**
 * 将 SVG opacity (0-1) 转为 PSD opacity (0-1, ag-psd 接受)
 * @param {number} opacity
 * @returns {number}
 */
export function toPsdOpacity(opacity) {
  if (opacity === undefined || opacity === null) return 1;
  return Math.max(0, Math.min(1, opacity));
}

/**
 * 将 SVG blend mode 转为 PSD blend mode
 * @param {string} mode
 * @returns {string}
 */
export function toPsdBlendMode(mode) {
  if (!mode) return "normal";
  return BLEND_MODE_MAP[mode.trim().toLowerCase()] || "normal";
}
