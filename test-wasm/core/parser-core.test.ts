import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseSvgString, parseViewBox } from "../../pkg/svg2psd_wasm.js";

describe("parseSvgFromDocument (WASM)", () => {
  it("提取 width/height/viewBox", () => {
    const result = JSON.parse(parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"></svg>'));
    assert.equal(result.width, 200);
    assert.equal(result.height, 100);
    assert.deepEqual(result.viewBox, { x: 0, y: 0, w: 200, h: 100 });
  });

  it("无 width/height 时从 viewBox 推断", () => {
    const result = JSON.parse(parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"></svg>'));
    assert.equal(result.width, 400);
    assert.equal(result.height, 300);
  });

  it("无 width/height/viewBox 时使用默认值", () => {
    const result = JSON.parse(parseSvgString('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    assert.equal(result.width, 800);
    assert.equal(result.height, 600);
    assert.equal(result.viewBox, null);
  });

  it("非 svg 根元素抛错", () => {
    assert.throws(() => parseSvgString('<div xmlns="http://www.w3.org/1999/xhtml">hello</div>'), /缺少.*根元素|解析错误|parse error/i);
  });
});

describe("parseViewBox (WASM)", () => {
  it("正常解析", () => {
    assert.deepEqual(JSON.parse(parseViewBox("0 0 100 200")), { x: 0, y: 0, w: 100, h: 200 });
  });

  it("逗号分隔", () => {
    assert.deepEqual(JSON.parse(parseViewBox("10,20,300,400")), { x: 10, y: 20, w: 300, h: 400 });
  });

  it("null → null", () => {
    assert.equal(JSON.parse(parseViewBox(undefined)), null);
  });

  it("不完整 → null", () => {
    assert.equal(JSON.parse(parseViewBox("0 0 100")), null);
  });

  it("含 NaN → null", () => {
    assert.equal(JSON.parse(parseViewBox("0 0 abc 100")), null);
  });
});
