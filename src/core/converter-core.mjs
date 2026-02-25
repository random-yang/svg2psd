/**
 * 转换核心编排逻辑（平台无关）
 * 接收已解析的 SVG DOM，返回 ag-psd 文档对象
 */

import { walkSvg } from "../svg/walker.mjs";
import { buildPsd } from "../psd/builder.mjs";
import { extractTextInfo } from "../svg/text-extractor.mjs";

/**
 * 将已解析的 SVG 转换为 ag-psd 文档对象
 * @param {Element} svg - SVG 根元素
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {{ x: number, y: number, w: number, h: number } | null} viewBox
 * @param {Object} options
 * @param {number} [options.scale=1] - 缩放因子
 * @param {Function} options.renderElement - 渲染函数
 * @param {Function} [options.buildTextLayer] - 文字图层构建函数
 * @param {Function} [options.onProgress] - 进度回调 (current, total)
 * @returns {Promise<{ psd: Object, layerCount: number }>}
 */
export async function convertSvg(svg, width, height, viewBox, options = {}) {
  const { scale = 1, renderElement, buildTextLayer, onProgress } = options;

  // 1. 递归遍历，生成 LayerDescriptor 树
  const descriptors = walkSvg(svg);
  const layerCount = countAllLayers(descriptors);

  if (layerCount === 0) {
    throw new Error("SVG 中没有可渲染的元素");
  }

  // 2. 提取文字信息（增强 text 类型的 descriptors）
  enrichTextDescriptors(descriptors, svg, viewBox);

  // 3. 构建 PSD
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

/**
 * 递归为 text 类型的 descriptor 填充 textInfo
 */
export function enrichTextDescriptors(descriptors, svgRoot, viewBox) {
  for (const desc of descriptors) {
    if (desc.type === "group" && desc.children) {
      enrichTextDescriptors(desc.children, svgRoot, viewBox);
    } else if (desc.type === "text" && desc.element) {
      desc.textInfo = extractTextInfo(desc.element, desc.transform, viewBox);
    }
  }
}

export function countAllLayers(descriptors) {
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
