const INHERITABLE = new Set([
  "fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width",
  "font-family", "font-size", "font-weight", "font-style",
  "text-anchor", "text-decoration", "letter-spacing", "word-spacing", "line-height",
  "color", "direction", "writing-mode", "dominant-baseline",
  "visibility", "opacity",
]);

export function parseStyleAttr(style: string | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!style) return map;
  style.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx === -1) return;
    const k = decl.slice(0, idx).trim();
    const v = decl.slice(idx + 1).trim();
    if (k && v) map[k] = v;
  });
  return map;
}

export function getStyleValue(el: Element, prop: string, inherited?: string): string | null {
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const styleMap = parseStyleAttr(styleAttr);
    if (styleMap[prop] !== undefined) return styleMap[prop];
  }

  const attr = el.getAttribute(prop);
  if (attr !== null && attr !== undefined) return attr;

  if (inherited !== undefined) return inherited;

  return null;
}

export function resolveStyles(el: Element, parentStyles: Record<string, string> = {}): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const prop of INHERITABLE) {
    if (parentStyles[prop] !== undefined) {
      resolved[prop] = parentStyles[prop];
    }
  }

  for (const prop of INHERITABLE) {
    const attr = el.getAttribute(prop);
    if (attr !== null && attr !== undefined) {
      resolved[prop] = attr;
    }
  }

  for (const prop of ["opacity", "mix-blend-mode", "display", "visibility"]) {
    const attr = el.getAttribute(prop);
    if (attr) resolved[prop] = attr;
  }

  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const styleMap = parseStyleAttr(styleAttr);
    Object.assign(resolved, styleMap);
  }

  return resolved;
}

export function getInheritedStyle(el: Element, prop: string): string | null {
  let current: Node | null = el;
  while (current && current.nodeType === 1) {
    const val = getStyleValue(current as Element, prop);
    if (val) return val;
    current = current.parentNode;
  }
  return null;
}
