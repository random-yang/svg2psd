import type { Matrix, ViewBox, TextInfo, TextRun } from "../types.js";
import { parseStyleAttr, resolveStyles, parseStyleSheet } from "./style-resolver.js";
import type { CssRule } from "./style-resolver.js";
import { getTranslation } from "./transforms.js";
import { parseColor } from "../utils/color.js";
import { cleanFontFamily, toPostScriptName, isBoldWeight } from "../utils/font.js";

export function extractTextInfo(
  el: Element,
  transform: Matrix,
  viewBox: ViewBox | null,
  svgRoot?: Element,
): TextInfo | null {
  const stylesheet = svgRoot ? parseStyleSheet(svgRoot) : [];
  const tag = localName(el);
  if (tag === "text") {
    return extractFromText(el, transform, viewBox, stylesheet);
  }
  if (tag === "foreignObject") {
    return extractFromForeignObject(el, transform, viewBox, stylesheet);
  }
  return null;
}

function extractFromText(
  textEl: Element,
  transform: Matrix,
  _viewBox: ViewBox | null,
  stylesheet: CssRule[],
): TextInfo | null {
  const x = parseFloat(textEl.getAttribute("x") || "0");
  const y = parseFloat(textEl.getAttribute("y") || "0");
  const styles = resolveStyles(textEl, {}, stylesheet);

  const tspans = findDirectChildren(textEl, "tspan");
  let runs: TextRun[];

  if (tspans.length > 0) {
    runs = tspans.map((tspan) => extractRunFromTspan(tspan, styles, stylesheet));
  } else {
    const text = getAllText(textEl).trim();
    if (!text) return null;
    runs = [buildRun(text, styles)];
  }

  runs = runs.filter((r) => r.text.length > 0);
  if (runs.length === 0) return null;

  const fullText = runs.map((r) => r.text).join("");
  const textAnchor = styles["text-anchor"] || "start";

  const { tx, ty } = getTranslation(transform);

  return {
    text: fullText,
    x: x + tx,
    y: y + ty,
    runs,
    textAnchor,
    isBox: false,
  };
}

function extractRunFromTspan(tspan: Element, parentStyles: Record<string, string>, stylesheet: CssRule[]): TextRun {
  const text = getAllText(tspan).trim();
  const styles = resolveStyles(tspan, parentStyles, stylesheet);
  return buildRun(text, styles);
}

function buildRun(text: string, styles: Record<string, string>): TextRun {
  const fontFamily = cleanFontFamily(styles["font-family"] || "Arial");
  const fontWeight = styles["font-weight"] || "normal";
  const fontSize = parseFloat(styles["font-size"] || "24");
  const fill = styles["fill"] || styles["color"] || "#000000";
  const letterSpacing = parseSpacing(styles["letter-spacing"]);
  const lineHeight = parseLineHeight(styles["line-height"], fontSize);

  return {
    text,
    fontFamily,
    psName: toPostScriptName(fontFamily, fontWeight),
    fontSize,
    fontWeight,
    fauxBold: isBoldWeight(fontWeight),
    fillColor: parseColor(fill),
    letterSpacing,
    lineHeight,
  };
}

function extractFromForeignObject(
  foEl: Element,
  transform: Matrix,
  _viewBox: ViewBox | null,
  stylesheet: CssRule[],
): TextInfo | null {
  const raw = getAllText(foEl).replace(/^[\s\r]+|[\s\r]+$/g, "");
  if (!raw) return null;

  const foX = parseFloat(foEl.getAttribute("x") || "0");
  const foY = parseFloat(foEl.getAttribute("y") || "0");
  const foW = parseFloat(foEl.getAttribute("width") || "0");
  const foH = parseFloat(foEl.getAttribute("height") || "0");

  const { tx, ty } = getTranslation(transform);

  const styleInfo = extractForeignObjectStyle(foEl, stylesheet);
  const fontFamily = styleInfo.fontFamily || "Inter";
  const fontWeight = styleInfo.fontWeight || "normal";
  const fontSize = styleInfo.fontSize || 24;
  const fill = styleInfo.color || "#000000";

  const run: TextRun = {
    text: raw,
    fontFamily,
    psName: toPostScriptName(fontFamily, fontWeight),
    fontSize,
    fontWeight,
    fauxBold: isBoldWeight(fontWeight),
    fillColor: parseColor(fill),
    letterSpacing: styleInfo.letterSpacing ?? null,
    lineHeight: styleInfo.lineHeight ?? null,
  };

  return {
    text: raw,
    x: foX + tx,
    y: foY + ty + fontSize,
    runs: [run],
    textAnchor: "start",
    isBox: true,
    boxBounds: {
      x: foX + tx,
      y: foY + ty,
      width: foW || 200,
      height: foH || fontSize * 2,
    },
  };
}

interface ForeignObjectStyleInfo {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  letterSpacing?: number | null;
  lineHeight?: number | null;
}

function extractForeignObjectStyle(foEl: Element, stylesheet: CssRule[]): ForeignObjectStyleInfo {
  const result: ForeignObjectStyleInfo = {};
  walkElements(foEl, (el) => {
    // 先从 CSS stylesheet 获取样式
    const cssStyles = resolveStyles(el, {}, stylesheet);
    if (cssStyles["font-family"]) result.fontFamily = cleanFontFamily(cssStyles["font-family"]);
    if (cssStyles["font-size"]) result.fontSize = parseFloat(cssStyles["font-size"]);
    if (cssStyles["font-weight"]) result.fontWeight = cssStyles["font-weight"];
    if (cssStyles["color"]) result.color = cssStyles["color"];
    const ls = parseSpacing(cssStyles["letter-spacing"]);
    if (ls != null) result.letterSpacing = ls;
    const lh = parseLineHeight(cssStyles["line-height"], result.fontSize);
    if (lh != null) result.lineHeight = lh;
  });
  return result;
}

function parseSpacing(val: string | undefined): number | null {
  if (!val || val === "normal") return null;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

function parseLineHeight(val: string | undefined, fontSize?: number): number | null {
  if (!val || val === "normal") return null;
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return null;
  if (String(val).includes("px")) return n;
  return fontSize ? n * fontSize : null;
}

function walkElements(node: Node, fn: (el: Element) => void): void {
  if (node.nodeType === 1) fn(node as Element);
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    walkElements(children[i], fn);
  }
}

function findDirectChildren(node: Element, tagName: string): Element[] {
  const result: Element[] = [];
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 1 && localName(c as Element) === tagName) {
      result.push(c as Element);
    }
  }
  return result;
}

const BLOCK_TAGS = new Set(["p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "tr"]);

function getAllText(el: Element): string {
  let text = "";
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 3 || c.nodeType === 4) {
      text += c.nodeValue;
    } else if (c.nodeType === 1) {
      const tag = localName(c as Element);
      if (tag === "br") {
        text += "\r";
      } else if (BLOCK_TAGS.has(tag)) {
        if (text.length > 0) {
          text = text.replace(/[\s]+$/, "");
          if (!text.endsWith("\r")) text += "\r";
        }
        text += getAllText(c as Element);
      } else {
        text += getAllText(c as Element);
      }
    }
  }
  return text;
}

function localName(el: Element): string {
  return (el.localName || el.nodeName || "").replace(/^.*:/, "");
}
