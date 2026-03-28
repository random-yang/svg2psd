import type { Justification, Layer, LayerTextData, TextStyle, TextStyleRun } from "ag-psd";
import type { LayerDescriptor, TextRun } from "../types.js";

export function buildTextLayer(
  desc: LayerDescriptor,
  svgRoot: Element,
  _width: number,
  _height: number,
  scale: number,
): Layer | null {
  const info = desc.textInfo;
  if (!info || !info.text) return null;

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
  const firstRun = runs[0] || {} as Partial<TextRun>;

  const styleRuns = buildStyleRuns(runs, scale);

  const text: LayerTextData = {
    text: info.text,
    antiAlias: "smooth",
    transform: [1, 0, 0, 1, px, py],
    style:
      styleRuns.length > 0
        ? styleRuns[0]!.style
        : {
            font: { name: firstRun.psName || "ArialMT" },
            fontSize: (firstRun.fontSize || 24) * scale,
            fillColor: firstRun.fillColor || { r: 0, g: 0, b: 0 },
            fauxBold: firstRun.fauxBold || false,
            ...(firstRun.letterSpacing != null && {
              tracking: Math.round((firstRun.letterSpacing / (firstRun.fontSize || 24)) * 1000),
            }),
            ...(firstRun.lineHeight != null && {
              autoLeading: false,
              leading: firstRun.lineHeight * scale,
            }),
          },
    paragraphStyle: {
      justification: justificationFromAnchor(info.textAnchor),
    },
  };

  if (styleRuns.length > 1) {
    text.styleRuns = styleRuns;
  }

  const layer: Layer = {
    name: desc.name || `Text: ${info.text.slice(0, 30)}`,
    text,
  };

  if (desc.opacity !== undefined && desc.opacity < 1) {
    layer.opacity = desc.opacity;
  }
  if (desc.hidden) {
    layer.hidden = true;
  }

  return layer;
}

function buildStyleRuns(runs: TextRun[], scale: number): TextStyleRun[] {
  if (runs.length === 0) return [];

  return runs.map((run) => ({
    length: run.text.length,
    style: {
      font: { name: run.psName },
      fontSize: run.fontSize * scale,
      fillColor: run.fillColor,
      fauxBold: run.fauxBold,
      ...(run.letterSpacing != null && {
        tracking: Math.round((run.letterSpacing / run.fontSize) * 1000),
      }),
      ...(run.lineHeight != null && {
        autoLeading: false,
        leading: run.lineHeight * scale,
      }),
    } satisfies TextStyle,
  }));
}

function justificationFromAnchor(anchor: string): Justification {
  if (anchor === "middle") return "center";
  if (anchor === "end") return "right";
  return "left";
}
