/**
 * SVG 递归树遍历模块
 * 将 SVG DOM 树转换为 LayerDescriptor 树
 */

import { parseTransform, multiply } from "./transforms.mjs";

/** 非渲染元素标签 */
const SKIP_TAGS = new Set([
  "defs", "style", "metadata", "clipPath", "mask", "pattern",
  "linearGradient", "radialGradient", "filter", "symbol", "marker",
  "title", "desc",
]);

/** 图形元素标签 */
const GRAPHIC_TAGS = new Set([
  "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "path", "image", "use",
]);

/**
 * @typedef {Object} LayerDescriptor
 * @property {string} type - "group" | "graphic" | "text"
 * @property {string} name - 图层名称
 * @property {Element} [element] - 对应的 SVG DOM 元素
 * @property {number[]} [transform] - 累积变换矩阵
 * @property {number} [opacity] - 不透明度 0-1
 * @property {string} [blendMode] - 混合模式
 * @property {boolean} [hidden] - 是否隐藏
 * @property {LayerDescriptor[]} [children] - 子图层（仅 group）
 * @property {Object} [textInfo] - 文字信息（仅 text）
 */

/**
 * 递归遍历 SVG 树，生成 LayerDescriptor 树
 * @param {Element} svg 根 <svg> 元素
 * @returns {LayerDescriptor[]}
 */
export function walkSvg(svg) {
  const children = walkChildren(svg, [1, 0, 0, 1, 0, 0]);
  return children;
}

function walkChildren(parent, parentTransform) {
  const result = [];
  const childNodes = parent.childNodes || [];

  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType !== 1) continue;

    const tag = localName(node);
    if (SKIP_TAGS.has(tag)) continue;

    const descriptor = processElement(node, tag, parentTransform);
    if (descriptor) result.push(descriptor);
  }

  return result;
}

function processElement(el, tag, parentTransform) {
  const transform = getAccumulatedTransform(el, parentTransform);
  const opacity = getOpacity(el);
  const blendMode = getBlendMode(el);
  const hidden = isHidden(el);

  if (tag === "g") {
    return processGroup(el, transform, opacity, blendMode, hidden);
  }

  if (tag === "text") {
    return {
      type: "text",
      name: getTextLayerName(el),
      element: el,
      transform,
      opacity,
      blendMode,
      hidden,
      textInfo: null, // 在 text-extractor 中填充
    };
  }

  if (tag === "foreignObject") {
    return {
      type: "text",
      name: getForeignObjectLayerName(el),
      element: el,
      transform,
      opacity,
      blendMode,
      hidden,
      textInfo: null,
    };
  }

  if (GRAPHIC_TAGS.has(tag)) {
    return {
      type: "graphic",
      name: getElementName(el, tag),
      element: el,
      transform,
      opacity,
      blendMode,
      hidden,
    };
  }

  // svg 内嵌 svg
  if (tag === "svg") {
    const children = walkChildren(el, transform);
    if (children.length === 0) return null;
    return {
      type: "group",
      name: el.getAttribute("id") || "svg",
      element: el,
      transform,
      opacity,
      blendMode,
      hidden,
      children,
    };
  }

  return null;
}

function processGroup(el, transform, opacity, blendMode, hidden) {
  const children = walkChildren(el, transform);

  // 空组跳过
  if (children.length === 0) return null;

  // 单子元素空包装组折叠：如果组没有自己的 opacity/blendMode/hidden 等属性，
  // 并且只有一个子元素，则提升子元素
  if (
    children.length === 1 &&
    opacity === 1 &&
    !blendMode &&
    !hidden &&
    !el.getAttribute("id")
  ) {
    return children[0];
  }

  return {
    type: "group",
    name: el.getAttribute("id") || guessGroupName(el, children),
    element: el,
    transform,
    opacity,
    blendMode,
    hidden,
    children,
  };
}

function getAccumulatedTransform(el, parentTransform) {
  const localTransform = parseTransform(el.getAttribute("transform"));
  return multiply(parentTransform, localTransform);
}

function getOpacity(el) {
  const style = el.getAttribute("style") || "";
  const opacityMatch = style.match(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/);
  if (opacityMatch) return parseFloat(opacityMatch[1]);
  const attr = el.getAttribute("opacity");
  if (attr) return parseFloat(attr);
  return 1;
}

function getBlendMode(el) {
  const style = el.getAttribute("style") || "";
  const match = style.match(/mix-blend-mode\s*:\s*([^;]+)/);
  return match ? match[1].trim() : null;
}

function isHidden(el) {
  const style = el.getAttribute("style") || "";
  if (/visibility\s*:\s*hidden/.test(style)) return true;
  if (/display\s*:\s*none/.test(style)) return true;
  if (el.getAttribute("visibility") === "hidden") return true;
  if (el.getAttribute("display") === "none") return true;
  return false;
}

function localName(el) {
  return (el.localName || el.nodeName || "").replace(/^.*:/, "");
}

function getTextLayerName(el) {
  const id = el.getAttribute("id");
  if (id) return id;
  const text = getAllText(el).trim();
  return text ? `Text: ${text.slice(0, 30)}` : "Text";
}

function getForeignObjectLayerName(el) {
  const text = getAllText(el).trim();
  return text ? `Text: ${text.slice(0, 30)}` : "ForeignObject";
}

function getAllText(el) {
  let text = "";
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 3 || c.nodeType === 4) {
      text += c.nodeValue;
    } else if (c.nodeType === 1) {
      text += getAllText(c);
    }
  }
  return text;
}

function getElementName(el, tag) {
  const id = el.getAttribute("id");
  if (id) return id;
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function guessGroupName(el, children) {
  // 基于子元素类型推断名称
  const types = children.map((c) => c.type);
  if (types.every((t) => t === "text")) return "TextGroup";
  if (types.every((t) => t === "graphic")) return "Group";
  return "Group";
}

export { localName, getAllText, SKIP_TAGS, GRAPHIC_TAGS };
