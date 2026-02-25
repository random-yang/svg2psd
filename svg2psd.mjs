#!/usr/bin/env node
/**
 * SVG to PSD converter - each SVG group becomes a separate PSD layer,
 * text elements (<text> and <foreignObject>) become editable text layers.
 *
 * Usage: node svg2psd.mjs <input.svg> [-o output.psd] [-s scale]
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createCanvas, loadImage } from "canvas";

import "ag-psd/initialize-canvas.js";
import { writePsdBuffer } from "ag-psd";

import { DOMParser, XMLSerializer } from "xmldom";

// ---------------------------------------------------------------------------
// SVG parsing
// ---------------------------------------------------------------------------

function parseSvg(filePath) {
  const xml = fs.readFileSync(filePath, "utf-8");
  const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
  const svg = doc.documentElement;
  const w = parseFloat(svg.getAttribute("width") || "800");
  const h = parseFloat(svg.getAttribute("height") || "600");
  return { doc, svg, width: w, height: h, xml };
}

// ---------------------------------------------------------------------------
// Analyse each top-level <g>: determine if it's text or graphic
// ---------------------------------------------------------------------------

/**
 * Walk the SVG and return an ordered list of "layer descriptors":
 *   { type: "text", text, x, y, fontFamily, fontSize, fontWeight, fill, textAnchor }
 *   { type: "graphic", groupIndex, name }
 */
function analyseTopLevelGroups(svg) {
  const layers = [];
  const children = svg.childNodes || [];

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    const tag = localName(el);

    // Skip <defs>, <style>
    if (tag === "defs" || tag === "style") continue;

    if (tag === "g") {
      // Check what's inside
      const inner = elementChildren(el);
      const textInfo = extractTextFromGroup(el);
      const hasGraphics = inner.some(
        (c) => ["rect", "path", "circle", "ellipse", "polygon", "polyline", "line", "image", "use"].includes(localName(c))
      );

      if (textInfo && !hasGraphics) {
        // Pure text group
        layers.push({ type: "text", domIndex: i, ...textInfo });
      } else if (textInfo && hasGraphics) {
        // Mixed: graphic layer + text layer
        layers.push({ type: "graphic", domIndex: i, name: guessGroupName(el, layers.length) });
        layers.push({ type: "text", domIndex: i, ...textInfo });
      } else {
        layers.push({ type: "graphic", domIndex: i, name: guessGroupName(el, layers.length) });
      }
    } else if (tag === "text") {
      const info = extractTextInfo(el, {});
      if (info) layers.push({ type: "text", domIndex: i, ...info });
    } else if (["rect", "path", "circle", "ellipse", "polygon", "polyline", "line", "image", "use"].includes(tag)) {
      layers.push({ type: "graphic", domIndex: i, name: guessElementName(el, layers.length) });
    }
  }
  return layers;
}

function elementChildren(node) {
  const result = [];
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].nodeType === 1) result.push(children[i]);
  }
  return result;
}

function localName(el) {
  return (el.localName || el.nodeName || "").replace(/^.*:/, "");
}

/** Try to extract text from a group (supports <text>, <foreignObject>, nested <g>). */
function extractTextFromGroup(groupEl) {
  // Direct <text> child
  const textEl = findDescendant(groupEl, "text");
  if (textEl) return extractTextInfo(textEl, {});

  // <foreignObject> with HTML text content (tldraw style)
  const fo = findDescendant(groupEl, "foreignObject");
  if (fo) return extractForeignObjectText(fo, groupEl);

  return null;
}

function findDescendant(node, tagName) {
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue;
    if (localName(c) === tagName) return c;
    const found = findDescendant(c, tagName);
    if (found) return found;
  }
  return null;
}

/** Extract text info from a <foreignObject> element. */
function extractForeignObjectText(foEl, groupEl) {
  const raw = getAllTextContent(foEl).trim();
  if (!raw) return null;

  const foX = parseFloat(foEl.getAttribute("x") || "0");
  const foY = parseFloat(foEl.getAttribute("y") || "0");

  // Get group transform to compute absolute position
  const transform = groupEl.getAttribute("transform") || "";
  const { tx, ty } = parseTranslate(transform);

  // Try to extract style from embedded HTML
  const styleInfo = extractForeignObjectStyle(foEl);

  return {
    text: raw,
    x: foX + tx,
    y: foY + ty + (styleInfo.fontSize || 24), // offset by font size (foreignObject y is top, PSD text y is baseline)
    fontFamily: styleInfo.fontFamily || "Inter",
    fontSize: styleInfo.fontSize || 24,
    fontWeight: styleInfo.fontWeight || "normal",
    fill: styleInfo.color || "#000000",
    textAnchor: "start",
  };
}

