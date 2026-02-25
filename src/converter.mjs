/**
 * 主编排模块
 * parse → walk → render → writePSD
 */

import fs from "fs";
import { initializeCanvas, writePsdBuffer } from "ag-psd";
import { parseSvg } from "./svg/parser.mjs";
import { walkSvg } from "./svg/walker.mjs";
import { buildPsd } from "./psd/builder.mjs";
import { buildTextLayer } from "./psd/text-layer.mjs";
import { extractTextInfo } from "./svg/text-extractor.mjs";
import { validateInput } from "./utils/validation.mjs";

// 初始化 ag-psd：提供最小化 canvas 实现（仅用于 imageData 写入）
function createMinimalCanvas(width, height) {
  const canvas = {
    width,
    height,
    getContext: () => createMinimalContext(canvas),
    toBuffer: () => Buffer.alloc(0),
  };
  return canvas;
}

function createMinimalContext(canvas) {
  return {
    canvas,
    drawImage: () => {},
    getImageData: (x, y, w, h) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: () => {},
    createImageData: (w, h) => ({
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
  createMinimalCanvas,
  (width, height) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  })
);

/**
 * 将 SVG 文件转换为 PSD
 * @param {string} inputPath - 输入 SVG 路径
 * @param {string} [outputPath] - 输出 PSD 路径
 * @param {Object} [options]
 * @param {number} [options.scale=1] - 缩放因子
 * @returns {Promise<string>} 输出文件路径
 */
export async function convertSvgToPsd(inputPath, outputPath, options = {}) {
  const { scale = 1 } = options;

  // 验证输入
  validateInput(inputPath);

  // 1. 解析 SVG
  const { svg, width, height, viewBox } = parseSvg(inputPath);
  console.log(`解析: ${inputPath} (${Math.round(width)}×${Math.round(height)})`);

  // 2. 递归遍历，生成 LayerDescriptor 树
  const descriptors = walkSvg(svg);
  const layerCount = countAllLayers(descriptors);
  console.log(`图层树: ${layerCount} 个图层`);

  if (layerCount === 0) {
    throw new Error("SVG 中没有可渲染的元素");
  }

  // 3. 提取文字信息（增强 text 类型的 descriptors）
  enrichTextDescriptors(descriptors, svg, viewBox);

  // 4. 构建 PSD
  let completed = 0;
  const psd = await buildPsd(descriptors, svg, width, height, scale, {
    buildTextLayer: (desc, svgRoot, w, h, s) =>
      buildTextLayer(desc, svgRoot, w, h, s),
    onProgress: (current, total) => {
      completed = current;
      process.stdout.write(`\r  渲染: ${current}/${total} 图层`);
    },
  });

  if (completed > 0) {
    process.stdout.write("\n");
  }

  if (!psd.children || psd.children.length === 0) {
    throw new Error("没有成功渲染的图层");
  }

  // 5. 写入 PSD
  const buffer = writePsdBuffer(psd, {
    invalidateTextLayers: true,
    generateThumbnail: true,
  });

  if (!outputPath) {
    outputPath = inputPath.replace(/\.svg$/i, ".psd");
  }
  fs.writeFileSync(outputPath, buffer);
  console.log(`完成: ${outputPath} (${psd.width}×${psd.height}, ${psd.children.length} 个顶层图层)`);

  return outputPath;
}

/**
 * 递归为 text 类型的 descriptor 填充 textInfo
 */
function enrichTextDescriptors(descriptors, svgRoot, viewBox) {
  for (const desc of descriptors) {
    if (desc.type === "group" && desc.children) {
      enrichTextDescriptors(desc.children, svgRoot, viewBox);
    } else if (desc.type === "text" && desc.element) {
      desc.textInfo = extractTextInfo(desc.element, desc.transform, viewBox);
    }
  }
}

function countAllLayers(descriptors) {
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
