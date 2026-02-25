/**
 * 文字提取模块
 * 从 <text>, <tspan>, <foreignObject> 提取文字信息
 */

import { parseStyleAttr, resolveStyles } from "./style-resolver.mjs";
import { getTranslation } from "./transforms.mjs";
import { parseColor } from "../utils/color.mjs";
import { cleanFontFamily, toPostScriptName, isBoldWeight } from "../utils/font.mjs";

/**
 * @typedef {Object} TextRun
 * @property {string} text
 * @property {string} fontFamily
 * @property {string} psName - PostScript 字体名
 * @property {number} fontSize
 * @property {string} fontWeight
 * @property {boolean} fauxBold
 * @property {{ r:number, g:number, b:number }} fillColor
 * @property {number|null} letterSpacing - px 值，null 表示 normal/未设置
 * @property {number|null} lineHeight - px 值（已计算），null 表示未设置
 */

/**
 * @typedef {Object} TextInfo
 * @property {string} text - 完整文本
 * @property {number} x - 文本 X 坐标（SVG viewBox 坐标）
 * @property {number} y - 文本 Y 坐标
 * @property {TextRun[]} runs - 样式段
 * @property {string} textAnchor - "start" | "middle" | "end"
 * @property {boolean} isBox - 是否为 box text (foreignObject)
 * @property {{ x:number, y:number, width:number, height:number }} [boxBounds]
 */

/**
 * 从元素提取文字信息
 * @param {Element} el - <text> 或 <foreignObject> 元素
 * @param {number[]} transform - 累积变换矩阵
 * @param {{ x:number, y:number, w:number, h:number }|null} viewBox
 * @returns {TextInfo|null}
 */
export function extractTextInfo(el, transform, viewBox) {
  const tag = localName(el);
  if (tag === "text") {
    return extractFromText(el, transform, viewBox);
  }
  if (tag === "foreignObject") {
    return extractFromForeignObject(el, transform, viewBox);
  }
  return null;
}

function extractFromText(textEl, transform, viewBox) {
  const x = parseFloat(textEl.getAttribute("x") || "0");
  const y = parseFloat(textEl.getAttribute("y") || "0");
  const styles = resolveStyles(textEl);

  const tspans = findDirectChildren(textEl, "tspan");
  let runs;

  if (tspans.length > 0) {
    // 多个 tspan 产生多个 style runs
    runs = tspans.map((tspan) => extractRunFromTspan(tspan, styles));
  } else {
    // 单段文本
    const text = getAllText(textEl).trim();
    if (!text) return null;
    runs = [buildRun(text, styles)];
  }

  // 过滤空 run
  runs = runs.filter((r) => r.text.length > 0);
  if (runs.length === 0) return null;

  const fullText = runs.map((r) => r.text).join("");
  const textAnchor = styles["text-anchor"] || "start";

  // 从累积变换矩阵中提取平移分量
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

function extractRunFromTspan(tspan, parentStyles) {
  const text = getAllText(tspan).trim();
  const styles = resolveStyles(tspan, parentStyles);
  return buildRun(text, styles);
}

function buildRun(text, styles) {
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

function extractFromForeignObject(foEl, transform, viewBox) {
  const raw = getAllText(foEl).trim();
  if (!raw) return null;

  const foX = parseFloat(foEl.getAttribute("x") || "0");
  const foY = parseFloat(foEl.getAttribute("y") || "0");
  const foW = parseFloat(foEl.getAttribute("width") || "0");
  const foH = parseFloat(foEl.getAttribute("height") || "0");

  // 从变换矩阵中获取平移分量
  const { tx, ty } = getTranslation(transform);

  // 从嵌套 HTML 元素提取样式
  const styleInfo = extractForeignObjectStyle(foEl);
  const fontFamily = styleInfo.fontFamily || "Inter";
  const fontWeight = styleInfo.fontWeight || "normal";
  const fontSize = styleInfo.fontSize || 24;
  const fill = styleInfo.color || "#000000";

  const run = {
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
    y: foY + ty + fontSize, // foreignObject y 是顶部，PSD 文字 y 是基线
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

function extractForeignObjectStyle(foEl) {
  const result = {};
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

/**
 * 解析 letter-spacing / word-spacing 等间距值
 * "20px" → 20, "normal" → null, undefined → null
 */
function parseSpacing(val) {
  if (!val || val === "normal") return null;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * 解析 line-height
 * "1.35" → fontSize*1.35, "20px" → 20, "normal" → null
 */
function parseLineHeight(val, fontSize) {
  if (!val || val === "normal") return null;
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return null;
  // 带 px 单位的绝对值
  if (String(val).includes("px")) return n;
  // 无单位倍数，转为 px
  return fontSize ? n * fontSize : null;
}

function walkElements(node, fn) {
  if (node.nodeType === 1) fn(node);
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    walkElements(children[i], fn);
  }
}

function findDirectChildren(node, tagName) {
  const result = [];
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 1 && localName(c) === tagName) {
      result.push(c);
    }
  }
  return result;
}

function getAllText(el) {
  let text = "";
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 3 || c.nodeType === 4) {
      text += c.nodeValue;
    } else if (c.nodeType === 1) {
      text += getAllText(c);
    }
  }
  return text;
}

function localName(el) {
  return (el.localName || el.nodeName || "").replace(/^.*:/, "");
}
