import { parseSvgFromDocument } from "../../src/core/parser-core.js";
import type { SvgStringParseResult } from "../../src/types.js";

export function parseSvgString(xml: string): SvgStringParseResult {
  const doc = new DOMParser().parseFromString(xml, "image/svg+xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`SVG 解析错误: ${parserError.textContent}`);
  }

  const result = parseSvgFromDocument(doc);
  return { ...result, xml };
}
