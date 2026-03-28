import type { Psd } from "ag-psd";
import type { ViewBox, LayerDescriptor, ConvertOptions } from "../types.js";
import { walkSvg } from "../svg/walker.js";
import { buildPsd } from "../psd/builder.js";
import { extractTextInfo } from "../svg/text-extractor.js";

export async function convertSvg(
  svg: Element,
  width: number,
  height: number,
  viewBox: ViewBox | null,
  options: ConvertOptions = { renderElement: () => null },
): Promise<{ psd: Psd; layerCount: number }> {
  const { scale = 1, renderElement, buildTextLayer, onProgress } = options;

  const descriptors = walkSvg(svg);
  const layerCount = countAllLayers(descriptors);

  if (layerCount === 0) {
    throw new Error("SVG 中没有可渲染的元素");
  }

  enrichTextDescriptors(descriptors, svg, viewBox);

  const psd = await buildPsd(descriptors, svg, width, height, scale, {
    buildTextLayer,
    onProgress,
    renderElement,
  });

  if (!psd.children || psd.children.length === 0) {
    throw new Error("没有成功渲染的图层");
  }

  return { psd, layerCount };
}

export function enrichTextDescriptors(
  descriptors: LayerDescriptor[],
  svgRoot: Element,
  viewBox: ViewBox | null,
): void {
  for (const desc of descriptors) {
    if (desc.type === "group" && desc.children) {
      enrichTextDescriptors(desc.children, svgRoot, viewBox);
    } else if (desc.type === "text" && desc.element) {
      desc.textInfo = extractTextInfo(desc.element, desc.transform!, viewBox, svgRoot);
    }
  }
}

export function countAllLayers(descriptors: LayerDescriptor[]): number {
  let count = 0;
  for (const desc of descriptors) {
    if (desc.type === "group" && desc.children) {
      count += countAllLayers(desc.children);
    } else {
      count++;
    }
  }
  return count;
}
