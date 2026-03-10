const INHERITABLE = new Set([
  "fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width",
  "font-family", "font-size", "font-weight", "font-style",
  "text-anchor", "text-decoration", "letter-spacing", "word-spacing", "line-height",
  "color", "direction", "writing-mode", "dominant-baseline",
  "visibility", "opacity",
]);

/** 解析后的 CSS 规则 */
export interface CssRule {
  selector: string;
  specificity: number;
  properties: Record<string, string>;
}

/** 从 SVG 根元素中提取所有 <style> 块并解析为规则列表 */
export function parseStyleSheet(svgRoot: Element): CssRule[] {
  const rules: CssRule[] = [];
  const styleEls = svgRoot.getElementsByTagName("style");
  for (let i = 0; i < styleEls.length; i++) {
    const text = styleEls[i].textContent || "";
    parseRules(text, rules);
  }
  return rules;
}

function parseRules(css: string, out: CssRule[]): void {
  // 移除注释
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const selectorGroup = m[1].trim();
    const body = m[2].trim();
    if (!selectorGroup || !body) continue;
    const properties = parseDeclarations(body);
    // 支持逗号分隔的选择器组
    for (const sel of selectorGroup.split(",")) {
      const selector = sel.trim();
      if (selector) {
        out.push({ selector, specificity: computeSpecificity(selector), properties });
      }
    }
  }
}

function parseDeclarations(body: string): Record<string, string> {
  const map: Record<string, string> = {};
  body.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx === -1) return;
    const k = decl.slice(0, idx).trim();
    const v = decl.slice(idx + 1).trim();
    if (k && v) map[k] = v;
  });
  return map;
}

/**
 * 简单的 CSS specificity 计算
 * ID: 100, class/attribute: 10, element: 1
 */
function computeSpecificity(selector: string): number {
  let spec = 0;
  // 按简单 token 拆分（不处理复杂组合器的精确 specificity，但足够排序）
  const parts = selector.replace(/[>+~]/g, " ").trim().split(/\s+/);
  for (const part of parts) {
    // #id
    const ids = part.match(/#/g);
    if (ids) spec += ids.length * 100;
    // .class, [attr]
    const classes = part.match(/[.[]/g);
    if (classes) spec += classes.length * 10;
    // element (排除纯 selector 修饰符)
    const tag = part.replace(/#[\w-]+/g, "").replace(/\.[\w-]+/g, "").replace(/\[.*?\]/g, "").replace(/:[\w-]+(\(.*?\))?/g, "");
    if (tag && tag !== "*") spec += 1;
  }
  return spec;
}

/**
 * 判断元素是否匹配简单 CSS 选择器
 * 支持: tag, .class, #id, tag.class, .class1.class2,
 *       后代选择器 "ancestor descendant", 子选择器 "parent > child"
 */
export function matchSelector(el: Element, selector: string): boolean {
  // 处理子选择器 ">"
  if (selector.includes(">")) {
    const parts = selector.split(">").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return false;
    const lastSel = parts[parts.length - 1];
    if (!matchSimpleSelector(el, lastSel)) return false;
    let current: Node | null = el.parentNode;
    for (let i = parts.length - 2; i >= 0; i--) {
      if (!current || current.nodeType !== 1) return false;
      if (!matchSimpleSelector(current as Element, parts[i])) return false;
      current = current.parentNode;
    }
    return true;
  }

  // 处理后代选择器（空格分隔）
  const parts = selector.trim().split(/\s+/);
  if (parts.length === 1) {
    return matchSimpleSelector(el, parts[0]);
  }

  // 最右端必须匹配当前元素
  if (!matchSimpleSelector(el, parts[parts.length - 1])) return false;

  // 其余从右往左匹配祖先链
  let partIdx = parts.length - 2;
  let ancestor: Node | null = el.parentNode;
  while (partIdx >= 0 && ancestor && ancestor.nodeType === 1) {
    if (matchSimpleSelector(ancestor as Element, parts[partIdx])) {
      partIdx--;
    }
    ancestor = ancestor.parentNode;
  }
  return partIdx < 0;
}

/**
 * 匹配单个简单选择器（不含空格/组合器）
 * 如 "rect", ".cls-1", "#myId", "text.label", ".a.b"
 */
function matchSimpleSelector(el: Element, selector: string): boolean {
  const elTag = (el.localName || el.nodeName || "").replace(/^.*:/, "").toLowerCase();

  // 解析选择器为 tag + classes + id
  let tag = "";
  const classes: string[] = [];
  let id = "";

  // 用正则分解
  const tokens = selector.match(/[#.]?[^#.]+/g);
  if (!tokens) return false;

  for (const token of tokens) {
    if (token.startsWith("#")) {
      id = token.slice(1);
    } else if (token.startsWith(".")) {
      classes.push(token.slice(1));
    } else {
      tag = token.toLowerCase();
    }
  }

  // 匹配 tag
  if (tag && tag !== "*" && tag !== elTag) return false;

  // 匹配 id
  if (id && el.getAttribute("id") !== id) return false;

  // 匹配 class
  if (classes.length > 0) {
    const elClass = el.getAttribute("class") || "";
    const elClasses = new Set(elClass.split(/\s+/).filter(Boolean));
    for (const cls of classes) {
      if (!elClasses.has(cls)) return false;
    }
  }

  return true;
}

/**
 * 从 stylesheet 中收集匹配元素的所有 CSS 属性
 * 按 specificity 升序应用（后来的同 specificity 会覆盖前面的）
 */
export function getMatchedCssProperties(el: Element, stylesheet: CssRule[]): Record<string, string> {
  const matched: { specificity: number; index: number; properties: Record<string, string> }[] = [];

  for (let i = 0; i < stylesheet.length; i++) {
    const rule = stylesheet[i];
    if (matchSelector(el, rule.selector)) {
      matched.push({ specificity: rule.specificity, index: i, properties: rule.properties });
    }
  }

  // 按 specificity 升序，同 specificity 按出现顺序
  matched.sort((a, b) => a.specificity - b.specificity || a.index - b.index);

  const result: Record<string, string> = {};
  for (const m of matched) {
    Object.assign(result, m.properties);
  }
  return result;
}

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

/**
 * 收集元素的完整样式上下文
 * 优先级：继承 < CSS 类选择器 < 表现属性 < inline style
 */
export function resolveStyles(
  el: Element,
  parentStyles: Record<string, string> = {},
  stylesheet?: CssRule[],
): Record<string, string> {
  const resolved: Record<string, string> = {};

  // 1. 继承可继承属性
  for (const prop of INHERITABLE) {
    if (parentStyles[prop] !== undefined) {
      resolved[prop] = parentStyles[prop];
    }
  }

  // 2. CSS 类选择器匹配（低于表现属性和 inline style）
  if (stylesheet && stylesheet.length > 0) {
    const cssProps = getMatchedCssProperties(el, stylesheet);
    Object.assign(resolved, cssProps);
  }

  // 3. 覆盖表现属性
  for (const prop of INHERITABLE) {
    const attr = el.getAttribute(prop);
    if (attr !== null && attr !== undefined && attr !== "") {
      resolved[prop] = attr;
    }
  }

  // 也检查非继承但常用的属性
  for (const prop of ["opacity", "mix-blend-mode", "display", "visibility"]) {
    const attr = el.getAttribute(prop);
    if (attr) resolved[prop] = attr;
  }

  // 4. 最高优先级: inline style 属性
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
