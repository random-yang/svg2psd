import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { buildTextLayer, extractTextInfo, identity } from "../../pkg/svg2psd_wasm.js";

/**
 * Helper: build a text LayerDescriptor JSON from an SVG string,
 * then call buildTextLayer WASM.
 */
function makeAndBuild(svgStr: string, scale: number = 1) {
  // Extract viewBox from the SVG for passing to buildTextLayer
  const vbMatch = svgStr.match(/viewBox="([^"]+)"/);
  const viewBoxStr = vbMatch ? vbMatch[1] : null;
  let viewBoxJson: string | null = null;
  if (viewBoxStr) {
    const parts = viewBoxStr.split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      viewBoxJson = JSON.stringify({ x: parts[0], y: parts[1], w: parts[2], h: parts[3] });
    }
  }

  // Extract text info
  const textInfoStr = extractTextInfo(svgStr, identity(), viewBoxJson);
  if (!textInfoStr) return null;
  const textInfo = JSON.parse(textInfoStr);

  // Build descriptor
  const desc = {
    type: "text",
    name: `Text: ${textInfo.text?.slice(0, 30) || ""}`,
    transform: JSON.parse(identity()),
    opacity: 1,
    textInfo,
  };

  const result = buildTextLayer(JSON.stringify(desc), viewBoxStr, scale);
  if (!result) return null;
  return JSON.parse(result);
}

describe("buildTextLayer (WASM)", () => {
  it("构建简单文字图层", () => {
    const layer = makeAndBuild(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Hello</text></svg>'
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.text, "Hello");
    assert.ok(layer.text.transform);
    assert.ok(layer.text.style);
  });

  it("foreignObject → point text", () => {
    const layer = makeAndBuild(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
        <foreignObject x="10" y="20" width="200" height="100">
          <div xmlns="http://www.w3.org/1999/xhtml">Hello Box</div>
        </foreignObject>
      </svg>`
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.text, "Hello Box");
    assert.strictEqual(layer.text.shapeType, undefined);
    assert.strictEqual(layer.text.boxBounds, undefined);
  });

  it("viewBox offset 正确应用到坐标", () => {
    const layer = makeAndBuild(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="50 50 200 200"><text x="60" y="80" font-family="Arial" font-size="24">Offset</text></svg>'
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.transform[4], 10);
    assert.strictEqual(layer.text.transform[5], 30);
  });

  it("opacity 传递到 layer", () => {
    const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Hello</text></svg>';
    const viewBoxJson = JSON.stringify({ x: 0, y: 0, w: 200, h: 200 });
    const textInfoStr = extractTextInfo(svgStr, identity(), viewBoxJson);
    assert.ok(textInfoStr);
    const textInfo = JSON.parse(textInfoStr);
    const desc = {
      type: "text",
      name: "Text: Hello",
      transform: JSON.parse(identity()),
      opacity: 0.5,
      textInfo,
    };
    const result = buildTextLayer(JSON.stringify(desc), viewBoxJson, 1);
    assert.ok(result);
    const layer = JSON.parse(result);
    assert.strictEqual(layer.opacity, 0.5);
  });

  it("letter-spacing → tracking 正确转换", () => {
    const layer = makeAndBuild(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="20" letter-spacing="5">Tracked</text></svg>'
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.style.tracking, 250);
  });

  it("line-height → leading + autoLeading 正确转换", () => {
    const layer = makeAndBuild(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="20" line-height="1.5">Leaded</text></svg>'
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.style.autoLeading, false);
    assert.strictEqual(layer.text.style.leading, 30);
  });

  it("leading 应用 scale 因子", () => {
    const layer = makeAndBuild(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="20" line-height="1.5">Scaled Leading</text></svg>',
      2
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.style.leading, 60);
    assert.strictEqual(layer.text.style.autoLeading, false);
  });

  it("无 letter-spacing/line-height 时不输出 tracking/leading", () => {
    const layer = makeAndBuild(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Plain</text></svg>'
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.style.tracking, undefined);
    assert.strictEqual(layer.text.style.leading, undefined);
    assert.strictEqual(layer.text.style.autoLeading, undefined);
  });

  it("scale 因子正确应用到 fontSize 和坐标", () => {
    const layer = makeAndBuild(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><text x="10" y="50" font-family="Arial" font-size="24">Scaled</text></svg>',
      2
    );
    assert.ok(layer);
    assert.strictEqual(layer.text.style.fontSize, 48);
    assert.strictEqual(layer.text.transform[4], 20);
    assert.strictEqual(layer.text.transform[5], 100);
  });
});
