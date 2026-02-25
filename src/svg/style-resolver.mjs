/**
 * CSS 样式解析模块
 * 处理三级优先级：style 属性 > 表现属性 > 父元素继承
 */

/** 可继承的 SVG 属性 */
const INHERITABLE = new Set([
  "fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width",
  "font-family", "font-size", "font-weight", "font-style",
  "text-anchor", "text-decoration", "letter-spacing", "word-spacing",
  "color", "direction", "writing-mode", "dominant-baseline",
  "visibility", "opacity",
]);

/**
 * 解析 style 属性为键值对
 * @param {string} style
 * @returns {Object.<string, string>}
 */
export function parseStyleAttr(style) {
  const map = {};
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

/**
 * 获取元素的有效样式值
 * 优先级: style 属性 > 表现属性 > inherited
 * @param {Element} el
 * @param {string} prop CSS 属性名 (如 "font-size", "fill")
 * @param {string} [inherited] 继承值
 * @returns {string|null}
 */
export function getStyleValue(el, prop, inherited) {
  // 1. style 属性（最高优先级）
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const styleMap = parseStyleAttr(styleAttr);
    if (styleMap[prop] !== undefined) return styleMap[prop];
  }

  // 2. 表现属性
  const attr = el.getAttribute(prop);
  if (attr !== null && attr !== undefined) return attr;

  // 3. 继承
  if (inherited !== undefined) return inherited;

  return null;
}

/**
 * 收集元素的完整样式上下文
 * @param {Element} el
 * @param {Object} [parentStyles={}] 父元素样式
 * @returns {Object.<string, string>}
 */
export function resolveStyles(el, parentStyles = {}) {
  const resolved = {};

  // 继承可继承属性
  for (const prop of INHERITABLE) {
    if (parentStyles[prop] !== undefined) {
      resolved[prop] = parentStyles[prop];
    }
  }

  // 覆盖表现属性
  for (const prop of INHERITABLE) {
    const attr = el.getAttribute(prop);
    if (attr !== null && attr !== undefined) {
      resolved[prop] = attr;
    }
  }

  // 也检查非继承但常用的属性
  for (const prop of ["opacity", "mix-blend-mode", "display", "visibility"]) {
    const attr = el.getAttribute(prop);
    if (attr) resolved[prop] = attr;
  }

  // 最高优先级: style 属性
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const styleMap = parseStyleAttr(styleAttr);
    Object.assign(resolved, styleMap);
  }

  return resolved;
}

/**
 * 递归向上查找元素的样式
 */
export function getInheritedStyle(el, prop) {
  let current = el;
  while (current && current.nodeType === 1) {
    const val = getStyleValue(current, prop);
    if (val) return val;
    current = current.parentNode;
  }
  return null;
}
