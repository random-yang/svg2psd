import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { extractTextInfo, identity, parseTransform, multiply } from "../../pkg/svg2psd_wasm.js";

describe("extractTextInfo (WASM)", () => {
  it("简单 <text> 提取文本和坐标", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="24">Hello</text></svg>';
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.text, "Hello");
    assert.strictEqual(info.x, 10);
    assert.strictEqual(info.y, 50);
    assert.strictEqual(info.isBox, false);
  });

  it("多 <tspan> → 多个 runs", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <text x="10" y="50" font-family="Arial" font-size="24" fill="#333">
        <tspan font-weight="bold" fill="red">Bold</tspan>
        <tspan font-size="16" fill="blue">Small</tspan>
      </text>
    </svg>`;
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
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
    const vb = JSON.stringify({ x: 0, y: 0, w: 400, h: 200 });
    const result = extractTextInfo(svg, identity(), vb);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.isBox, true);
    assert.ok(info.boxBounds);
    assert.strictEqual(info.boxBounds.width, 200);
    assert.strictEqual(info.boxBounds.height, 100);
  });

  it("空文本 → undefined", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50"></text></svg>';
    const result = extractTextInfo(svg, identity(), null);
    assert.strictEqual(result, undefined);
  });

  it("样式继承到 runs", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Inter" font-size="20" fill="blue">Test</text></svg>';
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].fontFamily, "Inter");
    assert.strictEqual(info.runs[0].fontSize, 20);
    assert.deepStrictEqual(info.runs[0].fillColor, { r: 0, g: 0, b: 255 });
  });

  it("<text> 应用 translate 变换到坐标", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="10" y="30" font-family="Arial" font-size="20">Moved</text></svg>';
    const transform = parseTransform("translate(100, 200)");
    const result = extractTextInfo(svg, transform, null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.x, 110);
    assert.strictEqual(info.y, 230);
  });

  it("<text> 应用嵌套 translate 变换到坐标", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="5" y="20" font-family="Arial" font-size="18">Nested</text></svg>';
    const outer = parseTransform("translate(50, 100)");
    const inner = parseTransform("translate(100, 50)");
    const accumulated = multiply(outer, inner);
    const result = extractTextInfo(svg, accumulated, null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.x, 155);
    assert.strictEqual(info.y, 170);
  });

  it("<text> identity 变换不改变坐标", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50" y="80" font-family="Arial" font-size="20">Static</text></svg>';
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.x, 50);
    assert.strictEqual(info.y, 80);
  });

  it("<text> letter-spacing 提取为 px 值", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="24" letter-spacing="5">Spaced</text></svg>';
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].letterSpacing, 5);
  });

  it("<text> line-height 无单位倍数 → px 值", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="20" line-height="1.5">Lined</text></svg>';
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].lineHeight, 30);
  });

  it("未设置 letter-spacing / line-height → null", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="24">Plain</text></svg>';
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].letterSpacing, null);
    assert.strictEqual(info.runs[0].lineHeight, null);
  });

  it("<foreignObject> 提取 letter-spacing 和 line-height", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <foreignObject x="10" y="20" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 16px; letter-spacing: 3px; line-height: 24px;">Hello</div>
      </foreignObject>
    </svg>`;
    const vb = JSON.stringify({ x: 0, y: 0, w: 400, h: 200 });
    const result = extractTextInfo(svg, identity(), vb);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].letterSpacing, 3);
    assert.strictEqual(info.runs[0].lineHeight, 24);
  });

  it("<foreignObject> line-height 无单位倍数正确转换", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <foreignObject x="10" y="20" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 20px; line-height: 1.5;">Hello</div>
      </foreignObject>
    </svg>`;
    const vb = JSON.stringify({ x: 0, y: 0, w: 400, h: 200 });
    const result = extractTextInfo(svg, identity(), vb);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].lineHeight, 30);
  });

  it("<foreignObject> 多个 <p> 产生换行符", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <foreignObject x="10" y="20" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <p>Line one</p>
          <p>Line two</p>
        </div>
      </foreignObject>
    </svg>`;
    const vb = JSON.stringify({ x: 0, y: 0, w: 400, h: 200 });
    const result = extractTextInfo(svg, identity(), vb);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.text, "Line one\rLine two");
  });

  it("<foreignObject> <br> 产生换行符", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <foreignObject x="10" y="20" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml">Hello<br/>World</div>
      </foreignObject>
    </svg>`;
    const vb = JSON.stringify({ x: 0, y: 0, w: 400, h: 200 });
    const result = extractTextInfo(svg, identity(), vb);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.text, "Hello\rWorld");
  });

  it("<foreignObject> 应用 translate 变换到坐标", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <foreignObject x="10" y="10" width="200" height="50">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: 16px;">Hello</div>
      </foreignObject>
    </svg>`;
    const vb = JSON.stringify({ x: 0, y: 0, w: 400, h: 400 });
    const transform = parseTransform("translate(200, 400)");
    const result = extractTextInfo(svg, transform, vb);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.x, 210);
    assert.strictEqual(info.boxBounds.x, 210);
    assert.strictEqual(info.boxBounds.y, 410);
  });

  it("CSS <style> 类选择器: <text> 字体和颜色", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <style>.title { font-family: Georgia; font-size: 32px; fill: #ff0000 }</style>
      <text class="title" x="10" y="50">Styled</text>
    </svg>`;
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].fontFamily, "Georgia");
    assert.strictEqual(info.runs[0].fontSize, 32);
    assert.deepStrictEqual(info.runs[0].fillColor, { r: 255, g: 0, b: 0 });
  });

  it("CSS <style> 类选择器: <text> letter-spacing 和 line-height", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <style>.spaced { font-size: 20px; letter-spacing: 4px; line-height: 1.8 }</style>
      <text class="spaced" x="10" y="50">Spaced</text>
    </svg>`;
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].letterSpacing, 4);
    assert.strictEqual(info.runs[0].lineHeight, 36);
  });

  it("CSS <style> 类选择器: inline style 优先于 CSS", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <style>.label { fill: blue; font-size: 20px }</style>
      <text class="label" x="10" y="50" style="fill: green">Override</text>
    </svg>`;
    const result = extractTextInfo(svg, identity(), null);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.deepStrictEqual(info.runs[0].fillColor, { r: 0, g: 128, b: 0 });
    assert.strictEqual(info.runs[0].fontSize, 20);
  });

  it("CSS <style> 类选择器: <foreignObject> 字体样式", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
      <style>.box-text { font-family: Helvetica; font-size: 18px; color: #00ff00 }</style>
      <foreignObject x="10" y="20" width="200" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml" class="box-text">Styled Box</div>
      </foreignObject>
    </svg>`;
    const vb = JSON.stringify({ x: 0, y: 0, w: 400, h: 200 });
    const result = extractTextInfo(svg, identity(), vb);
    assert.ok(result);
    const info = JSON.parse(result);
    assert.strictEqual(info.runs[0].fontFamily, "Helvetica");
    assert.strictEqual(info.runs[0].fontSize, 18);
    assert.deepStrictEqual(info.runs[0].fillColor, { r: 0, g: 255, b: 0 });
  });
});
