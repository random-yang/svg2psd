import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { convertSvg, enrichTextDescriptors, countAllLayers } from "../../src/core/converter-core.js";
import type { LayerDescriptor } from "../../src/types.js";

function makeDoc(svgStr: string): Document {
  return new DOMParser().parseFromString(svgStr, "image/svg+xml");
}

describe("countAllLayers", () => {
  it("扁平列表", () => {
    const descs: LayerDescriptor[] = [
      { type: "graphic", name: "a" },
      { type: "graphic", name: "b" },
    ];
    assert.equal(countAllLayers(descs), 2);
  });

  it("嵌套 group", () => {
    const descs: LayerDescriptor[] = [
      {
        type: "group",
        name: "g",
        children: [
          { type: "graphic", name: "a" },
          { type: "text", name: "t" },
        ],
      },
    ];
    assert.equal(countAllLayers(descs), 2);
  });

  it("空列表", () => {
    assert.equal(countAllLayers([]), 0);
  });
});

describe("convertSvg", () => {
  it("渲染并返回 psd 对象", async () => {
    const doc = makeDoc(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="50" height="50" fill="red"/>
    </svg>`);
    const svg = doc.documentElement;

    const mockRenderElement = () => ({
      data: new Uint8ClampedArray(50 * 50 * 4),
      width: 50,
      height: 50,
      top: 0,
      left: 0,
      right: 50,
      bottom: 50,
    });

    const { psd, layerCount } = await convertSvg(svg, 100, 100, null, {
      scale: 1,
      renderElement: mockRenderElement,
    });

    assert.ok(psd);
    assert.equal((psd as { width: number }).width, 100);
    assert.equal((psd as { height: number }).height, 100);
    assert.ok((psd as { children: unknown[] }).children.length > 0);
    assert.ok(layerCount > 0);
  });

  it("空 SVG 抛错", async () => {
    const doc = makeDoc('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>');
    const svg = doc.documentElement;

    await assert.rejects(
      () => convertSvg(svg, 100, 100, null, { renderElement: () => null }),
      /没有可渲染的元素/
    );
  });

  it("进度回调被调用", async () => {
    const doc = makeDoc(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="50" height="50" fill="red"/>
      <circle cx="80" cy="80" r="10" fill="blue"/>
    </svg>`);
    const svg = doc.documentElement;

    const progressCalls: { current: number; total: number }[] = [];
    await convertSvg(svg, 100, 100, null, {
      renderElement: () => ({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
        top: 0,
        left: 0,
        right: 1,
        bottom: 1,
      }),
      onProgress: (current, total) => progressCalls.push({ current, total }),
    });

    assert.ok(progressCalls.length > 0);
  });
});

describe("enrichTextDescriptors", () => {
  it("为 text 类型填充 textInfo", () => {
    const doc = makeDoc(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <text x="10" y="20">Hello</text>
    </svg>`);
    const svg = doc.documentElement;
    const textEl = svg.getElementsByTagName("text")[0];

    const descs: LayerDescriptor[] = [
      {
        type: "text",
        name: "text",
        element: textEl,
        transform: [1, 0, 0, 1, 0, 0],
      },
    ];

    enrichTextDescriptors(descs, svg, null);
    assert.ok(descs[0].textInfo);
    assert.ok(descs[0].textInfo!.text);
  });
});
