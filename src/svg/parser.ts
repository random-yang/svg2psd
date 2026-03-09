import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { parseSvgFromDocument } from "../core/parser-core.js";
import type { SvgStringParseResult } from "../types.js";

export function parseSvg(filePath: string): SvgStringParseResult {
  const xml = fs.readFileSync(filePath, "utf-8");
  return parseSvgString(xml);
}

export function parseSvgString(xml: string): SvgStringParseResult {
  const errors: string[] = [];
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg: string) => errors.push(msg),
      fatalError: (msg: string) => errors.push(msg),
    },
  }).parseFromString(xml, "image/svg+xml");

  if (errors.length > 0) {
    throw new Error(`SVG 解析错误: ${errors[0]}`);
  }

  const result = parseSvgFromDocument(doc);
  return { ...result, xml };
}
