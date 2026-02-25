import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSvgString } from "../../src/svg/parser.mjs";
import { buildStandaloneSvg, renderSvgString } from "../../src/render/renderer.mjs";

describe("buildStandaloneSvg", () => {
  it("生成包含 defs 的完整 SVG", () => {
    const { svg, doc } = parseSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs>
      <rect width="50" height="50" fill="red"/>
    </svg>`);
    // 获取 rect 元素
    const children = svg.childNodes;
    let rectEl;
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (c.nodeType === 1 && (c.localName || c.nodeName) === "rect") {
        rectEl = c;
        break;
      }
    }
    const result = buildStandaloneSvg(rectEl, svg);
    assert.ok(result.includes("<?xml"));
    assert.ok(result.includes("<defs>") || result.includes("clipPath"));
    assert.ok(result.includes("rect"));
  });
});

describe("renderSvgString", () => {
  it("渲染简单 SVG → 非空像素数据", () => {
    const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red"/></svg>';
    const result = renderSvgString(svgStr, 100, 100, 1);
    assert.ok(result);
    assert.ok(result.data.length > 0);
    assert.ok(result.width > 0);
    assert.ok(result.height > 0);
  });

  it("返回结果有正确的 bbox", () => {
    const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="10" y="10" width="30" height="30" fill="red"/></svg>';
    const result = renderSvgString(svgStr, 100, 100, 1);
    assert.ok(result);
    assert.ok(result.top >= 0);
    assert.ok(result.left >= 0);
    assert.ok(result.right > result.left);
    assert.ok(result.bottom > result.top);
  });

  it("全透明 SVG → 返回 null", () => {
    const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="rgba(0,0,0,0)"/></svg>';
    const result = renderSvgString(svgStr, 100, 100, 1);
    assert.strictEqual(result, null);
  });
});