function extractForeignObjectStyle(foEl) {
  const result = {};
  // Walk all elements looking for style attributes or class-based hints
  walkElements(foEl, (el) => {
    const style = el.getAttribute && el.getAttribute("style");
    if (style) {
      const map = parseStyleAttr(style);
      if (map["font-family"]) result.fontFamily = cleanFontFamily(map["font-family"]);
      if (map["font-size"]) result.fontSize = parseFloat(map["font-size"]);
      if (map["font-weight"]) result.fontWeight = map["font-weight"];
      if (map["color"]) result.color = map["color"];
    }
    // Direct attributes
    const ff = el.getAttribute && el.getAttribute("font-family");
    if (ff) result.fontFamily = cleanFontFamily(ff);
    const fs = el.getAttribute && el.getAttribute("font-size");
    if (fs) result.fontSize = parseFloat(fs);
  });
  return result;
}

function walkElements(node, fn) {
  if (node.nodeType === 1) fn(node);
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    walkElements(children[i], fn);
  }
}

function parseTranslate(transform) {
  // matrix(a, b, c, d, tx, ty)
  const mm = transform.match(/matrix\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
  if (mm) return { tx: parseFloat(mm[5]), ty: parseFloat(mm[6]) };
  // translate(tx, ty)
  const tm = transform.match(/translate\(\s*([^,)]+)(?:,\s*([^)]+))?\)/);
  if (tm) return { tx: parseFloat(tm[1]), ty: parseFloat(tm[2] || "0") };
  return { tx: 0, ty: 0 };
}

function extractTextInfo(textEl, inherited) {
  const x = parseFloat(textEl.getAttribute("x") || "0");
  const y = parseFloat(textEl.getAttribute("y") || "0");
  const raw = getAllTextContent(textEl);
  if (!raw.trim()) return null;

  const style = textEl.getAttribute("style") || "";
  const styleMap = parseStyleAttr(style);

  return {
    text: raw.trim(),
    x,
    y,
    fontFamily: cleanFontFamily(textEl.getAttribute("font-family") || styleMap["font-family"] || inherited.fontFamily || "Arial"),
    fontSize: parseFloat(textEl.getAttribute("font-size") || styleMap["font-size"] || inherited.fontSize || "24"),
    fontWeight: textEl.getAttribute("font-weight") || styleMap["font-weight"] || "normal",
    fill: textEl.getAttribute("fill") || styleMap["fill"] || inherited.fill || "#000000",
    textAnchor: textEl.getAttribute("text-anchor") || styleMap["text-anchor"] || "start",
  };
}

function getAllTextContent(el) {
  let text = "";
  const children = el.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 3 || c.nodeType === 4) {
      text += c.nodeValue;
    } else if (c.nodeType === 1) {
      text += getAllTextContent(c);
    }
  }
  return text;
}

function guessGroupName(el, index) {
  const id = el.getAttribute("id");
  if (id) return id;
  // Check first child
  const first = elementChildren(el)[0];
  if (first) {
    const tag = localName(first);
    const fill = first.getAttribute("fill") || "";
    if (tag === "rect") return `Rect_${index}`;
    if (tag === "image" || tag === "use") return `Image_${index}`;
    if (tag === "path") return `Path_${index}`;
    return `${tag}_${index}`;
  }
  return `Layer_${index}`;
}

function guessElementName(el, index) {
  const id = el.getAttribute("id");
  if (id) return id;
  return `${localName(el)}_${index}`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function cleanFontFamily(ff) {
  return ff.split(",")[0].trim().replace(/['"]/g, "");
}

function parseStyleAttr(style) {
  const map = {};
  if (!style) return map;
  style.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx === -1) return;
    const k = decl.slice(0, idx).trim();
    const v = decl.slice(idx + 1).trim();
    if (k && v) map[k] = v;
  });
  return map;
}

function parseColor(fill) {
  if (!fill || fill === "none") return { r: 0, g: 0, b: 0 };
  if (fill.startsWith("#")) {
    let hex = fill.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  const m = fill.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) {
    let r = parseFloat(m[1]), g = parseFloat(m[2]), b = parseFloat(m[3]);
    // Values <= 1 might be 0-1 range, but rgba(204,204,204,1) is 0-255
    if (r > 1 || g > 1 || b > 1) return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
  const named = { white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 }, red: { r: 255, g: 0, b: 0 }, blue: { r: 0, g: 0, b: 255 }, green: { r: 0, g: 128, b: 0 } };
  return named[fill.toLowerCase()] || { r: 0, g: 0, b: 0 };
}

function toPostScriptName(family, weight) {
  const bold = weight === "bold" || parseInt(weight) >= 700;
  const map = {
    Arial: bold ? "Arial-BoldMT" : "ArialMT",
    Helvetica: bold ? "Helvetica-Bold" : "Helvetica",
    "Helvetica Neue": bold ? "HelveticaNeue-Bold" : "HelveticaNeue",
    Inter: bold ? "Inter-Bold" : "Inter",
    Georgia: bold ? "Georgia-Bold" : "Georgia",
    "Times New Roman": bold ? "TimesNewRomanPS-BoldMT" : "TimesNewRomanPSMT",
    "Courier New": bold ? "CourierNewPS-BoldMT" : "CourierNewPSMT",
    Verdana: bold ? "Verdana-Bold" : "Verdana",
  };
  return map[family] || (bold ? family + "-Bold" : family);
}

