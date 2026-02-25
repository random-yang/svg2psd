/**
 * 字体名 → PostScript 名映射模块
 */

const FONT_MAP = {
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

/**
 * 将字体家族名和粗细转为 PostScript 名
 * @param {string} family
 * @param {string} weight - "normal", "bold", or numeric (400, 700, etc.)
 * @returns {string}
 */
export function toPostScriptName(family, weight) {
  const isBold = weight === "bold" || parseInt(weight) >= 700;
  const entry = FONT_MAP[family];
  if (entry) {
    return isBold ? entry.bold : entry.normal;
  }
  // 通用回退：去除空格，加权重后缀
  const base = family.replace(/\s+/g, "");
  return isBold ? `${base}-Bold` : base;
}

/**
 * 清理字体家族名
 * @param {string} ff
 * @returns {string}
 */
export function cleanFontFamily(ff) {
  if (!ff) return "Arial";
  return ff.split(",")[0].trim().replace(/['"]/g, "");
}

/**
 * 判断是否为粗体
 */
export function isBoldWeight(weight) {
  if (!weight) return false;
  return weight === "bold" || parseInt(weight) >= 700;
}
