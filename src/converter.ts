import fs from "fs";
import { initializeCanvas, writePsdBuffer } from "ag-psd";
import { parseSvg } from "./svg/parser.js";
import { buildTextLayer } from "./psd/text-layer.js";
import { validateInput } from "./utils/validation.js";
import { renderElement } from "./render/renderer.js";
import { convertSvg } from "./core/converter-core.js";

interface MinimalCanvas {
  width: number;
  height: number;
  getContext: () => Record<string, unknown>;
  toBuffer: () => Buffer;
}

function createMinimalCanvas(width: number, height: number): MinimalCanvas {
  const canvas: MinimalCanvas = {
    width,
    height,
    getContext: () => createMinimalContext(canvas),
    toBuffer: () => Buffer.alloc(0),
  };
  return canvas;
}

function createMinimalContext(canvas: MinimalCanvas): Record<string, unknown> {
  return {
    canvas,
    drawImage: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: () => {},
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    clearRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "12px Arial",
    textAlign: "start",
    textBaseline: "alphabetic",
    imageSmoothingEnabled: true,
  };
}

initializeCanvas(
  createMinimalCanvas as unknown as Parameters<typeof initializeCanvas>[0],
  (width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    colorSpace: "srgb" as const,
  }),
);

interface ConvertSvgToPsdOptions {
  scale?: number;
}

export async function convertSvgToPsd(
  inputPath: string,
  outputPath?: string | null,
  options: ConvertSvgToPsdOptions = {},
): Promise<string> {
  const { scale = 1 } = options;

  validateInput(inputPath);

  const { svg, width, height, viewBox } = parseSvg(inputPath);
  console.log(`解析: ${inputPath} (${Math.round(width)}×${Math.round(height)})`);

  const { psd, layerCount } = await convertSvg(svg, width, height, viewBox, {
    scale,
    renderElement,
    buildTextLayer: (desc, svgRoot, w, h, s) =>
      buildTextLayer(desc, svgRoot, w, h, s),
    onProgress: (current, total) => {
      console.log(`  渲染: ${current}/${total} 图层`);
    },
  });

  console.log(`图层树: ${layerCount} 个图层`);

  const buffer = writePsdBuffer(psd as unknown as Parameters<typeof writePsdBuffer>[0], {
    invalidateTextLayers: true,
    generateThumbnail: true,
  });

  if (!outputPath) {
    outputPath = inputPath.replace(/\.svg$/i, ".psd");
  }
  fs.writeFileSync(outputPath, buffer);
  const psdObj = psd as { width: number; height: number; children: unknown[] };
  console.log(`完成: ${outputPath} (${psdObj.width}×${psdObj.height}, ${psdObj.children.length} 个顶层图层)`);

  return outputPath;
}
