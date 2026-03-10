import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import {
  parseStyleAttr,
  getStyleValue,
  resolveStyles,
  parseStyleSheet,
  matchSelector,
  getMatchedCssProperties,
} from "../../src/svg/style-resolver.js";

function createElement(xml: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${xml}</svg>`,
    "image/svg+xml"
  );
  return doc.documentElement.firstChild as Element;
}

function makeSvg(svgInner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${svgInner}</svg>`,
    "image/svg+xml"
  );
  return doc.documentElement;
}

describe("parseStyleAttr", () => {
  it("解析多属性", () => {
    const result = parseStyleAttr("fill:red; font-size:16px");
    assert.strictEqual(result.fill, "red");
    assert.strictEqual(result["font-size"], "16px");
  });

  it("空 style → 空对象", () => {
    assert.deepStrictEqual(parseStyleAttr(""), {});
    assert.deepStrictEqual(parseStyleAttr(null), {});
  });
});

describe("getStyleValue", () => {
  it("style 属性优先于表现属性", () => {
    const el = createElement('<rect fill="blue" style="fill:red"/>');
    assert.strictEqual(getStyleValue(el, "fill"), "red");
  });

  it("表现属性优先于 inherited", () => {
    const el = createElement('<rect fill="blue"/>');
    assert.strictEqual(getStyleValue(el, "fill", "green"), "blue");
  });

  it("style 优先于 inherited 和表现属性", () => {
    const el = createElement('<rect fill="blue" style="fill:green"/>');
    assert.strictEqual(getStyleValue(el, "fill", "red"), "green");
  });
});

describe("resolveStyles", () => {
  it("自身属性覆盖继承", () => {
    const el = createElement('<rect fill="red" font-weight="bold"/>');
    const resolved = resolveStyles(el, { "font-weight": "normal", "fill": "blue" });
    assert.strictEqual(resolved.fill, "red");
    assert.strictEqual(resolved["font-weight"], "bold");
  });

  it("style 属性最高优先级", () => {
    const el = createElement('<rect fill="blue" style="fill:green"/>');
    const resolved = resolveStyles(el, { fill: "red" });
    assert.strictEqual(resolved.fill, "green");
  });

  it("mix-blend-mode 从 style 中解析", () => {
    const el = createElement('<rect style="mix-blend-mode: multiply"/>');
    const resolved = resolveStyles(el);
    assert.strictEqual(resolved["mix-blend-mode"], "multiply");
  });
});

describe("parseStyleSheet", () => {
  it("解析单个 <style> 块", () => {
    const svg = makeSvg('<style>.cls-1 { fill: red; font-size: 16px }</style>');
    const rules = parseStyleSheet(svg);
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].selector, ".cls-1");
    assert.strictEqual(rules[0].properties.fill, "red");
    assert.strictEqual(rules[0].properties["font-size"], "16px");
  });

  it("解析多个规则", () => {
    const svg = makeSvg('<style>.a { fill: red } .b { fill: blue } #c { font-weight: bold }</style>');
    const rules = parseStyleSheet(svg);
    assert.strictEqual(rules.length, 3);
  });

  it("解析逗号分隔的选择器组", () => {
    const svg = makeSvg('<style>.a, .b { fill: red }</style>');
    const rules = parseStyleSheet(svg);
    assert.strictEqual(rules.length, 2);
    assert.strictEqual(rules[0].selector, ".a");
    assert.strictEqual(rules[1].selector, ".b");
    assert.strictEqual(rules[0].properties.fill, "red");
    assert.strictEqual(rules[1].properties.fill, "red");
  });

  it("忽略 CSS 注释", () => {
    const svg = makeSvg('<style>/* comment */ .a { fill: red } /* another */</style>');
    const rules = parseStyleSheet(svg);
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].properties.fill, "red");
  });

  it("无 <style> → 空数组", () => {
    const svg = makeSvg('<rect width="10" height="10"/>');
    const rules = parseStyleSheet(svg);
    assert.strictEqual(rules.length, 0);
  });

  it("多个 <style> 元素合并", () => {
    const svg = makeSvg('<style>.a { fill: red }</style><style>.b { fill: blue }</style>');
    const rules = parseStyleSheet(svg);
    assert.strictEqual(rules.length, 2);
  });
});

