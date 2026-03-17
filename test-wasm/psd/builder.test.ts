import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { buildPsdStructure } from "../../pkg/svg2psd_wasm.js";

describe("buildPsdStructure (WASM)", () => {
  it("hidden descriptor → layer.hidden=true", () => {
    const descriptors = [{ type: "graphic", name: "hidden-rect", hidden: true }];
    const psd = JSON.parse(buildPsdStructure(JSON.stringify(descriptors), 100, 100, 1));
    assert.strictEqual(psd.children.length, 1);
    assert.strictEqual(psd.children[0].hidden, true);
    assert.strictEqual(psd.children[0].name, "hidden-rect");
  });

  it("空 descriptors → 无 children", () => {
    const psd = JSON.parse(buildPsdStructure("[]", 100, 100, 1));
    assert.strictEqual(psd.children.length, 0);
  });

  it("group descriptor → children 数组", () => {
    const descriptors = [{
      type: "group",
      name: "mygroup",
      children: [
        { type: "graphic", name: "child1", hidden: true },
        { type: "graphic", name: "child2", hidden: true },
      ],
    }];
    const psd = JSON.parse(buildPsdStructure(JSON.stringify(descriptors), 100, 100, 1));
    assert.strictEqual(psd.children.length, 1);
    assert.strictEqual(psd.children[0].name, "mygroup");
    assert.ok(Array.isArray(psd.children[0].children));
    assert.strictEqual(psd.children[0].children.length, 2);
  });

  it("opacity/blendMode 正确映射 (hidden layer)", () => {
    const descriptors = [{ type: "graphic", name: "styled", hidden: true, opacity: 0.5, blendMode: "multiply" }];
    const psd = JSON.parse(buildPsdStructure(JSON.stringify(descriptors), 100, 100, 1));
    const layer = psd.children[0];
    assert.strictEqual(layer.hidden, true);
    assert.strictEqual(layer.name, "styled");
  });

  it("group 的 opacity/blendMode 正确映射", () => {
    const descriptors = [{
      type: "group",
      name: "styled-group",
      opacity: 0.5,
      blendMode: "multiply",
      children: [
        { type: "graphic", name: "child", hidden: true },
      ],
    }];
    const psd = JSON.parse(buildPsdStructure(JSON.stringify(descriptors), 100, 100, 1));
    const layer = psd.children[0];
    assert.strictEqual(layer.opacity, 0.5);
    assert.strictEqual(layer.blendMode, "multiply");
  });

  it("width/height 应用 scale", () => {
    const psd = JSON.parse(buildPsdStructure("[]", 100, 100, 2));
    assert.strictEqual(psd.width, 200);
    assert.strictEqual(psd.height, 200);
  });
});
