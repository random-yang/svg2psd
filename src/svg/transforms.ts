import type { Matrix } from "../types.js";

export function identity(): Matrix {
  return [1, 0, 0, 1, 0, 0];
}

export function multiply(A: Matrix, B: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = A;
  const [a2, b2, c2, d2, e2, f2] = B;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function transformPoint(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  };
}

export function parseTransform(str: string | null): Matrix {
  if (!str || !str.trim()) return identity();

  const transforms: { fn: string; args: number[] }[] = [];
  const re = /(matrix|translate|rotate|scale|skewX|skewY)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = re.exec(str)) !== null) {
    const fn = match[1].toLowerCase();
    const args = match[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    transforms.push({ fn, args });
  }

  let result = identity();
  for (const { fn, args } of transforms) {
    result = multiply(result, buildMatrix(fn, args));
  }
  return result;
}

function buildMatrix(fn: string, args: number[]): Matrix {
  switch (fn) {
    case "matrix":
      return args.length >= 6 ? (args.slice(0, 6) as Matrix) : identity();

    case "translate": {
      const tx = args[0] || 0;
      const ty = args[1] || 0;
      return [1, 0, 0, 1, tx, ty];
    }

    case "scale": {
      const sx = args[0] ?? 1;
      const sy = args[1] ?? sx;
      return [sx, 0, 0, sy, 0, 0];
    }

    case "rotate": {
      const angle = ((args[0] || 0) * Math.PI) / 180;
      const cx = args[1] || 0;
      const cy = args[2] || 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      if (cx === 0 && cy === 0) {
        return [cos, sin, -sin, cos, 0, 0];
      }
      return [
        cos,
        sin,
        -sin,
        cos,
        cx * (1 - cos) + cy * sin,
        cy * (1 - cos) - cx * sin,
      ];
    }

    case "skewx": {
      const angle = ((args[0] || 0) * Math.PI) / 180;
      return [1, 0, Math.tan(angle), 1, 0, 0];
    }

    case "skewy": {
      const angle = ((args[0] || 0) * Math.PI) / 180;
      return [1, Math.tan(angle), 0, 1, 0, 0];
    }

    default:
      return identity();
  }
}

export function getTranslation(matrix: Matrix): { tx: number; ty: number } {
  return { tx: matrix[4], ty: matrix[5] };
}
