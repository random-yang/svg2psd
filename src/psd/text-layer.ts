import type { LayerDescriptor, TextRun } from "../types.js";

export function buildTextLayer(
  desc: LayerDescriptor,
  svgRoot: Element,
  _width: number,
  _height: number,
  scale: number,
): Record<string, unknown> | null {
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

  const layer: Record<string, unknown> = {
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
        ...(firstRun.letterSpacing != null && {
          tracking: Math.round(firstRun.letterSpacing / (firstRun.fontSize || 24) * 1000),
        }),
        ...(firstRun.lineHeight != null && {
          autoLeading: false,
          leading: firstRun.lineHeight * scale,
        }),
      },
      paragraphStyle: {
        justification: justificationFromAnchor(info.textAnchor),
      },
    },
  };

  if (styleRuns.length > 1) {
    (layer.text as Record<string, unknown>).styleRuns = styleRuns;
  }

  if (desc.opacity !== undefined && desc.opacity < 1) {
    layer.opacity = desc.opacity;
  }
  if (desc.hidden) {
    layer.hidden = true;
  }

  return layer;
}

interface StyleRun {
  length: number;
  style: Record<string, unknown>;
}

function buildStyleRuns(runs: TextRun[], scale: number): StyleRun[] {
  if (runs.length === 0) return [];

  return runs.map((run) => ({
    length: run.text.length,
    style: {
      font: { name: run.psName },
      fontSize: run.fontSize * scale,
      fillColor: run.fillColor,
      fauxBold: run.fauxBold,
      ...(run.letterSpacing != null && {
        tracking: Math.round(run.letterSpacing / run.fontSize * 1000),
      }),
      ...(run.lineHeight != null && {
        autoLeading: false,
        leading: run.lineHeight * scale,
      }),
    },
  }));
}

function justificationFromAnchor(anchor: string): string {
  if (anchor === "middle") return "center";
  if (anchor === "end") return "right";
  return "left";
}
