/**
 * PSD 文字图层构建模块
 * 将 TextInfo 转为 ag-psd 的可编辑文字图层
 */

/**
 * 构建可编辑文字图层
 * @param {import('../svg/walker.mjs').LayerDescriptor} desc
 * @param {Element} svgRoot
 * @param {number} width
 * @param {number} height
 * @param {number} scale
 * @returns {Object|null} ag-psd 图层对象
 */
export function buildTextLayer(desc, svgRoot, width, height, scale) {
  const info = desc.textInfo;
  if (!info || !info.text) return null;

  // viewBox offset
  const viewBox = svgRoot.getAttribute("viewBox");
  let vbX = 0, vbY = 0;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    vbX = parts[0] || 0;
    vbY = parts[1] || 0;
  }

  const px = (info.x - vbX) * scale;
  const py = (info.y - vbY) * scale;

  const runs = info.runs || [];
  const firstRun = runs[0] || {};

  // 构建 style runs
  const styleRuns = buildStyleRuns(runs, scale);

  const layer = {
    name: desc.name || `Text: ${info.text.slice(0, 30)}`,
    text: {
      text: info.text,
      antiAlias: "smooth",
      transform: [1, 0, 0, 1, px, py],
      style: styleRuns.length > 0 ? styleRuns[0].style : {
        font: { name: firstRun.psName || "ArialMT" },
        fontSize: (firstRun.fontSize || 24) * scale,
        fillColor: firstRun.fillColor || { r: 0, g: 0, b: 0 },
        fauxBold: firstRun.fauxBold || false,
      },
      paragraphStyle: {
        justification: justificationFromAnchor(info.textAnchor),
      },
    },
  };

  // 多 style runs
  if (styleRuns.length > 1) {
    layer.text.styleRuns = styleRuns;
  }

  // Box text (foreignObject)
  if (info.isBox && info.boxBounds) {
    const bb = info.boxBounds;
    layer.text.shapeType = "box";
    layer.text.boxBounds = {
      top: (bb.y - vbY) * scale,
      left: (bb.x - vbX) * scale,
      bottom: (bb.y - vbY + bb.height) * scale,
      right: (bb.x - vbX + bb.width) * scale,
    };
  }

  // 通用属性
  if (desc.opacity !== undefined && desc.opacity < 1) {
    layer.opacity = desc.opacity;
  }
  if (desc.hidden) {
    layer.hidden = true;
  }

  return layer;
}

function buildStyleRuns(runs, scale) {
  if (runs.length === 0) return [];

  return runs.map((run) => ({
    length: run.text.length,
    style: {
      font: { name: run.psName },
      fontSize: run.fontSize * scale,
      fillColor: run.fillColor,
      fauxBold: run.fauxBold,
    },
  }));
}

function justificationFromAnchor(anchor) {
  if (anchor === "middle") return "center";
  if (anchor === "end") return "right";
  return "left";
}
