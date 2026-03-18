import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { walkSvg, buildStandaloneSvgForElement } from "../../pkg/svg2psd_wasm.js";

describe("buildStandaloneSvgForElement (WASM)", () => {
  it("保留 xmlns:xlink 命名空间声明", () => {
    const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs><pattern id="p"><use xlink:href="#img"/></pattern></defs>
      <rect width="50" height="50" fill="url(#p)"/>
    </svg>`;
    const descs = JSON.parse(walkSvg(svg));
    const result = buildStandaloneSvgForElement(svg, descs[0].elementIdx, null);
    assert.ok(result);
    assert.ok(result.includes('xmlns:xlink'), "应保留 xmlns:xlink 声明");
    assert.ok(result.includes("xmlns=\"http://www.w3.org/2000/svg\""), "应保留 xmlns");
  });

  it("包含 defs 和 style 内容", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs>
      <style>.red { fill: red }</style>
      <rect class="red" width="50" height="50"/>
    </svg>`;
    const descs = JSON.parse(walkSvg(svg));
    const result = buildStandaloneSvgForElement(svg, descs[0].elementIdx, null);
    assert.ok(result);
    assert.ok(result.includes("clipPath"), "应包含 defs");
    assert.ok(result.includes(".red"), "应包含 style");
    assert.ok(result.includes("<rect"), "应包含目标元素");
  });

  it("应用 transform 矩阵", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50"/></svg>';
    const descs = JSON.parse(walkSvg(svg));
    const result = buildStandaloneSvgForElement(svg, descs[0].elementIdx, JSON.stringify([2, 0, 0, 2, 10, 20]));
    assert.ok(result);
    assert.ok(result.includes("matrix(2,0,0,2,10,20)"), "应包含 transform");
  });

  it("单位矩阵不添加 transform", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50"/></svg>';
    const descs = JSON.parse(walkSvg(svg));
    const result = buildStandaloneSvgForElement(svg, descs[0].elementIdx, JSON.stringify([1, 0, 0, 1, 0, 0]));
    assert.ok(result);
    assert.ok(!result.includes("matrix("), "单位矩阵不应添加 transform");
  });

  it("移除 foreignObject 元素", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g id="grp">
        <rect width="50" height="50"/>
        <foreignObject width="100" height="50"><div>text</div></foreignObject>
      </g>
    </svg>`;
    const descs = JSON.parse(walkSvg(svg));
    // 找到 group
    const grp = descs.find((d: any) => d.type === "group");
    if (grp) {
      const child = grp.children.find((d: any) => d.type === "graphic");
      if (child) {
        const result = buildStandaloneSvgForElement(svg, child.elementIdx, null);
        assert.ok(result);
        assert.ok(!result.includes("foreignObject"), "应移除 foreignObject");
      }
    }
  });

  it("无效的 elementIdx → null", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50"/></svg>';
    const result = buildStandaloneSvgForElement(svg, 9999, null);
    assert.equal(result, undefined);
  });
});

describe("walkSvg → buildStandaloneSvg 集成", () => {
  it("descriptor 字段名正确 (type, elementIdx, blendMode)", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" opacity="0.5" style="mix-blend-mode: multiply"/></svg>';
    const descs = JSON.parse(walkSvg(svg));
    assert.strictEqual(descs[0].type, "graphic");
    assert.strictEqual(typeof descs[0].elementIdx, "number");
    assert.strictEqual(descs[0].blendMode, "multiply");
    assert.strictEqual(descs[0].opacity, 0.5);
  });

  it("每个 descriptor 的 elementIdx 都可以生成有效 SVG", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect x="10" y="10" width="80" height="80" fill="red"/>
      <circle cx="150" cy="50" r="40" fill="green"/>
    </svg>`;
    const descs = JSON.parse(walkSvg(svg));
    assert.strictEqual(descs.length, 2);
    for (const d of descs) {
      const result = buildStandaloneSvgForElement(svg, d.elementIdx, JSON.stringify(d.transform));
      assert.ok(result, `${d.name} 应生成有效 SVG`);
      assert.ok(result.includes("<?xml"), "应包含 XML 声明");
      assert.ok(result.includes("</svg>"), "应包含闭合标签");
    }
  });

  it("含 xlink:href 的 pattern/image SVG 生成有效 standalone SVG", () => {
    const svg = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <rect width="100" height="100" fill="url(#p)"/>
      <defs>
        <pattern id="p" patternContentUnits="objectBoundingBox" width="1" height="1">
          <use xlink:href="#img" transform="scale(0.01)"/>
        </pattern>
        <image id="img" width="100" height="100" xlink:href="data:image/png;base64,iVBORw0KGgo="/>
      </defs>
    </svg>`;
    const descs = JSON.parse(walkSvg(svg));
    assert.ok(descs.length > 0);
    const result = buildStandaloneSvgForElement(svg, descs[0].elementIdx, null);
    assert.ok(result);
    assert.ok(result.includes("xmlns:xlink"), "应保留 xlink 命名空间");
    assert.ok(result.includes("xlink:href"), "应保留 xlink:href 引用");
    assert.ok(result.includes("<pattern"), "应包含 defs 中的 pattern");
  });
});
