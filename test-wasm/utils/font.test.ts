import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { toPostScriptName, cleanFontFamily, isBoldWeight } from "../../pkg/svg2psd_wasm.js";

describe("toPostScriptName (WASM)", () => {
  it('Arial + normal → "ArialMT"', () => {
    assert.strictEqual(toPostScriptName("Arial", "normal"), "ArialMT");
  });

  it('Arial + bold → "Arial-BoldMT"', () => {
    assert.strictEqual(toPostScriptName("Arial", "bold"), "Arial-BoldMT");
  });

  it('Arial + "700" → "Arial-BoldMT"', () => {
    assert.strictEqual(toPostScriptName("Arial", "700"), "Arial-BoldMT");
  });

  it('未知字体 normal → 去空格', () => {
    assert.strictEqual(toPostScriptName("CustomFont", "normal"), "CustomFont");
  });

  it('未知字体 bold → 加 -Bold', () => {
    assert.strictEqual(toPostScriptName("CustomFont", "bold"), "CustomFont-Bold");
  });
});

describe("cleanFontFamily (WASM)", () => {
  it("提取第一个字体名", () => {
    assert.strictEqual(cleanFontFamily("'Inter', sans-serif"), "Inter");
  });

  it("null → Arial", () => {
    assert.strictEqual(cleanFontFamily(null), "Arial");
  });

  it("去除引号", () => {
    assert.strictEqual(cleanFontFamily('"Open Sans", sans-serif'), "Open Sans");
  });
});

describe("isBoldWeight (WASM)", () => {
  it('"bold" → true', () => {
    assert.strictEqual(isBoldWeight("bold"), true);
  });

  it('"700" → true', () => {
    assert.strictEqual(isBoldWeight("700"), true);
  });

  it('"normal" → false', () => {
    assert.strictEqual(isBoldWeight("normal"), false);
  });

  it('"400" → false', () => {
    assert.strictEqual(isBoldWeight("400"), false);
  });

  it("null → false", () => {
    assert.strictEqual(isBoldWeight(null), false);
  });
});
