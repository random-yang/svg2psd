import type { Matrix, LayerDescriptor } from "../types.js";
import { parseTransform, multiply } from "./transforms.js";
import { parseStyleSheet, getMatchedCssProperties, parseStyleAttr } from "./style-resolver.js";
import type { CssRule } from "./style-resolver.js";

const SKIP_TAGS = new Set([
  "defs", "style", "metadata", "clipPath", "mask", "pattern",
  "linearGradient", "radialGradient", "filter", "symbol", "marker",
  "title", "desc",
]);

const GRAPHIC_TAGS = new Set([
  "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "path", "image", "use",
]);

export function walkSvg(svg: Element): LayerDescriptor[] {
  const stylesheet = parseStyleSheet(svg);
  return walkChildren(svg, [1, 0, 0, 1, 0, 0], stylesheet);
}

function walkChildren(parent: Element, parentTransform: Matrix, stylesheet: CssRule[]): LayerDescriptor[] {
  const result: LayerDescriptor[] = [];
  const childNodes = parent.childNodes || [];

  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType !== 1) continue;

    const tag = localName(node as Element);
    if (SKIP_TAGS.has(tag)) continue;

    const descriptor = processElement(node as Element, tag, parentTransform, stylesheet);
    if (descriptor) result.push(descriptor);
  }

  return result;
}

function processElement(el: Element, tag: string, parentTransform: Matrix, stylesheet: CssRule[]): LayerDescriptor | null {
  const transform = getAccumulatedTransform(el, parentTransform);
  const opacity = getOpacity(el, stylesheet);
  const blendMode = getBlendMode(el, stylesheet);
  const hidden = isHidden(el, stylesheet);

  if (tag === "g") {
    return processGroup(el, transform, opacity, blendMode, hidden, stylesheet);
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
      textInfo: null,
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

  if (tag === "svg") {
    const children = walkChildren(el, transform, stylesheet);
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

function processGroup(
  el: Element,
  transform: Matrix,
  opacity: number,
  blendMode: string | null,
  hidden: boolean,
  stylesheet: CssRule[],
): LayerDescriptor | null {
  const children = walkChildren(el, transform, stylesheet);

  if (children.length === 0) return null;

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
    name: el.getAttribute("id") || guessGroupName(children),
    element: el,
    transform,
    opacity,
    blendMode,
    hidden,
    children,
  };
}

function getAccumulatedTransform(el: Element, parentTransform: Matrix): Matrix {
  const localTransform = parseTransform(el.getAttribute("transform"));
  return multiply(parentTransform, localTransform);
}

/**
 * 获取元素的有效样式值（合并 CSS 类选择器 + 表现属性 + inline style）
 */
function getComputedStyleValue(el: Element, prop: string, stylesheet: CssRule[]): string | null {
  // CSS 类选择器（最低优先级）
  let value: string | null = null;
  if (stylesheet.length > 0) {
    const cssProps = getMatchedCssProperties(el, stylesheet);
    if (cssProps[prop] !== undefined) value = cssProps[prop];
  }

  // 表现属性（中优先级）
  const attr = el.getAttribute(prop);
  if (attr !== null && attr !== undefined && attr !== "") value = attr;

  // inline style（最高优先级）
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const styleMap = parseStyleAttr(styleAttr);
    if (styleMap[prop] !== undefined) value = styleMap[prop];
  }

  return value;
}

function getOpacity(el: Element, stylesheet: CssRule[]): number {
  const val = getComputedStyleValue(el, "opacity", stylesheet);
  if (val) return parseFloat(val);
  return 1;
}

function getBlendMode(el: Element, stylesheet: CssRule[]): string | null {
  const val = getComputedStyleValue(el, "mix-blend-mode", stylesheet);
  return val ? val.trim() : null;
}

function isHidden(el: Element, stylesheet: CssRule[]): boolean {
  const vis = getComputedStyleValue(el, "visibility", stylesheet);
  if (vis === "hidden") return true;
  const disp = getComputedStyleValue(el, "display", stylesheet);
  if (disp === "none") return true;
  return false;
}

function localName(el: Element): string {
  return (el.localName || el.nodeName || "").replace(/^.*:/, "");
}

function getTextLayerName(el: Element): string {
  const id = el.getAttribute("id");
  if (id) return id;
  const text = getAllText(el).trim();
  return text ? `Text: ${text.slice(0, 30)}` : "Text";
}

function getForeignObjectLayerName(el: Element): string {
  const text = getAllText(el).trim();
  return text ? `Text: ${text.slice(0, 30)}` : "ForeignObject";
}

function getAllText(el: Element): string {
  let text = "";
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 3 || c.nodeType === 4) {
      text += c.nodeValue;
    } else if (c.nodeType === 1) {
      text += getAllText(c as Element);
    }
  }
  return text;
}

function getElementName(el: Element, tag: string): string {
  const id = el.getAttribute("id");
  if (id) return id;
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function guessGroupName(children: LayerDescriptor[]): string {
  const types = children.map((c) => c.type);
  if (types.every((t) => t === "text")) return "TextGroup";
  return "Group";
}

export { localName, getAllText, SKIP_TAGS, GRAPHIC_TAGS };
