import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { countAllLayers, enrichTextDescriptors, walkSvg } from "../../pkg/svg2psd_wasm.js";

describe("countAllLayers (WASM)", () => {
  it("扁平列表", () => {
    const descs = [
      { type: "graphic", name: "a" },
      { type: "graphic", name: "b" },
    ];
    assert.equal(countAllLayers(JSON.stringify(descs)), 2);
  });

  it("嵌套 group", () => {
    const descs = [
      {
        type: "group",
        name: "g",
        children: [
          { type: "graphic", name: "a" },
          { type: "text", name: "t" },
        ],
      },
    ];
    assert.equal(countAllLayers(JSON.stringify(descs)), 2);
  });

  it("空列表", () => {
    assert.equal(countAllLayers("[]"), 0);
  });
});

describe("enrichTextDescriptors (WASM)", () => {
  it("为 text 类型填充 textInfo", () => {
    const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <text x="10" y="20">Hello</text>
    </svg>`;

    // Use walkSvg to get descriptors with element_idx
    const descs = JSON.parse(walkSvg(svgXml));

    const result = JSON.parse(enrichTextDescriptors(JSON.stringify(descs), svgXml, null));
    assert.ok(result[0].textInfo);
    assert.ok(result[0].textInfo.text);
  });
});
