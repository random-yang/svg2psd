/**
 * SVG 解析与验证模块（Node.js 版）
 * 读取 SVG 文件，提取 viewBox 和尺寸信息
 */

import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { parseSvgFromDocument } from "../core/parser-core.mjs";

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

  const result = parseSvgFromDocument(doc);
  return { ...result, xml };
}
