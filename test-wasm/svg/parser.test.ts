import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseSvgString, parseViewBox } from "../../pkg/svg2psd_wasm.js";

describe("parseSvgString (WASM)", () => {
  it("正确提取 width/height", () => {
    const result = JSON.parse(parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>'));
    assert.strictEqual(result.width, 400);
    assert.strictEqual(result.height, 300);
  });

  it('正确解析 viewBox "0 0 800 600"', () => {
    const result = JSON.parse(parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 800 600"></svg>'));
    assert.deepStrictEqual(result.viewBox, { x: 0, y: 0, w: 800, h: 600 });
  });

  it("无 width/height 时从 viewBox 推断", () => {
    const result = JSON.parse(parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768"></svg>'));
    assert.strictEqual(result.width, 1024);
    assert.strictEqual(result.height, 768);
  });

  it("无 viewBox 时默认 800x600", () => {
    const result = JSON.parse(parseSvgString('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    assert.strictEqual(result.width, 800);
    assert.strictEqual(result.height, 600);
    assert.strictEqual(result.viewBox, null);
  });

  it("无效 XML → 抛错", () => {
    assert.throws(() => parseSvgString("<not-valid<<>>"));
  });
});

describe("parseViewBox (WASM)", () => {
  it("正常解析", () => {
    const result = JSON.parse(parseViewBox("0 0 100 200"));
    assert.deepStrictEqual(result, { x: 0, y: 0, w: 100, h: 200 });
  });

  it("逗号分隔", () => {
    const result = JSON.parse(parseViewBox("10,20,300,400"));
    assert.deepStrictEqual(result, { x: 10, y: 20, w: 300, h: 400 });
  });

  it("null → null", () => {
    const result = JSON.parse(parseViewBox(null));
    assert.strictEqual(result, null);
  });

  it("不完整 → null", () => {
    const result = JSON.parse(parseViewBox("0 0 100"));
    assert.strictEqual(result, null);
  });

  it("含 NaN → null", () => {
    const result = JSON.parse(parseViewBox("0 0 abc 100"));
    assert.strictEqual(result, null);
  });
});
