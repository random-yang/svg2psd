import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseColor } from "../../pkg/svg2psd_wasm.js";

describe("parseColor (WASM)", () => {
  it("hex 3位: #F00 → red", () => {
    const c = JSON.parse(parseColor("#F00"));
    assert.deepStrictEqual(c, { r: 255, g: 0, b: 0 });
  });

  it("hex 6位: #1A1A2E", () => {
    const c = JSON.parse(parseColor("#1A1A2E"));
    assert.deepStrictEqual(c, { r: 26, g: 26, b: 46 });
  });

  it("hex 8位 (带alpha): #FF000080 → 只取 RGB", () => {
    const c = JSON.parse(parseColor("#FF000080"));
    assert.strictEqual(c.r, 255);
    assert.strictEqual(c.g, 0);
    assert.strictEqual(c.b, 0);
  });

  it("rgb(255, 0, 0)", () => {
    const c = JSON.parse(parseColor("rgb(255, 0, 0)"));
    assert.deepStrictEqual(c, { r: 255, g: 0, b: 0 });
  });

  it("rgb(100%, 0%, 0%)", () => {
    const c = JSON.parse(parseColor("rgb(100%, 0%, 0%)"));
    assert.strictEqual(c.r, 255);
    assert.strictEqual(c.g, 0);
    assert.strictEqual(c.b, 0);
  });

  it("rgba(255, 0, 0, 0.5)", () => {
    const c = JSON.parse(parseColor("rgba(255, 0, 0, 0.5)"));
    assert.strictEqual(c.r, 255);
    assert.strictEqual(c.g, 0);
    assert.strictEqual(c.b, 0);
  });

  it("hsl(0, 100%, 50%) → 红色", () => {
    const c = JSON.parse(parseColor("hsl(0, 100%, 50%)"));
    assert.deepStrictEqual(c, { r: 255, g: 0, b: 0 });
  });

  it("hsl(120, 100%, 50%) → 绿色", () => {
    const c = JSON.parse(parseColor("hsl(120, 100%, 50%)"));
    assert.strictEqual(c.r, 0);
    assert.strictEqual(c.g, 255);
    assert.strictEqual(c.b, 0);
  });

  it("named: red", () => {
    const c = JSON.parse(parseColor("red"));
    assert.deepStrictEqual(c, { r: 255, g: 0, b: 0 });
  });

  it("named: blue", () => {
    const c = JSON.parse(parseColor("blue"));
    assert.deepStrictEqual(c, { r: 0, g: 0, b: 255 });
  });

  it("named: cornflowerblue", () => {
    const c = JSON.parse(parseColor("cornflowerblue"));
    assert.deepStrictEqual(c, { r: 100, g: 149, b: 237 });
  });

  it("named: rebeccapurple", () => {
    const c = JSON.parse(parseColor("rebeccapurple"));
    assert.deepStrictEqual(c, { r: 102, g: 51, b: 153 });
  });

  it("none → {r:0,g:0,b:0}", () => {
    const c = JSON.parse(parseColor("none"));
    assert.deepStrictEqual(c, { r: 0, g: 0, b: 0 });
  });

  it("transparent → {r:0,g:0,b:0}", () => {
    const c = JSON.parse(parseColor("transparent"));
    assert.deepStrictEqual(c, { r: 0, g: 0, b: 0 });
  });

  it('空字符串 → {r:0,g:0,b:0}', () => {
    const c = JSON.parse(parseColor(""));
    assert.deepStrictEqual(c, { r: 0, g: 0, b: 0 });
  });

  it("null → {r:0,g:0,b:0}", () => {
    const c = JSON.parse(parseColor(null));
    assert.deepStrictEqual(c, { r: 0, g: 0, b: 0 });
  });

  it("未知颜色名 → {r:0,g:0,b:0}", () => {
    const c = JSON.parse(parseColor("notacolor"));
    assert.deepStrictEqual(c, { r: 0, g: 0, b: 0 });
  });
});
