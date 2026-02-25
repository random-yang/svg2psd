/**
 * SVG 解析与验证模块
 * 读取 SVG 文件，提取 viewBox 和尺寸信息
 */

import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";

/**
 * 解析 SVG 文件，返回 DOM 文档和画布尺寸
 * @param {string} filePath SVG 文件路径
 * @returns {{ doc: Document, svg: Element, width: number, height: number, viewBox: {x:number,y:number,w:number,h:number}|null, xml: string }}
 */
export function parseSvg(filePath) {
  const xml = fs.readFileSync(filePath, "utf-8");
  return parseSvgString(xml);
}

/**
 * 从 SVG 字符串解析
 */
export function parseSvgString(xml) {
  const errors = [];
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg) => errors.push(msg),
      fatalError: (msg) => errors.push(msg),
    },
  }).parseFromString(xml, "image/svg+xml");

  if (errors.length > 0) {
    throw new Error(`SVG 解析错误: ${errors[0]}`);
  }

  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== "svg") {
    throw new Error("无效的 SVG 文件：缺少 <svg> 根元素");
  }

  const viewBox = parseViewBox(svg.getAttribute("viewBox"));
  const width = parseFloat(svg.getAttribute("width")) || (viewBox ? viewBox.w : 800);
  const height = parseFloat(svg.getAttribute("height")) || (viewBox ? viewBox.h : 600);

  return { doc, svg, width, height, viewBox, xml };
}

/**
 * 解析 viewBox 属性
 * @param {string|null} attr
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
function parseViewBox(attr) {
  if (!attr) return null;
  const parts = attr.split(/[\s,]+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}
