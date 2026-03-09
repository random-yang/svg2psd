import type { FontMapEntry } from "../types.js";

const FONT_MAP: Record<string, FontMapEntry> = {
  "Arial":              { normal: "ArialMT",              bold: "Arial-BoldMT" },
  "Helvetica":          { normal: "Helvetica",            bold: "Helvetica-Bold" },
  "Helvetica Neue":     { normal: "HelveticaNeue",        bold: "HelveticaNeue-Bold" },
  "Inter":              { normal: "Inter",                bold: "Inter-Bold" },
  "Georgia":            { normal: "Georgia",              bold: "Georgia-Bold" },
  "Times New Roman":    { normal: "TimesNewRomanPSMT",    bold: "TimesNewRomanPS-BoldMT" },
  "Courier New":        { normal: "CourierNewPSMT",       bold: "CourierNewPS-BoldMT" },
  "Verdana":            { normal: "Verdana",              bold: "Verdana-Bold" },
  "Tahoma":             { normal: "Tahoma",               bold: "Tahoma-Bold" },
  "Trebuchet MS":       { normal: "TrebuchetMS",          bold: "TrebuchetMS-Bold" },
  "Comic Sans MS":      { normal: "ComicSansMS",          bold: "ComicSansMS-Bold" },
  "Impact":             { normal: "Impact",               bold: "Impact" },
  "Lucida Sans":        { normal: "LucidaGrande",         bold: "LucidaGrande-Bold" },
  "Lucida Grande":      { normal: "LucidaGrande",         bold: "LucidaGrande-Bold" },
  "Roboto":             { normal: "Roboto-Regular",       bold: "Roboto-Bold" },
  "Open Sans":          { normal: "OpenSans-Regular",     bold: "OpenSans-Bold" },
  "Noto Sans":          { normal: "NotoSans-Regular",     bold: "NotoSans-Bold" },
  "Source Sans Pro":    { normal: "SourceSansPro-Regular", bold: "SourceSansPro-Bold" },
  "SF Pro":             { normal: "SFPro-Regular",        bold: "SFPro-Bold" },
  "SF Pro Display":     { normal: "SFProDisplay-Regular", bold: "SFProDisplay-Bold" },
  "SF Pro Text":        { normal: "SFProText-Regular",    bold: "SFProText-Bold" },
  "PingFang SC":        { normal: "PingFangSC-Regular",   bold: "PingFangSC-Semibold" },
  "PingFang TC":        { normal: "PingFangTC-Regular",   bold: "PingFangTC-Semibold" },
  "Microsoft YaHei":    { normal: "MicrosoftYaHei",       bold: "MicrosoftYaHei-Bold" },
  "Noto Sans SC":       { normal: "NotoSansSC-Regular",   bold: "NotoSansSC-Bold" },
};

export function toPostScriptName(family: string, weight: string): string {
  const isBold = weight === "bold" || parseInt(weight) >= 700;
  const entry = FONT_MAP[family];
  if (entry) {
    return isBold ? entry.bold : entry.normal;
  }
  const base = family.replace(/\s+/g, "");
  return isBold ? `${base}-Bold` : base;
}

export function cleanFontFamily(ff: string | null | undefined): string {
  if (!ff) return "Arial";
  return ff.split(",")[0].trim().replace(/['"]/g, "");
}

export function isBoldWeight(weight: string | null | undefined): boolean {
  if (!weight) return false;
  return weight === "bold" || parseInt(weight) >= 700;
}
