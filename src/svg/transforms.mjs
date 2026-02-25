/**
 * SVG transform 完整解析模块
 * 支持 matrix, translate, rotate, scale, skewX, skewY 及链式组合
 *
 * 矩阵格式 [a, b, c, d, e, f] 对应：
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 */

/** 单位矩阵 */
export function identity() {
  return [1, 0, 0, 1, 0, 0];
}

/** 矩阵乘法 A * B */
export function multiply(A, B) {
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

/** 用矩阵变换一个点 */
export function transformPoint(matrix, x, y) {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  };
}

/**
 * 解析 SVG transform 属性字符串，返回组合矩阵
 * 支持: matrix, translate, rotate, scale, skewX, skewY
 * 链式 transform 从左到右依次左乘
 */
export function parseTransform(str) {
  if (!str || !str.trim()) return identity();

  const transforms = [];
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

function buildMatrix(fn, args) {
  switch (fn) {
    case "matrix":
      return args.length >= 6 ? args.slice(0, 6) : identity();

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
      // rotate(angle, cx, cy) = translate(cx,cy) * rotate(angle) * translate(-cx,-cy)
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

/**
 * 从变换矩阵中提取平移分量
 */
export function getTranslation(matrix) {
  return { tx: matrix[4], ty: matrix[5] };
}
