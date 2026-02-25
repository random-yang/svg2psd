import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import {
  buildStandaloneSvg,
  processRenderResult,
  isCompletelyTransparent,
  computeTightBBox,
  removeForeignObjects,
} from "../../src/core/renderer-core.mjs";

const serializer = new XMLSerializer();
const serializeFn = (node) => serializer.serializeToString(node);

function makeDoc(svgStr) {
  return new DOMParser().parseFromString(svgStr, "image/svg+xml");
}

describe("buildStandaloneSvg", () => {
  it("生成包含 defs 的完整 SVG（带 serializeFn）", () => {
    const doc = makeDoc(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs>
      <rect width="50" height="50" fill="red"/>
    </svg>`);
    const svg = doc.documentElement;
    const children = svg.childNodes;
    let rectEl;
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (c.nodeType === 1 && (c.localName || c.nodeName) === "rect") {
        rectEl = c;
        break;
      }
    }
    const result = buildStandaloneSvg(rectEl, svg, null, serializeFn);
    assert.ok(result.includes("<?xml"));
    assert.ok(result.includes("clipPath"));
    assert.ok(result.includes("rect"));
  });

  it("应用变换矩阵", () => {
    const doc = makeDoc('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50"/></svg>');
    const svg = doc.documentElement;
    const rect = svg.getElementsByTagName("rect")[0];
    const result = buildStandaloneSvg(rect, svg, [2, 0, 0, 2, 10, 20], serializeFn);
    assert.ok(result.includes("matrix(2,0,0,2,10,20)"));
  });

  it("单位矩阵不添加 transform", () => {
    const doc = makeDoc('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50"/></svg>');
    const svg = doc.documentElement;
    const rect = svg.getElementsByTagName("rect")[0];
    const result = buildStandaloneSvg(rect, svg, [1, 0, 0, 1, 0, 0], serializeFn);
    assert.ok(!result.includes("matrix("));
  });
});

describe("processRenderResult", () => {
  it("全透明 → null", () => {
    const pixels = new Uint8Array(100 * 4); // 全 0
    assert.equal(processRenderResult(pixels, 10, 10), null);
  });

  it("裁剪到非透明区域", () => {
    // 10x10 像素，只有 (2,3) 有非透明像素
    const w = 10, h = 10;
    const pixels = new Uint8Array(w * h * 4);
    const idx = (3 * w + 2) * 4;
    pixels[idx] = 255;     // R
    pixels[idx + 1] = 0;   // G
    pixels[idx + 2] = 0;   // B
    pixels[idx + 3] = 255; // A

    const result = processRenderResult(pixels, w, h);
    assert.ok(result);
    assert.ok(result.width > 0);
    assert.ok(result.height > 0);
    assert.ok(result.left <= 2);
    assert.ok(result.top <= 3);
  });
});

describe("isCompletelyTransparent", () => {
  it("全透明 → true", () => {
    assert.ok(isCompletelyTransparent(new Uint8Array(40)));
  });

  it("有非透明像素 → false", () => {
    const p = new Uint8Array(40);
    p[3] = 1;
    assert.ok(!isCompletelyTransparent(p));
  });
});

describe("computeTightBBox", () => {
  it("全透明 → null", () => {
    assert.equal(computeTightBBox(new Uint8Array(100 * 4), 10, 10), null);
  });

  it("正确计算边界", () => {
    const w = 10, h = 10;
    const pixels = new Uint8Array(w * h * 4);
    // 在 (5,5) 放一个不透明像素
    pixels[(5 * w + 5) * 4 + 3] = 255;
    const bbox = computeTightBBox(pixels, w, h);
    assert.ok(bbox);
    assert.ok(bbox.left <= 5);
    assert.ok(bbox.top <= 5);
    assert.ok(bbox.right > 5);
    assert.ok(bbox.bottom > 5);
  });
});

describe("removeForeignObjects", () => {
  it("移除 foreignObject 元素", () => {
    const doc = makeDoc(`<svg xmlns="http://www.w3.org/2000/svg">
      <g><foreignObject width="100" height="100"><div>text</div></foreignObject><rect/></g>
    </svg>`);
    const g = doc.getElementsByTagName("g")[0];
    removeForeignObjects(g);
    assert.equal(g.getElementsByTagName("foreignObject").length, 0);
    assert.equal(g.getElementsByTagName("rect").length, 1);
  });
});