describe("matchSelector", () => {
  it("匹配类选择器 .cls-1", () => {
    const el = createElement('<rect class="cls-1" width="10" height="10"/>');
    assert.ok(matchSelector(el, ".cls-1"));
    assert.ok(!matchSelector(el, ".cls-2"));
  });

  it("匹配 ID 选择器 #myRect", () => {
    const el = createElement('<rect id="myRect" width="10" height="10"/>');
    assert.ok(matchSelector(el, "#myRect"));
    assert.ok(!matchSelector(el, "#other"));
  });

  it("匹配标签选择器 rect", () => {
    const el = createElement('<rect width="10" height="10"/>');
    assert.ok(matchSelector(el, "rect"));
    assert.ok(!matchSelector(el, "circle"));
  });

  it("匹配组合选择器 rect.cls-1", () => {
    const el = createElement('<rect class="cls-1" width="10" height="10"/>');
    assert.ok(matchSelector(el, "rect.cls-1"));
    assert.ok(!matchSelector(el, "circle.cls-1"));
  });

  it("匹配多类选择器 .a.b", () => {
    const el = createElement('<rect class="a b" width="10" height="10"/>');
    assert.ok(matchSelector(el, ".a.b"));
    assert.ok(matchSelector(el, ".a"));
    assert.ok(matchSelector(el, ".b"));
    assert.ok(!matchSelector(el, ".a.c"));
  });

  it("匹配后代选择器 g rect", () => {
    const svg = makeSvg('<g><rect class="inner" width="10" height="10"/></g>');
    const rect = svg.getElementsByTagName("rect")[0];
    assert.ok(matchSelector(rect, "g rect"));
    assert.ok(matchSelector(rect, "svg rect"));
    assert.ok(!matchSelector(rect, "circle rect"));
  });

  it("匹配子选择器 g > rect", () => {
    const svg = makeSvg('<g><rect class="inner" width="10" height="10"/></g>');
    const rect = svg.getElementsByTagName("rect")[0];
    assert.ok(matchSelector(rect, "g > rect"));
    // svg > g > rect, 不是 svg > rect
    assert.ok(!matchSelector(rect, "svg > rect"));
  });
});

describe("getMatchedCssProperties", () => {
  it("匹配类选择器并返回属性", () => {
    const svg = makeSvg('<style>.red { fill: red }</style><rect class="red" width="10" height="10"/>');
    const rules = parseStyleSheet(svg);
    const rect = svg.getElementsByTagName("rect")[0];
    const props = getMatchedCssProperties(rect, rules);
    assert.strictEqual(props.fill, "red");
  });

  it("高 specificity 覆盖低 specificity", () => {
    const svg = makeSvg('<style>rect { fill: blue } .red { fill: red }</style><rect class="red" width="10" height="10"/>');
    const rules = parseStyleSheet(svg);
    const rect = svg.getElementsByTagName("rect")[0];
    const props = getMatchedCssProperties(rect, rules);
    assert.strictEqual(props.fill, "red"); // .red (10) > rect (1)
  });

  it("不匹配的选择器不返回", () => {
    const svg = makeSvg('<style>.blue { fill: blue }</style><rect class="red" width="10" height="10"/>');
    const rules = parseStyleSheet(svg);
    const rect = svg.getElementsByTagName("rect")[0];
    const props = getMatchedCssProperties(rect, rules);
    assert.strictEqual(props.fill, undefined);
  });
});

describe("resolveStyles with stylesheet", () => {
  it("CSS 类选择器样式被应用", () => {
    const svg = makeSvg('<style>.label { font-size: 20px; fill: blue }</style><text class="label" x="10" y="20">Hello</text>');
    const rules = parseStyleSheet(svg);
    const text = svg.getElementsByTagName("text")[0];
    const styles = resolveStyles(text, {}, rules);
    assert.strictEqual(styles["font-size"], "20px");
    assert.strictEqual(styles.fill, "blue");
  });

  it("inline style 优先于 CSS 类选择器", () => {
    const svg = makeSvg('<style>.label { fill: blue }</style><text class="label" style="fill: red" x="10" y="20">Hello</text>');
    const rules = parseStyleSheet(svg);
    const text = svg.getElementsByTagName("text")[0];
    const styles = resolveStyles(text, {}, rules);
    assert.strictEqual(styles.fill, "red");
  });

  it("表现属性优先于 CSS 类选择器", () => {
    const svg = makeSvg('<style>.label { fill: blue }</style><text class="label" fill="green" x="10" y="20">Hello</text>');
    const rules = parseStyleSheet(svg);
    const text = svg.getElementsByTagName("text")[0];
    const styles = resolveStyles(text, {}, rules);
    assert.strictEqual(styles.fill, "green");
  });

  it("CSS 类选择器优先于继承", () => {
    const svg = makeSvg('<style>.child { fill: red }</style><g fill="blue"><rect class="child" width="10" height="10"/></g>');
    const rules = parseStyleSheet(svg);
    const rect = svg.getElementsByTagName("rect")[0];
    const styles = resolveStyles(rect, { fill: "blue" }, rules);
    assert.strictEqual(styles.fill, "red");
  });
});
