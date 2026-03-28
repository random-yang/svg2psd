import type { BlendMode, Layer, Psd } from "ag-psd";
import type { LayerDescriptor, RenderElementFn, BuildTextLayerFn } from "../types.js";

const BLEND_MODE_MAP: Record<string, BlendMode> = {
  normal: "normal",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color dodge",
  "color-burn": "color burn",
  "hard-light": "hard light",
  "soft-light": "soft light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

interface BuildPsdOptions {
  buildTextLayer?: BuildTextLayerFn;
  onProgress?: (current: number, total: number) => void;
  renderElement?: RenderElementFn;
}

export async function buildPsd(
  descriptors: LayerDescriptor[],
  svgRoot: Element,
  width: number,
  height: number,
  scale: number,
  options: BuildPsdOptions = {},
): Promise<Psd> {
  const psdW = Math.round(width * scale);
  const psdH = Math.round(height * scale);
  const { buildTextLayer, onProgress, renderElement } = options;

  let completed = 0;
  const total = countLayers(descriptors);

  async function processDescriptors(descs: LayerDescriptor[]): Promise<Layer[]> {
    const layers: Layer[] = [];
    for (const desc of descs) {
      const layer = await processDescriptor(desc);
      if (layer) layers.push(layer);
    }
    return layers;
  }

  async function processDescriptor(desc: LayerDescriptor): Promise<Layer | null> {
    if (desc.hidden) {
      completed++;
      return createHiddenLayer(desc);
    }

    if (desc.type === "group") {
      const children = await processDescriptors(desc.children || []);
      if (children.length === 0) return null;

      const layer: Layer = {
        name: desc.name,
        opened: true,
        children,
      };
      applyCommonProps(layer, desc);
      return layer;
    }

    if (desc.type === "text") {
      completed++;
      if (onProgress) onProgress(completed, total);
      if (buildTextLayer) {
        return buildTextLayer(desc, svgRoot, width, height, scale);
      }
      return renderElement
        ? renderAsPixelLayer(desc, svgRoot, width, height, scale, renderElement)
        : null;
    }

    if (desc.type === "graphic") {
      const layer = renderElement
        ? await renderAsPixelLayer(desc, svgRoot, width, height, scale, renderElement)
        : null;
      completed++;
      if (onProgress) onProgress(completed, total);
      return layer;
    }

    return null;
  }

  const children = await processDescriptors(descriptors);

  return {
    width: psdW,
    height: psdH,
    children,
  };
}

async function renderAsPixelLayer(
  desc: LayerDescriptor,
  svgRoot: Element,
  width: number,
  height: number,
  scale: number,
  renderElement: RenderElementFn,
): Promise<Layer | null> {
  try {
    const result = renderElement(desc.element!, svgRoot, width, height, scale, desc.transform);
    if (!result) return null;

    const layer: Layer = {
      name: desc.name,
      top: result.top,
      left: result.left,
      bottom: result.bottom,
      right: result.right,
      imageData: {
        data: result.data,
        width: result.width,
        height: result.height,
      },
    };
    applyCommonProps(layer, desc);
    return layer;
  } catch (e) {
    console.error(`  警告: ${desc.name} 渲染失败 - ${(e as Error).message}`);
    return null;
  }
}

function createHiddenLayer(desc: LayerDescriptor): Layer {
  return {
    name: desc.name,
    hidden: true,
  };
}

function applyCommonProps(layer: Layer, desc: LayerDescriptor): void {
  if (desc.opacity !== undefined && desc.opacity < 1) {
    layer.opacity = desc.opacity;
  }
  const mappedBlend = desc.blendMode ? BLEND_MODE_MAP[desc.blendMode] : undefined;
  if (mappedBlend) {
    layer.blendMode = mappedBlend;
  }
  if (desc.hidden) {
    layer.hidden = true;
  }
}

function countLayers(descriptors: LayerDescriptor[]): number {
  let count = 0;
  for (const desc of descriptors) {
    if (desc.type === "group" && desc.children) {
      count += countLayers(desc.children);
    } else {
      count++;
    }
  }
  return count;
}

export { BLEND_MODE_MAP };
