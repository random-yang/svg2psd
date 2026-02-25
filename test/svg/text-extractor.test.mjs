import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSvgString } from "../../src/svg/parser.mjs";
import { extractTextInfo } from "../../src/svg/text-extractor.mjs";
import { identity, parseTransform, multiply } from "../../src/svg/transforms.mjs";

function getTextElement(svgStr) {
  const { svg, viewBox } = parseSvgString(svgStr);
  const children = svg.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 1) {
      const tag = (node.localName || node.nodeName || "").replace(/^.*:/, "");
      if (tag === "text" || tag === "foreignObject") return { el: node, viewBox };
    }
  }
  return null;
}

describe("extractTextInfo", () => {
  it("简单 <text> 提取文本和坐标", () => {
    const { el, viewBox } = getTextElement(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="24">Hello</text></svg>'
    );
    const info = extractTextInfo(el, identity(), viewBox);
    assert.ok(info);
    assert.strictEqual(info.text, "Hello");
    assert.strictEqual(info.x, 10);
    assert.strictEqual(info.y, 50);
    assert.strictEqual(info.isBox, false);
  });

  it("多 <tspan> → 多个 runs", () => {
    const { el, viewBox } = getTextElement(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
        <text x="10" y="50" font-family="Arial" font-size="24" fill="#333">
          <tspan font-weight="bold" fill="red">Bold</tspan>
          <tspan font-size="16" fill="blue">Small</tspan>
        </text>
      </svg>`
    );
    const info = extractTextInfo(el, identity(), viewBox);
    assert.ok(info);
    assert.strictEqual(info.runs.length, 2);
    assert.strictEqual(info.runs[0].text, "Bold");
    assert.strictEqual(info.runs[0].fauxBold, true);
    assert.strictEqual(info.runs[1].text, "Small");
    assert.strictEqual(info.runs[1].fontSize, 16);
  });

  it("<foreignObject> → isBox=true + boxBounds", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <foreignObject x="10" y="20" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml">Hello</div>
      </foreignObject>
    </svg>`;
    const { el, viewBox } = getTextElement(svg);
    const info = extractTextInfo(el, identity(), viewBox);
    assert.ok(info);
    assert.strictEqual(info.isBox, true);
    assert.ok(info.boxBounds);
    assert.strictEqual(info.boxBounds.width, 200);
    assert.strictEqual(info.boxBounds.height, 100);
  });

  it("空文本 → null", () => {
    const { el, viewBox } = getTextElement(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50"></text></svg>'
    );
    const info = extractTextInfo(el, identity(), viewBox);
    assert.strictEqual(info, null);
  });

  it("样式继承到 runs", () => {
    const { el, viewBox } = getTextElement(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Inter" font-size="20" fill="blue">Test</text></svg>'
    );
    const info = extractTextInfo(el, identity(), viewBox);
    assert.ok(info);
    assert.strictEqual(info.runs[0].fontFamily, "Inter");
    assert.strictEqual(info.runs[0].fontSize, 20);
    assert.deepStrictEqual(info.runs[0].fillColor, { r: 0, g: 0, b: 255 });
  });

  it("<text> 应用 translate 变换到坐标", () => {
    const { el, viewBox } = getTextElement(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="10" y="30" font-family="Arial" font-size="20">Moved</text></svg>'
    );
    const transform = parseTransform("translate(100, 200)");
    const info = extractTextInfo(el, transform, viewBox);
    assert.ok(info);
    assert.strictEqual(info.x, 110);
    assert.strictEqual(info.y, 230);
  });

  it("<text> 应用嵌套 translate 变换到坐标", () => {
    const { el, viewBox } = getTextElement(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="5" y="20" font-family="Arial" font-size="18">Nested</text></svg>'
    );
    const outer = parseTransform("translate(50, 100)");
    const inner = parseTransform("translate(100, 50)");
    const accumulated = multiply(outer, inner);
    const info = extractTextInfo(el, accumulated, viewBox);
    assert.ok(info);
    assert.strictEqual(info.x, 155);
    assert.strictEqual(info.y, 170);
  });

  it("<text> identity 变换不改变坐标", () => {
    const { el, viewBox } = getTextElement(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50" y="80" font-family="Arial" font-size="20">Static</text></svg>'
    );
    const info = extractTextInfo(el, identity(), viewBox);
    assert.ok(info);
    assert.strictEqual(info.x, 50);
    assert.strictEqual(info.y, 80);
  });

  it("<foreignObject> 应用 translate 变换到坐标", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <foreignObject x="10" y="10" width="200" height="50">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 16px;">Hello</div>
      </foreignObject>
    </svg>`;
    const { el, viewBox } = getTextElement(svg);
    const transform = parseTransform("translate(200, 400)");
    const info = extractTextInfo(el, transform, viewBox);
    assert.ok(info);
    assert.strictEqual(info.x, 210);
    assert.strictEqual(info.boxBounds.x, 210);
    assert.strictEqual(info.boxBounds.y, 410);
  });
});
