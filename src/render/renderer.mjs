/**
 * resvg-js 渲染模块
 * 将单个 SVG 元素渲染为 RGBA 像素数据
 */

import { Resvg } from "@resvg/resvg-js";
import { XMLSerializer } from "@xmldom/xmldom";

const serializer = new XMLSerializer();

/**
 * 将单个 SVG 元素渲染为像素数据
 * @param {Element} element - 要渲染的 SVG 元素
 * @param {Element} svgRoot - 原始 SVG 根元素（用于获取 defs、viewBox 等）
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} scale - 缩放因子
 * @returns {{ data: Uint8ClampedArray, width: number, height: number, top: number, left: number, right: number, bottom: number } | null}
 */
export function renderElement(element, svgRoot, width, height, scale) {
  const svgStr = buildStandaloneSvg(element, svgRoot);
  return renderSvgString(svgStr, width, height, scale);
}

/**
 * 渲染 SVG 字符串为像素数据
 */
export function renderSvgString(svgStr, width, height, scale) {
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const resvg = new Resvg(svgStr, {
    fitTo: { mode: "width", value: w },
    background: "rgba(0,0,0,0)",
  });

  const rendered = resvg.render();
  const pixels = rendered.pixels; // Uint8Array RGBA

  if (isCompletelyTransparent(pixels)) return null;

  // 计算紧凑边界框
  const bbox = computeTightBBox(pixels, rendered.width, rendered.height);
  if (!bbox) return null;

  // 裁剪到紧凑区域
  const cropW = bbox.right - bbox.left;
  const cropH = bbox.bottom - bbox.top;
  const cropped = new Uint8ClampedArray(cropW * cropH * 4);

  for (let y = 0; y < cropH; y++) {
    const srcOffset = ((bbox.top + y) * rendered.width + bbox.left) * 4;
    const dstOffset = y * cropW * 4;
    cropped.set(pixels.subarray(srcOffset, srcOffset + cropW * 4), dstOffset);
  }

  return {
    data: cropped,
    width: cropW,
    height: cropH,
    top: bbox.top,
    left: bbox.left,
    right: bbox.right,
    bottom: bbox.bottom,
  };
}

/**
 * 构建只包含指定元素的完整 SVG 字符串
 * 保留原始 SVG 的 defs、style 和 viewBox
 */
export function buildStandaloneSvg(element, svgRoot) {
  const doc = svgRoot.ownerDocument;
  const clone = svgRoot.cloneNode(false); // 浅克隆 <svg> 属性

  // 复制 <defs> 和 <style>
  const children = svgRoot.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue;
    const tag = (c.localName || c.nodeName || "").replace(/^.*:/, "");
    if (tag === "defs" || tag === "style") {
      clone.appendChild(c.cloneNode(true));
    }
  }

  // 克隆目标元素，移除 foreignObject（文字单独处理）
  const elClone = element.cloneNode(true);
  removeForeignObjects(elClone);
  clone.appendChild(elClone);

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
}

function removeForeignObjects(node) {
  const toRemove = [];
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 1) {
      const tag = (c.localName || c.nodeName || "").replace(/^.*:/, "");
      if (tag === "foreignObject") {
        toRemove.push(c);
      } else {
        removeForeignObjects(c);
      }
    }
  }
  toRemove.forEach((c) => node.removeChild(c));
}

function isCompletelyTransparent(pixels) {
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) return false;
  }
  return true;
}

/**
 * 计算像素数据的紧凑边界框（非透明区域）
 */
function computeTightBBox(pixels, width, height) {
  let top = height, left = width, bottom = 0, right = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (bottom < top) return null; // 全透明

  // 扩展 1px padding
  top = Math.max(0, top);
  left = Math.max(0, left);
  bottom = Math.min(height, bottom + 1);
  right = Math.min(width, right + 1);

  return { top, left, bottom, right };
}
