import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseColor } from "../../src/utils/color.mjs";

describe("parseColor", () => {
  it("hex 3位: #F00 → red", () => {
    assert.deepStrictEqual(parseColor("#F00"), { r: 255, g: 0, b: 0 });
  });

  it("hex 6位: #1A1A2E", () => {
    assert.deepStrictEqual(parseColor("#1A1A2E"), { r: 26, g: 26, b: 46 });
  });

  it("hex 8位 (带alpha): #FF000080 → 只取 RGB", () => {
    const c = parseColor("#FF000080");
    assert.strictEqual(c.r, 255);
    assert.strictEqual(c.g, 0);
    assert.strictEqual(c.b, 0);
  });

  it("rgb(255, 0, 0)", () => {
    assert.deepStrictEqual(parseColor("rgb(255, 0, 0)"), { r: 255, g: 0, b: 0 });
  });

  it("rgb(100%, 0%, 0%)", () => {
    const c = parseColor("rgb(100%, 0%, 0%)");
    assert.strictEqual(c.r, 255);
    assert.strictEqual(c.g, 0);
    assert.strictEqual(c.b, 0);
  });

  it("rgba(255, 0, 0, 0.5)", () => {
    const c = parseColor("rgba(255, 0, 0, 0.5)");
    assert.strictEqual(c.r, 255);
    assert.strictEqual(c.g, 0);
    assert.strictEqual(c.b, 0);
  });

  it("hsl(0, 100%, 50%) → 红色", () => {
    assert.deepStrictEqual(parseColor("hsl(0, 100%, 50%)"), { r: 255, g: 0, b: 0 });
  });

  it("hsl(120, 100%, 50%) → 绿色", () => {
    const c = parseColor("hsl(120, 100%, 50%)");
    assert.strictEqual(c.r, 0);
    assert.strictEqual(c.g, 255);
    assert.strictEqual(c.b, 0);
  });

  it("named: red", () => {
    assert.deepStrictEqual(parseColor("red"), { r: 255, g: 0, b: 0 });
  });

  it("named: blue", () => {
    assert.deepStrictEqual(parseColor("blue"), { r: 0, g: 0, b: 255 });
  });

  it("named: cornflowerblue", () => {
    assert.deepStrictEqual(parseColor("cornflowerblue"), { r: 100, g: 149, b: 237 });
  });

  it("named: rebeccapurple", () => {
    assert.deepStrictEqual(parseColor("rebeccapurple"), { r: 102, g: 51, b: 153 });
  });

  it("none → {r:0,g:0,b:0}", () => {
    assert.deepStrictEqual(parseColor("none"), { r: 0, g: 0, b: 0 });
  });

  it("transparent → {r:0,g:0,b:0}", () => {
    assert.deepStrictEqual(parseColor("transparent"), { r: 0, g: 0, b: 0 });
  });

  it('空字符串 → {r:0,g:0,b:0}', () => {
    assert.deepStrictEqual(parseColor(""), { r: 0, g: 0, b: 0 });
  });

  it("null → {r:0,g:0,b:0}", () => {
    assert.deepStrictEqual(parseColor(null), { r: 0, g: 0, b: 0 });
  });

  it("未知颜色名 → {r:0,g:0,b:0}", () => {
    assert.deepStrictEqual(parseColor("notacolor"), { r: 0, g: 0, b: 0 });
  });
});
