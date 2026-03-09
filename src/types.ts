/** 6 元素仿射变换矩阵 [a, b, c, d, e, f] */
export type Matrix = [number, number, number, number, number, number];

/** SVG viewBox */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** RGB 颜色 (0-255) */
export interface Color {
  r: number;
  g: number;
  b: number;
}

/** 文字样式段 */
export interface TextRun {
  text: string;
  fontFamily: string;
  psName: string;
  fontSize: number;
  fontWeight: string;
  fauxBold: boolean;
  fillColor: Color;
  letterSpacing: number | null;
  lineHeight: number | null;
}

/** 文字信息 */
export interface TextInfo {
  text: string;
  x: number;
  y: number;
  runs: TextRun[];
  textAnchor: string;
  isBox: boolean;
  boxBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** 图层描述符 */
export interface LayerDescriptor {
  type: "group" | "graphic" | "text";
  name: string;
  element?: Element;
  transform?: Matrix;
  opacity?: number;
  blendMode?: string | null;
  hidden?: boolean;
  children?: LayerDescriptor[];
  textInfo?: TextInfo | null;
}

/** 渲染结果 */
export interface RenderResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** 渲染函数签名 */
export type RenderElementFn = (
  element: Element,
  svgRoot: Element,
  width: number,
  height: number,
  scale: number,
  transform?: Matrix,
) => RenderResult | null;

/** 文字图层构建函数签名 */
export type BuildTextLayerFn = (
  desc: LayerDescriptor,
  svgRoot: Element,
  width: number,
  height: number,
  scale: number,
) => Record<string, unknown> | null;

/** 转换选项 */
export interface ConvertOptions {
  scale?: number;
  renderElement: RenderElementFn;
  buildTextLayer?: BuildTextLayerFn;
  onProgress?: (current: number, total: number) => void;
}

/** SVG 解析结果 */
export interface SvgParseResult {
  doc: Document;
  svg: Element;
  width: number;
  height: number;
  viewBox: ViewBox | null;
}

/** SVG 字符串解析结果 */
export interface SvgStringParseResult extends SvgParseResult {
  xml: string;
}

/** BBox */
export interface BBox {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** 字体映射条目 */
export interface FontMapEntry {
  normal: string;
  bold: string;
}
