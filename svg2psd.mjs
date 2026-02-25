#!/usr/bin/env node
/**
 * SVG to PSD converter - preserves text layers as editable text in PSD.
 *
 * Usage: node svg2psd.mjs <input.svg> [-o output.psd] [-s scale]
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createCanvas, loadImage } from "canvas";

// ag-psd needs a global canvas implementation for Node.js
import "ag-psd/initialize-canvas.js";
import { writePsdBuffer } from "ag-psd";

import { DOMParser } from "xmldom";

// ---------------------------------------------------------------------------
// SVG parsing helpers
// ---------------------------------------------------------------------------

function parseSvg(filePath) {
  const xml = fs.readFileSync(filePath, "utf-8");
  const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
  const svg = doc.documentElement;
  const w = parseFloat(svg.getAttribute("width") || "800");
  const h = parseFloat(svg.getAttribute("height") || "600");
  return { doc, svg, width: w, height: h, xml };
}

/** Recursively collect <text> elements with their computed attributes. */
function collectTextElements(node, inherited = {}) {
  const results = [];
  const NS = "http://www.w3.org/2000/svg";

  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue; // element nodes only

    const tag = el.localName || el.nodeName;

    if (tag === "text") {
      const info = extractTextInfo(el, inherited);
      if (info) results.push(info);
    } else if (tag === "g" || tag === "svg") {
      // Inherit group-level attrs
      const groupAttrs = { ...inherited };
      if (el.getAttribute("font-family"))
        groupAttrs.fontFamily = el.getAttribute("font-family");
      if (el.getAttribute("font-size"))
        groupAttrs.fontSize = parseFloat(el.getAttribute("font-size"));
      if (el.getAttribute("fill")) groupAttrs.fill = el.getAttribute("fill");
      results.push(...collectTextElements(el, groupAttrs));
    }
  }
  return results;
}

function extractTextInfo(textEl, inherited) {
  const x = parseFloat(textEl.getAttribute("x") || "0");
  const y = parseFloat(textEl.getAttribute("y") || "0");
  const raw = getTextContent(textEl);
  if (!raw.trim()) return null;

  // Style from element or CSS style attribute
  const style = textEl.getAttribute("style") || "";
  const styleMap = parseStyleAttr(style);

  const fontFamily =
    textEl.getAttribute("font-family") ||
    styleMap["font-family"] ||
    inherited.fontFamily ||
    "Arial";
  const fontSize = parseFloat(
    textEl.getAttribute("font-size") ||
      styleMap["font-size"] ||
      inherited.fontSize ||
      "24"
  );
  const fontWeight =
    textEl.getAttribute("font-weight") ||
    styleMap["font-weight"] ||
    "normal";
  const fill =
    textEl.getAttribute("fill") ||
    styleMap["fill"] ||
    inherited.fill ||
    "#000000";
  const textAnchor =
    textEl.getAttribute("text-anchor") ||
    styleMap["text-anchor"] ||
    "start";

  return {
    text: raw,
    x,
    y,
    fontFamily: cleanFontFamily(fontFamily),
    fontSize,
    fontWeight,
    fill,
    textAnchor,
  };
}

function getTextContent(el) {
  let text = "";
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 3) {
      // text node
      text += c.nodeValue;
    } else if (c.nodeType === 1) {
      // child element (tspan etc.)
      text += getTextContent(c);
    }
  }
  return text;
}

