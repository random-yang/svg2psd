/**
 * SVG 解析核心逻辑（平台无关）
 * 从已解析的 Document 中提取 SVG 信息
 */

/**
 * 从 Document 提取 SVG 根元素和尺寸信息
 * @param {Document} doc - 已解析的 DOM 文档
 * @returns {{ doc: Document, svg: Element, width: number, height: number, viewBox: {x:number,y:number,w:number,h:number}|null }}
 */
export function parseSvgFromDocument(doc) {
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg") {
    throw new Error("无效的 SVG 文件：缺少 <svg> 根元素");
  }

  const viewBox = parseViewBox(svg.getAttribute("viewBox"));
  const width = parseFloat(svg.getAttribute("width")) || (viewBox ? viewBox.w : 800);
  const height = parseFloat(svg.getAttribute("height")) || (viewBox ? viewBox.h : 600);

  return { doc, svg, width, height, viewBox };
}

/**
 * 解析 viewBox 属性
 * @param {string|null} attr
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function parseViewBox(attr) {
  if (!attr) return null;
  const parts = attr.split(/[\s,]+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}
