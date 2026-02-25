/**
 * PSD 构建模块
 * 将 LayerDescriptor 树转换为 ag-psd 图层树
 */

import { renderElement } from "../render/renderer.mjs";

/** SVG blend mode → PSD blend mode 映射 */
const BLEND_MODE_MAP = {
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

/**
 * 将 LayerDescriptor 树构建为 ag-psd 的图层结构
 * @param {import('../svg/walker.mjs').LayerDescriptor[]} descriptors
 * @param {Element} svgRoot
 * @param {number} width - SVG 画布宽度
 * @param {number} height - SVG 画布高度
 * @param {number} scale
 * @param {Object} options
 * @param {Function} [options.buildTextLayer] - 文字图层构建函数
 * @param {Function} [options.onProgress] - 进度回调 (current, total)
 * @returns {Promise<Object>} ag-psd 文档对象
 */
export async function buildPsd(descriptors, svgRoot, width, height, scale, options = {}) {
  const psdW = Math.round(width * scale);
  const psdH = Math.round(height * scale);
  const { buildTextLayer, onProgress } = options;

  let completed = 0;
  const total = countLayers(descriptors);

  async function processDescriptors(descs) {
    const layers = [];
    for (const desc of descs) {
      const layer = await processDescriptor(desc);
      if (layer) layers.push(layer);
    }
    return layers;
  }

  async function processDescriptor(desc) {
    if (desc.hidden) {
      completed++;
      return createHiddenLayer(desc);
    }

    if (desc.type === "group") {
      const children = await processDescriptors(desc.children || []);
      if (children.length === 0) return null;

      const layer = {
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
      // 文字没有 builder 时回退为像素渲染
      return renderAsPixelLayer(desc, svgRoot, width, height, scale);
    }

    if (desc.type === "graphic") {
      const layer = await renderAsPixelLayer(desc, svgRoot, width, height, scale);
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

async function renderAsPixelLayer(desc, svgRoot, width, height, scale) {
  try {
    const result = renderElement(desc.element, svgRoot, width, height, scale, desc.transform);
    if (!result) return null;

    const layer = {
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
    console.error(`  警告: ${desc.name} 渲染失败 - ${e.message}`);
    return null;
  }
}

function createHiddenLayer(desc) {
  return {
    name: desc.name,
    hidden: true,
  };
}

function applyCommonProps(layer, desc) {
  if (desc.opacity !== undefined && desc.opacity < 1) {
    layer.opacity = desc.opacity;
  }
  if (desc.blendMode && BLEND_MODE_MAP[desc.blendMode]) {
    layer.blendMode = BLEND_MODE_MAP[desc.blendMode];
  }
  if (desc.hidden) {
    layer.hidden = true;
  }
}

function countLayers(descriptors) {
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
