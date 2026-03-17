/**
 * Rust WASM 引擎适配器
 * 提供与 TS 版本等价的 API，内部调用 Rust WASM
 */
import initWasm, {
  parseSvgString as wasmParseSvgString,
  walkSvg as wasmWalkSvg,
  enrichTextDescriptors as wasmEnrichTextDescriptors,
  buildTextLayer as wasmBuildTextLayer,
  countAllLayers as wasmCountAllLayers,
  buildStandaloneSvgForElement as wasmBuildStandaloneSvg,
} from "../pkg-web/svg2psd_wasm.js";
import { renderSvgString } from "./platform/renderer.js";

let wasmInitialized = false;

export async function initRustWasm(): Promise<void> {
  if (wasmInitialized) return;
  await initWasm();
  wasmInitialized = true;
}

interface ViewBox { x: number; y: number; w: number; h: number }
interface ConvertResult {
  psd: Record<string, unknown>;
  layerCount: number;
}

export function parseSvgString(xml: string) {
  const result = JSON.parse(wasmParseSvgString(xml));
  return {
    width: result.width as number,
    height: result.height as number,
    viewBox: result.viewBox as ViewBox | null,
    xml,
  };
}

export async function convertSvg(
  svgXml: string,
  width: number,
  height: number,
  viewBox: ViewBox | null,
  options: {
    scale?: number;
    onProgress?: (current: number, total: number) => void;
  } = {},
): Promise<ConvertResult> {
  const { scale = 1, onProgress } = options;

  // 1. Walk SVG (Rust WASM)
  const descriptors = JSON.parse(wasmWalkSvg(svgXml));
  const layerCount = wasmCountAllLayers(JSON.stringify(descriptors));

  if (layerCount === 0) {
    throw new Error("SVG 中没有可渲染的元素");
  }

  // 2. Enrich text descriptors (Rust WASM)
  const viewBoxJson = viewBox ? JSON.stringify(viewBox) : null;
  const enriched = JSON.parse(
    wasmEnrichTextDescriptors(JSON.stringify(descriptors), svgXml, viewBoxJson),
  );

  // 3. Build PSD layers
  const psdW = Math.round(width * scale);
  const psdH = Math.round(height * scale);
  let completed = 0;

  const viewBoxStr = viewBox
    ? `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
    : null;

  function processDescriptors(descs: any[]): any[] {
    const layers: any[] = [];
    for (const desc of descs) {
      const layer = processDescriptor(desc);
      if (layer) layers.push(layer);
    }
    return layers;
  }

  function processDescriptor(desc: any): any | null {
    if (desc.hidden) {
      completed++;
      if (onProgress) onProgress(completed, layerCount);
      return { name: desc.name, hidden: true };
    }

    // serde outputs "type" (via #[serde(rename = "type")])
    const type = desc.type;

    if (type === "group") {
      const children = processDescriptors(desc.children || []);
      if (children.length === 0) return null;
      const layer: any = { name: desc.name, opened: true, children };
      applyCommonProps(layer, desc);
      return layer;
    }

    if (type === "text") {
      completed++;
      if (onProgress) onProgress(completed, layerCount);

      // Use Rust WASM to build text layer
      const textLayer = wasmBuildTextLayer(JSON.stringify(desc), viewBoxStr, scale);
      if (textLayer) return JSON.parse(textLayer);

      // Fallback: render as pixel layer
      return renderAsPixelLayer(desc, svgXml, width, height, scale);
    }

    if (type === "graphic") {
      const layer = renderAsPixelLayer(desc, svgXml, width, height, scale);
      completed++;
      if (onProgress) onProgress(completed, layerCount);
      return layer;
    }

    return null;
  }

  const children = processDescriptors(enriched);

  if (children.length === 0) {
    throw new Error("没有成功渲染的图层");
  }

  return {
    psd: { width: psdW, height: psdH, children },
    layerCount,
  };
}

function renderAsPixelLayer(
  desc: any,
  svgXml: string,
  width: number,
  height: number,
  scale: number,
): any | null {
  try {
    const elementIdx = desc.elementIdx;
    if (elementIdx == null) return null;

    // Use Rust WASM to build standalone SVG string
    const transformJson = desc.transform ? JSON.stringify(desc.transform) : null;
    const svgStr = wasmBuildStandaloneSvg(svgXml, elementIdx, transformJson);
    if (!svgStr) return null;

    // Render via resvg-wasm
    const result = renderSvgString(svgStr, width, height, scale);
    if (!result) return null;

    const layer: any = {
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

const BLEND_MAP: Record<string, string> = {
  normal: "normal", multiply: "multiply", screen: "screen",
  overlay: "overlay", darken: "darken", lighten: "lighten",
  "color-dodge": "color dodge", "color-burn": "color burn",
  "hard-light": "hard light", "soft-light": "soft light",
  difference: "difference", exclusion: "exclusion",
  hue: "hue", saturation: "saturation", color: "color", luminosity: "luminosity",
};

function applyCommonProps(layer: any, desc: any): void {
  if (desc.opacity != null && desc.opacity < 1) {
    layer.opacity = desc.opacity;
  }
  // serde camelCase: blendMode
  const blendMode = desc.blendMode;
  if (blendMode && BLEND_MAP[blendMode]) {
    layer.blendMode = BLEND_MAP[blendMode];
  }
  if (desc.hidden) layer.hidden = true;
}
