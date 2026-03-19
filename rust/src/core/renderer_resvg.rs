use super::renderer_core;
use crate::types::RenderResult;

/// 用 resvg 渲染 SVG 字符串为 RGBA 像素，然后裁剪透明边缘。
/// 利用 usvg bounding box 优化：只分配覆盖实际内容的 pixmap，避免大画布小元素的内存浪费。
pub fn render_svg_to_pixels(
    svg_str: &str,
    width: f64,
    _height: f64,
    scale: f64,
) -> Option<RenderResult> {
    let fit_width = (width * scale).round() as u32;
    if fit_width == 0 {
        return None;
    }

    let opt = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_str(svg_str, &opt).ok()?;

    let svg_size = tree.size();
    if svg_size.width() <= 0.0 || svg_size.height() <= 0.0 {
        return None;
    }

    let zoom = fit_width as f32 / svg_size.width();
    let full_h = (svg_size.height() * zoom).round() as u32;

    // 用 usvg bounding box 确定内容区域，只渲染该区域
    let bbox = tree.root().abs_stroke_bounding_box();
    let bbox_w = bbox.width();
    let bbox_h = bbox.height();
    if bbox_w <= 0.0 || bbox_h <= 0.0 {
        return None;
    }

    // 缩放到像素坐标，留 2px margin 保抗锯齿
    let margin: f32 = 2.0;
    let px_left = ((bbox.left() * zoom) - margin).max(0.0).floor() as u32;
    let px_top = ((bbox.top() * zoom) - margin).max(0.0).floor() as u32;
    let px_right = ((bbox.right() * zoom) + margin).ceil().min(fit_width as f32) as u32;
    let px_bottom = ((bbox.bottom() * zoom) + margin).ceil().min(full_h as f32) as u32;

    let crop_w = px_right.saturating_sub(px_left);
    let crop_h = px_bottom.saturating_sub(px_top);
    if crop_w == 0 || crop_h == 0 {
        return None;
    }

    let mut pixmap = resvg::tiny_skia::Pixmap::new(crop_w, crop_h)?;

    // offset 使内容 bbox 左上角对齐 pixmap 原点
    let tx = -(px_left as f32) / zoom;
    let ty = -(px_top as f32) / zoom;
    let transform = resvg::tiny_skia::Transform::from_scale(zoom, zoom)
        .pre_translate(tx, ty);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    // premultiplied → straight alpha
    let pixels = demultiply_alpha(pixmap.data());

    // 在裁剪后的小 pixmap 中进一步紧缩到非透明边界
    let tight = renderer_core::compute_tight_bbox(&pixels, crop_w, crop_h)?;
    let tw = tight.right - tight.left;
    let th = tight.bottom - tight.top;
    let mut cropped = vec![0u8; (tw * th * 4) as usize];
    for y in 0..th {
        let src = (((tight.top + y) * crop_w + tight.left) * 4) as usize;
        let dst = (y * tw * 4) as usize;
        let len = (tw * 4) as usize;
        cropped[dst..dst + len].copy_from_slice(&pixels[src..src + len]);
    }

    Some(RenderResult {
        data: cropped,
        width: tw,
        height: th,
        top: px_top + tight.top,
        left: px_left + tight.left,
        right: px_left + tight.right,
        bottom: px_top + tight.bottom,
    })
}

/// 将 premultiplied RGBA 转为 straight RGBA
fn demultiply_alpha(data: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; data.len()];
    for i in (0..data.len()).step_by(4) {
        let a = data[i + 3] as f32;
        if a > 0.0 {
            let inv = 255.0 / a;
            out[i] = (data[i] as f32 * inv).round().min(255.0) as u8;
            out[i + 1] = (data[i + 1] as f32 * inv).round().min(255.0) as u8;
            out[i + 2] = (data[i + 2] as f32 * inv).round().min(255.0) as u8;
            out[i + 3] = data[i + 3];
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_simple_rect() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <rect x="10" y="10" width="80" height="80" fill="red"/>
        </svg>"#;
        let result = render_svg_to_pixels(svg, 100.0, 100.0, 1.0);
        assert!(result.is_some());
        let r = result.unwrap();
        assert!(r.width > 0);
        assert!(r.height > 0);
        assert!(!r.data.is_empty());
    }

    #[test]
    fn render_empty_svg_returns_none() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>"#;
        let result = render_svg_to_pixels(svg, 100.0, 100.0, 1.0);
        assert!(result.is_none());
    }

    #[test]
    fn render_with_scale() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <rect width="100" height="100" fill="blue"/>
        </svg>"#;
        let result = render_svg_to_pixels(svg, 100.0, 100.0, 2.0).unwrap();
        assert!(result.width <= 200);
        assert!(result.height <= 200);
    }

    #[test]
    fn render_small_element_in_large_canvas() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">
            <rect x="10" y="10" width="20" height="20" fill="red"/>
        </svg>"#;
        let result = render_svg_to_pixels(svg, 2000.0, 2000.0, 1.0);
        assert!(result.is_some());
        let r = result.unwrap();
        assert!(r.width <= 24);
        assert!(r.height <= 24);
        assert!(r.left >= 8);
        assert!(r.top >= 8);
    }

    #[test]
    fn demultiply_alpha_correct() {
        let input = vec![128, 0, 0, 128];
        let output = demultiply_alpha(&input);
        assert_eq!(output[0], 255);
        assert_eq!(output[1], 0);
        assert_eq!(output[2], 0);
        assert_eq!(output[3], 128);
    }

    #[test]
    fn demultiply_alpha_zero() {
        let input = vec![0, 0, 0, 0];
        let output = demultiply_alpha(&input);
        assert_eq!(output, vec![0, 0, 0, 0]);
    }
}
