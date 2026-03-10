import type { Matrix, ViewBox, TextInfo, TextRun } from "../types.js";
import { parseStyleAttr, resolveStyles } from "./style-resolver.js";
import { getTranslation } from "./transforms.js";
import { parseColor } from "../utils/color.js";
import { cleanFontFamily, toPostScriptName, isBoldWeight } from "../utils/font.js";

export function extractTextInfo(
  el: Element,
  transform: Matrix,
  viewBox: ViewBox | null,
): TextInfo | null {
  const tag = localName(el);
  if (tag === "text") {
    return extractFromText(el, transform, viewBox);
  }
  if (tag === "foreignObject") {
    return extractFromForeignObject(el, transform, viewBox);
  }
  return null;
}

function extractFromText(
  textEl: Element,
  transform: Matrix,
  _viewBox: ViewBox | null,
): TextInfo | null {
  const x = parseFloat(textEl.getAttribute("x") || "0");
  const y = parseFloat(textEl.getAttribute("y") || "0");
  const styles = resolveStyles(textEl);

  const tspans = findDirectChildren(textEl, "tspan");
  let runs: TextRun[];

  if (tspans.length > 0) {
    runs = tspans.map((tspan) => extractRunFromTspan(tspan, styles));
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

function extractRunFromTspan(tspan: Element, parentStyles: Record<string, string>): TextRun {
  const text = getAllText(tspan).trim();
  const styles = resolveStyles(tspan, parentStyles);
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
): TextInfo | null {
  const raw = getAllText(foEl).replace(/^[\s\r]+|[\s\r]+$/g, "");
  if (!raw) return null;

  const foX = parseFloat(foEl.getAttribute("x") || "0");
  const foY = parseFloat(foEl.getAttribute("y") || "0");
  const foW = parseFloat(foEl.getAttribute("width") || "0");
  const foH = parseFloat(foEl.getAttribute("height") || "0");

  const { tx, ty } = getTranslation(transform);

  const styleInfo = extractForeignObjectStyle(foEl);
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

function extractForeignObjectStyle(foEl: Element): ForeignObjectStyleInfo {
  const result: ForeignObjectStyleInfo = {};
  walkElements(foEl, (el) => {
    const style = el.getAttribute && el.getAttribute("style");
    if (style) {
      const map = parseStyleAttr(style);
      if (map["font-family"]) result.fontFamily = cleanFontFamily(map["font-family"]);
      if (map["font-size"]) result.fontSize = parseFloat(map["font-size"]);
      if (map["font-weight"]) result.fontWeight = map["font-weight"];
      if (map["color"]) result.color = map["color"];
      const ls = parseSpacing(map["letter-spacing"]);
      if (ls != null) result.letterSpacing = ls;
      const lh = parseLineHeight(map["line-height"], result.fontSize);
      if (lh != null) result.lineHeight = lh;
    }
    const ff = el.getAttribute && el.getAttribute("font-family");
    if (ff) result.fontFamily = cleanFontFamily(ff);
    const fs = el.getAttribute && el.getAttribute("font-size");
    if (fs) result.fontSize = parseFloat(fs);
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
