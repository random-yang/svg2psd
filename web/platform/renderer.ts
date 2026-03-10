import { initWasm, Resvg } from "@resvg/resvg-wasm";
// @ts-expect-error vite wasm url import
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import {
  buildStandaloneSvg as buildStandaloneSvgCore,
  processRenderResult,
} from "../../src/core/renderer-core.js";
import type { Matrix, RenderResult } from "../../src/types.js";

let wasmReady = false;

const serializeFn = (node: Node) => new XMLSerializer().serializeToString(node);

export async function init(): Promise<void> {
  if (wasmReady) return;
  await initWasm(fetch(resvgWasmUrl));
  wasmReady = true;
}

export async function initWithWasm(wasmSource: Response | ArrayBuffer | WebAssembly.Module): Promise<void> {
  if (wasmReady) return;
  await initWasm(wasmSource as Parameters<typeof initWasm>[0]);
  wasmReady = true;
}

export function buildStandaloneSvg(element: Element, svgRoot: Element, transform?: Matrix): string {
  return buildStandaloneSvgCore(element, svgRoot, transform, serializeFn);
}

export function renderElement(
  element: Element,
  svgRoot: Element,
  width: number,
  height: number,
  scale: number,
  transform?: Matrix,
): RenderResult | null {
  const svgStr = buildStandaloneSvg(element, svgRoot, transform);
  return renderSvgString(svgStr, width, height, scale);
}

export function renderSvgString(
  svgStr: string,
  width: number,
  height: number,
  scale: number,
): RenderResult | null {
  const w = Math.round(width * scale);

  const resvg = new Resvg(svgStr, {
    fitTo: { mode: "width", value: w },
    background: "rgba(0,0,0,0)",
  });

  const rendered = resvg.render();
  return processRenderResult(rendered.pixels, rendered.width, rendered.height);
}
