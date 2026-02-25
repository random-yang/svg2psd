/**
 * 浏览器端 SVG 渲染适配
 * 使用 @resvg/resvg-wasm
 */

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import {
  buildStandaloneSvg as buildStandaloneSvgCore,
  processRenderResult,
} from "../../src/core/renderer-core.mjs";

let wasmReady = false;

const serializeFn = (node) => new XMLSerializer().serializeToString(node);

/**
 * 初始化 WASM（必须在渲染前调用一次）
 */
export async function init() {
  if (wasmReady) return;
  await initWasm(fetch(resvgWasmUrl));
  wasmReady = true;
}

/**
 * 初始化 WASM（接受外部提供的 wasm 源）
 * @param {Response|ArrayBuffer|WebAssembly.Module} wasmSource
 */
export async function initWithWasm(wasmSource) {
  if (wasmReady) return;
  await initWasm(wasmSource);
  wasmReady = true;
}

/**
 * 构建只包含指定元素的完整 SVG 字符串（浏览器版）
 */
export function buildStandaloneSvg(element, svgRoot, transform) {
  return buildStandaloneSvgCore(element, svgRoot, transform, serializeFn);
}

/**
 * 将单个 SVG 元素渲染为像素数据
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
