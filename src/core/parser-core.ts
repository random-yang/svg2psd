import type { ViewBox, SvgParseResult } from "../types.js";

export function parseSvgFromDocument(doc: Document): SvgParseResult {
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg") {
    throw new Error("无效的 SVG 文件：缺少 <svg> 根元素");
  }

  const viewBox = parseViewBox(svg.getAttribute("viewBox"));
  const width = parseFloat(svg.getAttribute("width") || "") || (viewBox ? viewBox.w : 800);
  const height = parseFloat(svg.getAttribute("height") || "") || (viewBox ? viewBox.h : 600);

  return { doc, svg, width, height, viewBox };
}

export function parseViewBox(attr: string | null): ViewBox | null {
  if (!attr) return null;
  const parts = attr.split(/[\s,]+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}
