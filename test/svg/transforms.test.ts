import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { identity, parseTransform, multiply, transformPoint, getTranslation } from "../../src/svg/transforms.js";
import type { Matrix } from "../../src/types.js";

const EPSILON = 1e-10;

function assertMatrixClose(actual: Matrix, expected: Matrix, msg?: string): void {
  assert.strictEqual(actual.length, expected.length, msg);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) < EPSILON,
      `${msg || ""} index ${i}: ${actual[i]} ≈ ${expected[i]}`
    );
  }
}

describe("identity", () => {
  it("返回单位矩阵", () => {
    assert.deepStrictEqual(identity(), [1, 0, 0, 1, 0, 0]);
  });
});

describe("parseTransform", () => {
  it("translate(10, 20)", () => {
    assert.deepStrictEqual(parseTransform("translate(10, 20)"), [1, 0, 0, 1, 10, 20]);
  });

  it("scale(2)", () => {
    assert.deepStrictEqual(parseTransform("scale(2)"), [2, 0, 0, 2, 0, 0]);
  });

  it("scale(2, 3)", () => {
    assert.deepStrictEqual(parseTransform("scale(2, 3)"), [2, 0, 0, 3, 0, 0]);
  });

  it("rotate(90) → cos/sin 验证", () => {
    const m = parseTransform("rotate(90)");
    assertMatrixClose(m, [Math.cos(Math.PI/2), Math.sin(Math.PI/2), -Math.sin(Math.PI/2), Math.cos(Math.PI/2), 0, 0] as Matrix);
  });

  it("rotate(45, 100, 100) 带中心点旋转", () => {
    const m = parseTransform("rotate(45, 100, 100)");
    const angle = 45 * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const expected: Matrix = [cos, sin, -sin, cos, 100*(1-cos)+100*sin, 100*(1-cos)-100*sin];
    assertMatrixClose(m, expected);
  });

  it("skewX(45)", () => {
    const m = parseTransform("skewX(45)");
    assertMatrixClose(m, [1, 0, Math.tan(Math.PI/4), 1, 0, 0] as Matrix);
  });

  it("skewY(30)", () => {
    const m = parseTransform("skewY(30)");
    assertMatrixClose(m, [1, Math.tan(Math.PI/6), 0, 1, 0, 0] as Matrix);
  });

  it("matrix(1,0,0,1,50,60)", () => {
    assert.deepStrictEqual(parseTransform("matrix(1,0,0,1,50,60)"), [1, 0, 0, 1, 50, 60]);
  });

  it("链式: translate(10,20) scale(2)", () => {
    const m = parseTransform("translate(10,20) scale(2)");
    assertMatrixClose(m, [2, 0, 0, 2, 10, 20] as Matrix);
  });

  it("空字符串 → identity", () => {
    assert.deepStrictEqual(parseTransform(""), [1, 0, 0, 1, 0, 0]);
  });

  it("null → identity", () => {
    assert.deepStrictEqual(parseTransform(null), [1, 0, 0, 1, 0, 0]);
  });
});

describe("multiply", () => {
  it("identity * A = A", () => {
    const A: Matrix = [2, 0, 0, 3, 10, 20];
    assert.deepStrictEqual(multiply(identity(), A), A);
  });

  it("A * identity = A", () => {
    const A: Matrix = [2, 0, 0, 3, 10, 20];
    assert.deepStrictEqual(multiply(A, identity()), A);
  });
});

describe("transformPoint", () => {
  it("translate 后坐标偏移", () => {
    const m = parseTransform("translate(10, 20)");
    const p = transformPoint(m, 5, 5);
    assert.strictEqual(p.x, 15);
    assert.strictEqual(p.y, 25);
  });

  it("scale(2) 后坐标加倍", () => {
    const m = parseTransform("scale(2)");
    const p = transformPoint(m, 10, 20);
    assert.strictEqual(p.x, 20);
    assert.strictEqual(p.y, 40);
  });
});

describe("getTranslation", () => {
  it("提取 tx/ty", () => {
    const m: Matrix = [1, 0, 0, 1, 42, 99];
    assert.deepStrictEqual(getTranslation(m), { tx: 42, ty: 99 });
  });
});
