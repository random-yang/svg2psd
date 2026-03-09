import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseSvgString } from "../../src/svg/parser.js";
import { extractTextInfo } from "../../src/svg/text-extractor.js";
import { buildTextLayer } from "../../src/psd/text-layer.js";
import { identity } from "../../src/svg/transforms.js";
import type { LayerDescriptor } from "../../src/types.js";

function makeTextDesc(svgStr: string): { desc: LayerDescriptor; svg: Element } | null {
  const { svg, viewBox } = parseSvgString(svgStr);
  const children = svg.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 1) {
      const tag = ((node as Element).localName || node.nodeName || "").replace(/^.*:/, "");
      if (tag === "text" || tag === "foreignObject") {
        const textInfo = extractTextInfo(node as Element, identity(), viewBox);
        return {
          desc: { type: "text", name: `Text: ${textInfo?.text?.slice(0, 30) || ""}`, element: node as Element, transform: identity(), opacity: 1, textInfo },
          svg,
        };
      }
    }
  }
  return null;
}

describe("buildTextLayer", () => {
  it("构建简单文字图层", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Hello</text></svg>'
    )!;
    const layer = buildTextLayer(desc, svg, 200, 200, 1)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { text: string }).text, "Hello");
    assert.ok((layer.text as { transform: unknown }).transform);
    assert.ok((layer.text as { style: unknown }).style);
  });

  it("foreignObject → point text（兼容 Affinity 等非 Photoshop 工具）", () => {
    const { desc, svg } = makeTextDesc(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
        <foreignObject x="10" y="20" width="200" height="100">
          <div xmlns="http://www.w3.org/1999/xhtml">Hello Box</div>
        </foreignObject>
      </svg>`
    )!;
    const layer = buildTextLayer(desc, svg, 400, 200, 1)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { text: string }).text, "Hello Box");
    assert.strictEqual((layer.text as Record<string, unknown>).shapeType, undefined);
    assert.strictEqual((layer.text as Record<string, unknown>).boxBounds, undefined);
  });

  it("viewBox offset 正确应用到坐标", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="50 50 200 200"><text x="60" y="80" font-family="Arial" font-size="24">Offset</text></svg>'
    )!;
    const layer = buildTextLayer(desc, svg, 200, 200, 1)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { transform: number[] }).transform[4], 10);
    assert.strictEqual((layer.text as { transform: number[] }).transform[5], 30);
  });

  it("opacity 传递到 layer", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Hello</text></svg>'
    )!;
    desc.opacity = 0.5;
    const layer = buildTextLayer(desc, svg, 200, 200, 1)!;
    assert.strictEqual(layer.opacity, 0.5);
  });

  it("letter-spacing → tracking 正确转换", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="20" letter-spacing="5">Tracked</text></svg>'
    )!;
    const layer = buildTextLayer(desc, svg, 200, 200, 1)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { style: { tracking: number } }).style.tracking, 250);
  });

  it("line-height → leading + autoLeading 正确转换", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="20" line-height="1.5">Leaded</text></svg>'
    )!;
    const layer = buildTextLayer(desc, svg, 200, 200, 1)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { style: { autoLeading: boolean } }).style.autoLeading, false);
    assert.strictEqual((layer.text as { style: { leading: number } }).style.leading, 30);
  });

  it("leading 应用 scale 因子", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="20" line-height="1.5">Scaled Leading</text></svg>'
    )!;
    const layer = buildTextLayer(desc, svg, 200, 200, 2)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { style: { leading: number } }).style.leading, 60);
    assert.strictEqual((layer.text as { style: { autoLeading: boolean } }).style.autoLeading, false);
  });

  it("无 letter-spacing/line-height 时不输出 tracking/leading", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Plain</text></svg>'
    )!;
    const layer = buildTextLayer(desc, svg, 200, 200, 1)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { style: Record<string, unknown> }).style.tracking, undefined);
    assert.strictEqual((layer.text as { style: Record<string, unknown> }).style.leading, undefined);
    assert.strictEqual((layer.text as { style: Record<string, unknown> }).style.autoLeading, undefined);
  });

  it("scale 因子正确应用到 fontSize 和坐标", () => {
    const { desc, svg } = makeTextDesc(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Scaled</text></svg>'
    )!;
    const layer = buildTextLayer(desc, svg, 200, 200, 2)!;
    assert.ok(layer);
    assert.strictEqual((layer.text as { style: { fontSize: number } }).style.fontSize, 48);
    assert.strictEqual((layer.text as { transform: number[] }).transform[4], 20);
    assert.strictEqual((layer.text as { transform: number[] }).transform[5], 100);
  });
});
