import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { parseSvgString } from "../../src/svg/parser.js";
import { walkSvg } from "../../src/svg/walker.js";
import type { LayerDescriptor } from "../../src/types.js";

function walk(svgStr: string): LayerDescriptor[] {
  const { svg } = parseSvgString(svgStr);
  return walkSvg(svg);
}

describe("walkSvg", () => {
  it("单 <rect> → 1 个 graphic descriptor", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red"/></svg>');
    assert.strictEqual(descs.length, 1);
    assert.strictEqual(descs[0].type, "graphic");
  });

  it("嵌套 <g> → group 含 children", () => {
    const descs = walk(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <g id="outer"><g id="inner"><rect width="50" height="50" fill="red"/><rect x="60" width="50" height="50" fill="blue"/></g></g>
    </svg>`);
    assert.strictEqual(descs.length, 1);
    assert.strictEqual(descs[0].type, "group");
    assert.strictEqual(descs[0].name, "outer");
    assert.ok(descs[0].children!.length > 0);
  });

  it("<defs>/<style>/<metadata> 被跳过", () => {
    const descs = walk(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs>
      <style>.a{fill:red}</style>
      <metadata>info</metadata>
      <rect width="50" height="50" fill="red"/>
    </svg>`);
    assert.strictEqual(descs.length, 1);
    assert.strictEqual(descs[0].type, "graphic");
  });

  it("<text> → type=text", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50">Hello</text></svg>');
    assert.strictEqual(descs.length, 1);
    assert.strictEqual(descs[0].type, "text");
  });

  it("<foreignObject> → type=text", () => {
    const descs = walk(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <foreignObject x="0" y="0" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml">Hello</div>
      </foreignObject>
    </svg>`);
    assert.strictEqual(descs.length, 1);
    assert.strictEqual(descs[0].type, "text");
  });

  it("display:none → hidden=true", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" style="display:none"/></svg>');
    assert.strictEqual(descs[0].hidden, true);
  });

  it("visibility:hidden → hidden=true", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" visibility="hidden"/></svg>');
    assert.strictEqual(descs[0].hidden, true);
  });

  it("opacity 属性提取", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" opacity="0.5"/></svg>');
    assert.strictEqual(descs[0].opacity, 0.5);
  });

  it("mix-blend-mode 属性提取", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" style="mix-blend-mode: multiply"/></svg>');
    assert.strictEqual(descs[0].blendMode, "multiply");
  });

  it("空 <g> → 被跳过", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g id="empty"></g></svg>');
    assert.strictEqual(descs.length, 0);
  });

  it("无 id 的 <g> 只含 1 个 child → 提升 child", () => {
    const descs = walk('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g><rect width="50" height="50" fill="red"/></g></svg>');
    assert.strictEqual(descs.length, 1);
    assert.strictEqual(descs[0].type, "graphic");
  });
});
