import { Resvg } from "@resvg/resvg-js";
import { XMLSerializer } from "@xmldom/xmldom";
import { buildStandaloneSvg as buildStandaloneSvgCore, processRenderResult } from "../core/renderer-core.js";
import type { Matrix, RenderResult } from "../types.js";

const serializer = new XMLSerializer();
const serializeFn = (node: Node) => serializer.serializeToString(node);

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
