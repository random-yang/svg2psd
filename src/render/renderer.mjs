/**
 * resvg-js 渲染模块（Node.js 版）
 * 将单个 SVG 元素渲染为 RGBA 像素数据
 */

import { Resvg } from "@resvg/resvg-js";
import { XMLSerializer } from "@xmldom/xmldom";
import { buildStandaloneSvg as buildStandaloneSvgCore, processRenderResult } from "../core/renderer-core.mjs";

const serializer = new XMLSerializer();
const serializeFn = (node) => serializer.serializeToString(node);

/**
 * 构建只包含指定元素的完整 SVG 字符串（Node.js 版，使用 xmldom 序列化）
 */
export function buildStandaloneSvg(element, svgRoot, transform) {
  return buildStandaloneSvgCore(element, svgRoot, transform, serializeFn);
}

/**
 * 将单个 SVG 元素渲染为像素数据
 * @param {Element} element - 要渲染的 SVG 元素
 * @param {Element} svgRoot - 原始 SVG 根元素（用于获取 defs、viewBox 等）
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} scale - 缩放因子
 * @param {number[]} [transform] - 累积变换矩阵 [a,b,c,d,e,f]
 * @returns {{ data: Uint8ClampedArray, width: number, height: number, top: number, left: number, right: number, bottom: number } | null}
 */
export function renderElement(element, svgRoot, width, height, scale, transform) {
  const svgStr = buildStandaloneSvg(element, svgRoot, transform);
  return renderSvgString(svgStr, width, height, scale);
}

/**
 * 渲染 SVG 字符串为像素数据
 */
export function renderSvgString(svgStr, width, height, scale) {
  const w = Math.round(width * scale);

  const resvg = new Resvg(svgStr, {
    fitTo: { mode: "width", value: w },
    background: "rgba(0,0,0,0)",
  });

  const rendered = resvg.render();
  return processRenderResult(rendered.pixels, rendered.width, rendered.height);
}
