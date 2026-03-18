use crate::types::Matrix;

pub fn identity() -> Matrix {
    [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
}

pub fn multiply(a: &Matrix, b: &Matrix) -> Matrix {
    let [a1, b1, c1, d1, e1, f1] = *a;
    let [a2, b2, c2, d2, e2, f2] = *b;
    [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    ]
}

pub fn transform_point(matrix: &Matrix, x: f64, y: f64) -> (f64, f64) {
    let [a, b, c, d, e, f] = *matrix;
    (a * x + c * y + e, b * x + d * y + f)
}

pub fn parse_transform(s: Option<&str>) -> Matrix {
    let s = match s {
        None => return identity(),
        Some(s) if s.trim().is_empty() => return identity(),
        Some(s) => s,
    };

    use std::sync::LazyLock;
    static RE: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?i)(matrix|translate|rotate|scale|skewX|skewY)\s*\(([^)]*)\)").unwrap()
    });
    let re = &*RE;
    let mut result = identity();

    for caps in re.captures_iter(s) {
        let func = caps[1].to_lowercase();
        let args: Vec<f64> = caps[2]
            .split(|c: char| c == ',' || c.is_whitespace())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse().ok())
            .collect();
        result = multiply(&result, &build_matrix(&func, &args));
    }

    result
}

fn build_matrix(func: &str, args: &[f64]) -> Matrix {
    match func {
        "matrix" => {
            if args.len() >= 6 {
                [args[0], args[1], args[2], args[3], args[4], args[5]]
            } else {
                identity()
            }
        }
        "translate" => {
            let tx = args.first().copied().unwrap_or(0.0);
            let ty = args.get(1).copied().unwrap_or(0.0);
            [1.0, 0.0, 0.0, 1.0, tx, ty]
        }
        "scale" => {
            let sx = args.first().copied().unwrap_or(1.0);
            let sy = args.get(1).copied().unwrap_or(sx);
            [sx, 0.0, 0.0, sy, 0.0, 0.0]
        }
        "rotate" => {
            let angle = (args.first().copied().unwrap_or(0.0)) * std::f64::consts::PI / 180.0;
            let cx = args.get(1).copied().unwrap_or(0.0);
            let cy = args.get(2).copied().unwrap_or(0.0);
            let cos = angle.cos();
            let sin = angle.sin();
            if cx == 0.0 && cy == 0.0 {
                [cos, sin, -sin, cos, 0.0, 0.0]
            } else {
                [
                    cos,
                    sin,
                    -sin,
                    cos,
                    cx * (1.0 - cos) + cy * sin,
                    cy * (1.0 - cos) - cx * sin,
                ]
            }
        }
        "skewx" => {
            let angle = (args.first().copied().unwrap_or(0.0)) * std::f64::consts::PI / 180.0;
            [1.0, 0.0, angle.tan(), 1.0, 0.0, 0.0]
        }
        "skewy" => {
            let angle = (args.first().copied().unwrap_or(0.0)) * std::f64::consts::PI / 180.0;
            [1.0, angle.tan(), 0.0, 1.0, 0.0, 0.0]
        }
        _ => identity(),
    }
}

pub fn get_translation(matrix: &Matrix) -> (f64, f64) {
    (matrix[4], matrix[5])
}

pub fn is_identity(m: &Matrix) -> bool {
    m[0] == 1.0 && m[1] == 0.0 && m[2] == 0.0 && m[3] == 1.0 && m[4] == 0.0 && m[5] == 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    const EPSILON: f64 = 1e-10;

    fn assert_matrix_close(actual: &Matrix, expected: &Matrix) {
        for i in 0..6 {
            assert!((actual[i] - expected[i]).abs() < EPSILON,
                "index {}: {} ≈ {}", i, actual[i], expected[i]);
        }
    }

    #[test]
    fn test_identity() {
        assert_eq!(identity(), [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    }

    #[test]
    fn test_translate() {
        assert_eq!(parse_transform(Some("translate(10, 20)")), [1.0, 0.0, 0.0, 1.0, 10.0, 20.0]);
    }

    #[test]
    fn test_scale_uniform() {
        assert_eq!(parse_transform(Some("scale(2)")), [2.0, 0.0, 0.0, 2.0, 0.0, 0.0]);
    }

    #[test]
    fn test_scale_non_uniform() {
        assert_eq!(parse_transform(Some("scale(2, 3)")), [2.0, 0.0, 0.0, 3.0, 0.0, 0.0]);
    }

    #[test]
    fn test_rotate_90() {
        let m = parse_transform(Some("rotate(90)"));
        let a = std::f64::consts::PI / 2.0;
        assert_matrix_close(&m, &[a.cos(), a.sin(), -a.sin(), a.cos(), 0.0, 0.0]);
    }

    #[test]
    fn test_rotate_with_center() {
        let m = parse_transform(Some("rotate(45, 100, 100)"));
        let angle = 45.0 * std::f64::consts::PI / 180.0;
        let cos = angle.cos();
        let sin = angle.sin();
        let expected = [cos, sin, -sin, cos, 100.0*(1.0-cos)+100.0*sin, 100.0*(1.0-cos)-100.0*sin];
        assert_matrix_close(&m, &expected);
    }

    #[test]
    fn test_skew_x() {
        let m = parse_transform(Some("skewX(45)"));
        let a = std::f64::consts::PI / 4.0;
        assert_matrix_close(&m, &[1.0, 0.0, a.tan(), 1.0, 0.0, 0.0]);
    }

    #[test]
    fn test_skew_y() {
        let m = parse_transform(Some("skewY(30)"));
        let a = std::f64::consts::PI / 6.0;
        assert_matrix_close(&m, &[1.0, a.tan(), 0.0, 1.0, 0.0, 0.0]);
    }

    #[test]
    fn test_matrix_direct() {
        assert_eq!(parse_transform(Some("matrix(1,0,0,1,50,60)")), [1.0, 0.0, 0.0, 1.0, 50.0, 60.0]);
    }

    #[test]
    fn test_chain() {
        let m = parse_transform(Some("translate(10,20) scale(2)"));
        assert_matrix_close(&m, &[2.0, 0.0, 0.0, 2.0, 10.0, 20.0]);
    }

    #[test]
    fn test_empty() {
        assert_eq!(parse_transform(Some("")), identity());
    }

    #[test]
    fn test_none() {
        assert_eq!(parse_transform(None), identity());
    }

    #[test]
    fn test_multiply_identity() {
        let a = [2.0, 0.0, 0.0, 3.0, 10.0, 20.0];
        assert_eq!(multiply(&identity(), &a), a);
        assert_eq!(multiply(&a, &identity()), a);
    }

    #[test]
    fn test_transform_point_translate() {
        let m = parse_transform(Some("translate(10, 20)"));
        let (x, y) = transform_point(&m, 5.0, 5.0);
        assert_eq!(x, 15.0);
        assert_eq!(y, 25.0);
    }

    #[test]
    fn test_transform_point_scale() {
        let m = parse_transform(Some("scale(2)"));
        let (x, y) = transform_point(&m, 10.0, 20.0);
        assert_eq!(x, 20.0);
        assert_eq!(y, 40.0);
    }

    #[test]
    fn test_get_translation() {
        let m = [1.0, 0.0, 0.0, 1.0, 42.0, 99.0];
        assert_eq!(get_translation(&m), (42.0, 99.0));
    }
}
