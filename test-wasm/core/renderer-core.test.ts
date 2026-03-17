import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { processRenderResult, isCompletelyTransparent, computeTightBBox } from "../../pkg/svg2psd_wasm.js";

describe("processRenderResult (WASM)", () => {
  it("全透明 → undefined", () => {
    const pixels = new Uint8Array(100 * 4);
    assert.equal(processRenderResult(pixels, 10, 10), undefined);
  });

  it("裁剪到非透明区域", () => {
    const w = 10, h = 10;
    const pixels = new Uint8Array(w * h * 4);
    const idx = (3 * w + 2) * 4;
    pixels[idx] = 255;
    pixels[idx + 1] = 0;
    pixels[idx + 2] = 0;
    pixels[idx + 3] = 255;

    const resultStr = processRenderResult(pixels, w, h);
    assert.ok(resultStr);
    const result = JSON.parse(resultStr);
    assert.ok(result.width > 0);
    assert.ok(result.height > 0);
    assert.ok(result.left <= 2);
    assert.ok(result.top <= 3);
  });
});

describe("isCompletelyTransparent (WASM)", () => {
  it("全透明 → true", () => {
    assert.ok(isCompletelyTransparent(new Uint8Array(40)));
  });

  it("有非透明像素 → false", () => {
    const p = new Uint8Array(40);
    p[3] = 1;
    assert.ok(!isCompletelyTransparent(p));
  });
});

describe("computeTightBBox (WASM)", () => {
  it("全透明 → undefined", () => {
    assert.equal(computeTightBBox(new Uint8Array(100 * 4), 10, 10), undefined);
  });

  it("正确计算边界", () => {
    const w = 10, h = 10;
    const pixels = new Uint8Array(w * h * 4);
    pixels[(5 * w + 5) * 4 + 3] = 255;
    const bboxStr = computeTightBBox(pixels, w, h);
    assert.ok(bboxStr);
    const bbox = JSON.parse(bboxStr);
    assert.ok(bbox.left <= 5);
    assert.ok(bbox.top <= 5);
    assert.ok(bbox.right > 5);
    assert.ok(bbox.bottom > 5);
  });
});
