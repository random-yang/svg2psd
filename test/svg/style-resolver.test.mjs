import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { parseStyleAttr, getStyleValue, resolveStyles } from "../../src/svg/style-resolver.mjs";

function createElement(xml) {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${xml}</svg>`,
    "image/svg+xml"
  );
  return doc.documentElement.firstChild;
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