function cleanFontFamily(ff) {
  // Remove quotes, take first family
  return ff
    .split(",")[0]
    .trim()
    .replace(/['"]/g, "");
}

function parseStyleAttr(style) {
  const map = {};
  if (!style) return map;
  style.split(";").forEach((decl) => {
    const [k, v] = decl.split(":").map((s) => s.trim());
    if (k && v) map[k] = v;
  });
  return map;
}

function parseColor(fill) {
  if (!fill || fill === "none") return { r: 0, g: 0, b: 0 };
  if (fill.startsWith("#")) {
    let hex = fill.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = fill.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  // Named colors - fallback
  const named = { white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 }, red: { r: 255, g: 0, b: 0 }, blue: { r: 0, g: 0, b: 255 }, green: { r: 0, g: 128, b: 0 } };
  return named[fill.toLowerCase()] || { r: 0, g: 0, b: 0 };
}

/** Map common font families to PostScript names for Photoshop. */
function toPostScriptName(family, weight) {
  const bold = weight === "bold" || parseInt(weight) >= 700;
  const map = {
    Arial: bold ? "Arial-BoldMT" : "ArialMT",
    "Helvetica": bold ? "Helvetica-Bold" : "Helvetica",
    "Helvetica Neue": bold ? "HelveticaNeue-Bold" : "HelveticaNeue",
    Georgia: bold ? "Georgia-Bold" : "Georgia",
    "Times New Roman": bold ? "TimesNewRomanPS-BoldMT" : "TimesNewRomanPSMT",
    "Courier New": bold ? "CourierNewPS-BoldMT" : "CourierNewPSMT",
    Verdana: bold ? "Verdana-Bold" : "Verdana",
  };
  // Try direct match or return as-is
  return map[family] || (bold ? family + "-Bold" : family);
}

function justificationFromAnchor(anchor) {
  if (anchor === "middle") return "center";
  if (anchor === "end") return "right";
  return "left";
}

// ---------------------------------------------------------------------------
// Render the full SVG (or SVG-without-text) to a canvas for pixel layers
// ---------------------------------------------------------------------------

async function renderSvgToCanvas(svgXml, width, height, scale) {
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  // Write temp SVG, convert to PNG via cairosvg (best quality), load as canvas
  const tmpSvg = path.join("/tmp", `_svg2psd_${Date.now()}.svg`);
  const tmpPng = tmpSvg.replace(".svg", ".png");
  fs.writeFileSync(tmpSvg, svgXml);
  try {
    execSync(
      `python3 -c "
import os, sys
os.environ.setdefault('DYLD_FALLBACK_LIBRARY_PATH','/opt/homebrew/lib:/usr/local/lib')
import cairosvg
cairosvg.svg2png(url='${tmpSvg}', write_to='${tmpPng}', output_width=${w}, output_height=${h})
"`,
      { stdio: "pipe" }
    );
    const img = await loadImage(tmpPng);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    try { fs.unlinkSync(tmpSvg); } catch {}
    try { fs.unlinkSync(tmpPng); } catch {}
  }
}

/** Remove all <text> elements from SVG XML string, return modified XML. */
function removeSvgTextElements(xml) {
  // Simple regex approach: remove <text ...>...</text>
  return xml.replace(/<text[\s\S]*?<\/text>/gi, "");
}

// ---------------------------------------------------------------------------
// Main conversion
// ---------------------------------------------------------------------------

async function svgToPsd(inputPath, outputPath, scale = 1) {
  const { svg, width, height, xml } = parseSvg(inputPath);
  const psdW = Math.round(width * scale);
  const psdH = Math.round(height * scale);

  // Collect text elements
  const texts = collectTextElements(svg);
  console.log(
    `解析: ${inputPath} (${width}x${height}), ${texts.length} 个文字图层`
  );

  const children = [];

  // 1) Render everything except text as a pixel layer (background)
  const bgXml = removeSvgTextElements(xml);
  const bgCanvas = await renderSvgToCanvas(bgXml, width, height, scale);
  children.push({
    name: "Background",
    canvas: bgCanvas,
  });
  console.log("  图层: Background (pixel)");

  // 2) Create editable text layers
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const psName = toPostScriptName(t.fontFamily, t.fontWeight);
    const color = parseColor(t.fill);
    const scaledSize = t.fontSize * scale;

    children.push({
      name: `Text: ${t.text.slice(0, 30)}`,
      text: {
        text: t.text,
        transform: [1, 0, 0, 1, t.x * scale, t.y * scale],
        antiAlias: "smooth",
        style: {
          font: { name: psName },
          fontSize: scaledSize,
          fillColor: color,
          fauxBold: t.fontWeight === "bold" || parseInt(t.fontWeight) >= 700,
        },
        paragraphStyle: {
          justification: justificationFromAnchor(t.textAnchor),
        },
      },
    });
    console.log(`  图层: "${t.text.slice(0, 40)}" (text, ${psName} ${scaledSize}px)`);
  }

  const psd = {
    width: psdW,
    height: psdH,
    children,
  };

  const buffer = writePsdBuffer(psd, {
    invalidateTextLayers: true,
    generateThumbnail: true,
  });

  if (!outputPath) {
    outputPath = inputPath.replace(/\.svg$/i, ".psd");
  }
  fs.writeFileSync(outputPath, buffer);
  console.log(`完成: ${outputPath} (${psdW}x${psdH}, ${children.length} 个图层)`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage() {
  console.log("用法: node svg2psd.mjs <input.svg> [options]");
  console.log("选项:");
  console.log("  -o, --output <path>   输出 PSD 路径");
  console.log("  -s, --scale <n>       缩放倍数 (默认: 1)");
  console.log("  -h, --help            显示帮助");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  let inputs = [];
  let output = null;
  let scale = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--output") {
      output = args[++i];
    } else if (args[i] === "-s" || args[i] === "--scale") {
      scale = parseFloat(args[++i]);
    } else {
      inputs.push(args[i]);
    }
  }

  if (inputs.length === 0) {
    console.error("错误: 请指定输入 SVG 文件");
    process.exit(1);
  }

  if (output && inputs.length > 1) {
    console.error("错误: 多文件模式下不支持 -o 参数");
    process.exit(1);
  }

  for (const input of inputs) {
    await svgToPsd(input, output, scale);
  }
}

main().catch((e) => {
  console.error("错误:", e.message);
  process.exit(1);
});
