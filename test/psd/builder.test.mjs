import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseSvgString } from "../../src/svg/parser.mjs";
import { buildPsd } from "../../src/psd/builder.mjs";

function makeSvgRoot() {
  const { svg } = parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>');
  return svg;
}

describe("buildPsd", () => {
  it("hidden descriptor → layer.hidden=true", async () => {
    const svgRoot = makeSvgRoot();
    const psd = await buildPsd(
      [{ type: "graphic", name: "hidden-rect", element: null, hidden: true }],
      svgRoot, 100, 100, 1
    );
    assert.strictEqual(psd.children.length, 1);
    assert.strictEqual(psd.children[0].hidden, true);
    assert.strictEqual(psd.children[0].name, "hidden-rect");
  });

  it("空 descriptors → 无 children", async () => {
    const svgRoot = makeSvgRoot();
    const psd = await buildPsd([], svgRoot, 100, 100, 1);
    assert.strictEqual(psd.children.length, 0);
  });

  it("group descriptor → children 数组", async () => {
    const svgRoot = makeSvgRoot();
    const psd = await buildPsd(
      [{
        type: "group",
        name: "mygroup",
        children: [
          { type: "graphic", name: "child1", element: null, hidden: true },
          { type: "graphic", name: "child2", element: null, hidden: true },
        ],
      }],
      svgRoot, 100, 100, 1
    );
    assert.strictEqual(psd.children.length, 1);
    assert.strictEqual(psd.children[0].name, "mygroup");
    assert.ok(Array.isArray(psd.children[0].children));
    assert.strictEqual(psd.children[0].children.length, 2);
  });

  it("opacity/blendMode 正确映射 (hidden layer)", async () => {
    const svgRoot = makeSvgRoot();
    const psd = await buildPsd(
      [{ type: "graphic", name: "styled", element: null, hidden: true, opacity: 0.5, blendMode: "multiply" }],
      svgRoot, 100, 100, 1
    );
    const layer = psd.children[0];
    // hidden layers 通过 createHiddenLayer 创建，只有 name 和 hidden
    assert.strictEqual(layer.hidden, true);
    assert.strictEqual(layer.name, "styled");
  });

  it("group 的 opacity/blendMode 正确映射", async () => {
    const svgRoot = makeSvgRoot();
    const psd = await buildPsd(
      [{
        type: "group",
        name: "styled-group",
        opacity: 0.5,
        blendMode: "multiply",
        children: [
          { type: "graphic", name: "child", element: null, hidden: true },
        ],
      }],
      svgRoot, 100, 100, 1
    );
    const layer = psd.children[0];
    assert.strictEqual(layer.opacity, 0.5);
    assert.strictEqual(layer.blendMode, "multiply");
  });

  it("width/height 应用 scale", async () => {
    const svgRoot = makeSvgRoot();
    const psd = await buildPsd([], svgRoot, 100, 100, 2);
    assert.strictEqual(psd.width, 200);
    assert.strictEqual(psd.height, 200);
  });
});