function justificationFromAnchor(anchor) {
  if (anchor === "middle") return "center";
  if (anchor === "end") return "right";
  return "left";
}

// ---------------------------------------------------------------------------
// SVG rendering: render individual groups to canvas
// ---------------------------------------------------------------------------

/**
 * Build a standalone SVG string that renders only the element at childIndex.
 * Preserves <defs> and <style> from the original SVG.
 */
function buildSingleElementSvg(svg, childIndex, serializer) {
  const doc = svg.ownerDocument;
  const clone = svg.cloneNode(false); // shallow clone <svg> with attrs

  // Copy <defs> and <style> children
  const children = svg.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue;
    const tag = localName(c);
    if (tag === "defs" || tag === "style") {
      clone.appendChild(c.cloneNode(true));
    }
  }

  // Copy only the target element
  let idx = 0;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue;
    const tag = localName(c);
    if (tag === "defs" || tag === "style") continue;
    if (i === childIndex) {
      // For groups containing foreignObject (text), strip the foreignObject
      // so we only get the graphic portion
      const cloned = c.cloneNode(true);
      removeForeignObjects(cloned);
      clone.appendChild(cloned);
      break;
    }
  }

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
}

function removeForeignObjects(node) {
  const toRemove = [];
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 1) {
      if (localName(c) === "foreignObject") {
        toRemove.push(c);
      } else {
        removeForeignObjects(c);
      }
    }
  }
  toRemove.forEach((c) => node.removeChild(c));
}

async function renderSvgToCanvas(svgXml, width, height, scale) {
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const tmpSvg = path.join("/tmp", `_svg2psd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.svg`);
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

/** Check if a canvas is completely transparent. */
function isCanvasEmpty(canvas) {
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  // Check alpha channel (every 4th byte)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main conversion
// ---------------------------------------------------------------------------

async function svgToPsd(inputPath, outputPath, scale = 1) {
  const { svg, width, height } = parseSvg(inputPath);
  const psdW = Math.round(width * scale);
  const psdH = Math.round(height * scale);
  const serializer = new XMLSerializer();

  // Analyse structure
  const layerDescs = analyseTopLevelGroups(svg);
  const graphicLayers = layerDescs.filter((l) => l.type === "graphic");
  const textLayers = layerDescs.filter((l) => l.type === "text");

  console.log(`解析: ${inputPath} (${Math.round(width)}x${Math.round(height)}), ${graphicLayers.length} 个图形 + ${textLayers.length} 个文字`);

  const psdChildren = [];

  // Render each graphic group as a separate pixel layer
  for (const desc of layerDescs) {
    if (desc.type === "graphic") {
      const svgStr = buildSingleElementSvg(svg, desc.domIndex, serializer);
      try {
        const canvas = await renderSvgToCanvas(svgStr, width, height, scale);
        if (isCanvasEmpty(canvas)) {
          console.log(`  跳过: ${desc.name} (空白)`);
          continue;
        }
        psdChildren.push({ name: desc.name, canvas });
        console.log(`  图层: ${desc.name} (pixel)`);
      } catch (e) {
        console.error(`  警告: ${desc.name} 渲染失败 - ${e.message}`);
      }
    } else if (desc.type === "text") {
      // Adjust position: SVG viewBox might have an offset
      const viewBox = svg.getAttribute("viewBox");
      let vbX = 0, vbY = 0;
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        vbX = parts[0] || 0;
        vbY = parts[1] || 0;
      }

      const psName = toPostScriptName(desc.fontFamily, desc.fontWeight);
      const color = parseColor(desc.fill);
      const scaledSize = desc.fontSize * scale;

      // Convert from viewBox coords to pixel coords
      const px = (desc.x - vbX) * scale;
      const py = (desc.y - vbY) * scale;

      psdChildren.push({
        name: `Text: ${desc.text.slice(0, 30)}`,
        text: {
          text: desc.text,
          transform: [1, 0, 0, 1, px, py],
          antiAlias: "smooth",
          style: {
            font: { name: psName },
            fontSize: scaledSize,
            fillColor: color,
            fauxBold: desc.fontWeight === "bold" || parseInt(desc.fontWeight) >= 700,
          },
          paragraphStyle: {
            justification: justificationFromAnchor(desc.textAnchor),
          },
        },
      });
      console.log(`  图层: "${desc.text.slice(0, 40)}" (text, ${psName} ${scaledSize}px)`);
    }
  }

  if (psdChildren.length === 0) {
    console.error("错误: 没有可用图层");
    return;
  }

  const psd = { width: psdW, height: psdH, children: psdChildren };
  const buffer = writePsdBuffer(psd, {
    invalidateTextLayers: true,
    generateThumbnail: true,
  });

  if (!outputPath) {
    outputPath = inputPath.replace(/\.svg$/i, ".psd");
  }
  fs.writeFileSync(outputPath, buffer);
  console.log(`完成: ${outputPath} (${psdW}x${psdH}, ${psdChildren.length} 个图层)`);
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
