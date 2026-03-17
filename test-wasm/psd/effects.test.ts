import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { toPsdOpacity, toPsdBlendMode, getBlendModeMap } from "../../pkg/svg2psd_wasm.js";

describe("toPsdOpacity (WASM)", () => {
  it("0.5 → 0.5", () => {
    assert.strictEqual(toPsdOpacity(0.5), 0.5);
  });

  it("undefined → 1", () => {
    assert.strictEqual(toPsdOpacity(undefined), 1);
  });

  it("null → 1", () => {
    assert.strictEqual(toPsdOpacity(null), 1);
  });

  it("负值 clamp → 0", () => {
    assert.strictEqual(toPsdOpacity(-0.5), 0);
  });

  it("超过1 clamp → 1", () => {
    assert.strictEqual(toPsdOpacity(1.5), 1);
  });
});

describe("toPsdBlendMode (WASM)", () => {
  it('"multiply" → "multiply"', () => {
    assert.strictEqual(toPsdBlendMode("multiply"), "multiply");
  });

  it('"color-dodge" → "color dodge"', () => {
    assert.strictEqual(toPsdBlendMode("color-dodge"), "color dodge");
  });

  it('"unknown" → "normal"', () => {
    assert.strictEqual(toPsdBlendMode("unknown"), "normal");
  });

  it("null → 'normal'", () => {
    assert.strictEqual(toPsdBlendMode(null), "normal");
  });
});

describe("getBlendModeMap (WASM)", () => {
  it("包含所有 16 个标准 CSS 混合模式", () => {
    const map = JSON.parse(getBlendModeMap());
    const standard = [
      "normal", "multiply", "screen", "overlay", "darken", "lighten",
      "color-dodge", "color-burn", "hard-light", "soft-light",
      "difference", "exclusion", "hue", "saturation", "color", "luminosity",
    ];
    for (const mode of standard) {
      assert.ok(mode in map, `missing: ${mode}`);
    }
  });
});
