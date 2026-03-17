import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
  parseStyleAttr,
  getStyleValue,
  resolveStyles,
  parseStyleSheet,
  getMatchedCssProperties,
} from "../../pkg/svg2psd_wasm.js";

// Helper: wrap an element inside an SVG so the WASM can parse it
function svgWrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${inner}</svg>`;
}

describe("parseStyleAttr (WASM)", () => {
  it("解析多属性", () => {
    const result = JSON.parse(parseStyleAttr("fill:red; font-size:16px"));
    assert.strictEqual(result.fill, "red");
    assert.strictEqual(result["font-size"], "16px");
  });

  it("空 style → 空对象", () => {
    assert.deepStrictEqual(JSON.parse(parseStyleAttr("")), {});
    assert.deepStrictEqual(JSON.parse(parseStyleAttr(null)), {});
  });
});

describe("getStyleValue (WASM)", () => {
  it("style 属性优先于表现属性", () => {
    const svg = svgWrap('<rect fill="blue" style="fill:red"/>');
    assert.strictEqual(getStyleValue(svg, "rect", "fill"), "red");
  });

  it("表现属性优先于 inherited", () => {
    const svg = svgWrap('<rect fill="blue"/>');
    assert.strictEqual(getStyleValue(svg, "rect", "fill", "green"), "blue");
  });

  it("style 优先于 inherited 和表现属性", () => {
    const svg = svgWrap('<rect fill="blue" style="fill:green"/>');
    assert.strictEqual(getStyleValue(svg, "rect", "fill", "red"), "green");
  });
});

describe("resolveStyles (WASM)", () => {
  it("自身属性覆盖继承", () => {
    const svg = svgWrap('<rect fill="red" font-weight="bold"/>');
    const parentStyles = { "font-weight": "normal", "fill": "blue" };
    const resolved = JSON.parse(resolveStyles(svg, "rect", JSON.stringify(parentStyles)));
    assert.strictEqual(resolved.fill, "red");
    assert.strictEqual(resolved["font-weight"], "bold");
  });

  it("style 属性最高优先级", () => {
    const svg = svgWrap('<rect fill="blue" style="fill:green"/>');
    const resolved = JSON.parse(resolveStyles(svg, "rect", JSON.stringify({ fill: "red" })));
    assert.strictEqual(resolved.fill, "green");
  });

  it("mix-blend-mode 从 style 中解析", () => {
    const svg = svgWrap('<rect style="mix-blend-mode: multiply"/>');
    const resolved = JSON.parse(resolveStyles(svg, "rect", "{}"));
    assert.strictEqual(resolved["mix-blend-mode"], "multiply");
  });
});

describe("parseStyleSheet (WASM)", () => {
  it("解析单个 <style> 块", () => {
    const svg = svgWrap('<style>.cls-1 { fill: red; font-size: 16px }</style>');
    const rules = JSON.parse(parseStyleSheet(svg));
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].selector, ".cls-1");
    assert.strictEqual(rules[0].properties.fill, "red");
    assert.strictEqual(rules[0].properties["font-size"], "16px");
  });

  it("解析多个规则", () => {
    const svg = svgWrap('<style>.a { fill: red } .b { fill: blue } #c { font-weight: bold }</style>');
    const rules = JSON.parse(parseStyleSheet(svg));
    assert.strictEqual(rules.length, 3);
  });

  it("解析逗号分隔的选择器组", () => {
    const svg = svgWrap('<style>.a, .b { fill: red }</style>');
    const rules = JSON.parse(parseStyleSheet(svg));
    assert.strictEqual(rules.length, 2);
    assert.strictEqual(rules[0].selector, ".a");
    assert.strictEqual(rules[1].selector, ".b");
    assert.strictEqual(rules[0].properties.fill, "red");
    assert.strictEqual(rules[1].properties.fill, "red");
  });

  it("忽略 CSS 注释", () => {
    const svg = svgWrap('<style>/* comment */ .a { fill: red } /* another */</style>');
    const rules = JSON.parse(parseStyleSheet(svg));
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].properties.fill, "red");
  });

  it("无 <style> → 空数组", () => {
    const svg = svgWrap('<rect width="10" height="10"/>');
    const rules = JSON.parse(parseStyleSheet(svg));
    assert.strictEqual(rules.length, 0);
  });

  it("多个 <style> 元素合并", () => {
    const svg = svgWrap('<style>.a { fill: red }</style><style>.b { fill: blue }</style>');
    const rules = JSON.parse(parseStyleSheet(svg));
    assert.strictEqual(rules.length, 2);
  });
});

describe("matchSelector via getMatchedCssProperties (WASM)", () => {
  it("匹配类选择器 .red 并返回属性", () => {
    const svg = svgWrap('<style>.red { fill: red }</style><rect class="red" width="10" height="10"/>');
    const props = JSON.parse(getMatchedCssProperties(svg, "rect"));
    assert.strictEqual(props.fill, "red");
  });

  it("不匹配的选择器不返回", () => {
    const svg = svgWrap('<style>.blue { fill: blue }</style><rect class="red" width="10" height="10"/>');
    const props = JSON.parse(getMatchedCssProperties(svg, "rect"));
    assert.strictEqual(props.fill, undefined);
  });

  it("高 specificity 覆盖低 specificity", () => {
    const svg = svgWrap('<style>rect { fill: blue } .red { fill: red }</style><rect class="red" width="10" height="10"/>');
    const props = JSON.parse(getMatchedCssProperties(svg, "rect"));
    assert.strictEqual(props.fill, "red");
  });
});

describe("resolveStyles with stylesheet (WASM)", () => {
  it("CSS 类选择器样式被应用 (via walkSvg behavior)", () => {
    // Test that resolveStyles picks up CSS styles when the SVG contains <style>
    const svg = svgWrap('<style>.label { font-size: 20px; fill: blue }</style><text class="label" x="10" y="20">Hello</text>');
    const resolved = JSON.parse(resolveStyles(svg, "text", "{}"));
    assert.strictEqual(resolved["font-size"], "20px");
    assert.strictEqual(resolved.fill, "blue");
  });

  it("inline style 优先于 CSS 类选择器", () => {
    const svg = svgWrap('<style>.label { fill: blue }</style><text class="label" style="fill: red" x="10" y="20">Hello</text>');
    const resolved = JSON.parse(resolveStyles(svg, "text", "{}"));
    assert.strictEqual(resolved.fill, "red");
  });

  it("表现属性优先于 CSS 类选择器", () => {
    const svg = svgWrap('<style>.label { fill: blue }</style><text class="label" fill="green" x="10" y="20">Hello</text>');
    const resolved = JSON.parse(resolveStyles(svg, "text", "{}"));
    assert.strictEqual(resolved.fill, "green");
  });

  it("CSS 类选择器优先于继承", () => {
    const svg = svgWrap('<style>.child { fill: red }</style><g fill="blue"><rect class="child" width="10" height="10"/></g>');
    const resolved = JSON.parse(resolveStyles(svg, "rect", JSON.stringify({ fill: "blue" })));
    assert.strictEqual(resolved.fill, "red");
  });
});
