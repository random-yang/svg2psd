/**
 * 浏览器端 SVG 解析适配
 * 使用浏览器原生 DOMParser
 */

import { parseSvgFromDocument } from "../../src/core/parser-core.mjs";

/**
 * 从 SVG 字符串解析（浏览器版）
 * @param {string} xml - SVG 字符串
 * @returns {{ doc: Document, svg: Element, width: number, height: number, viewBox: Object|null, xml: string }}
 */
export function parseSvgString(xml) {
  const doc = new DOMParser().parseFromString(xml, "image/svg+xml");

  // 检查浏览器 DOMParser 的解析错误
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`SVG 解析错误: ${parserError.textContent}`);
  }

  const result = parseSvgFromDocument(doc);
  return { ...result, xml };
}
