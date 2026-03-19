use crate::types::{LayerDescriptor, PsdTextData, RenderResult, ViewBox};
use crate::psd::text_layer::build_text_layer;
use crate::psd::effects::{to_psd_blend_mode, to_psd_opacity};

/// svg2psd PsdLayer → ag-psd-rs Layer 转换
pub fn descriptor_to_agpsd_layer(
    desc: &LayerDescriptor,
    render_result: Option<&RenderResult>,
    view_box: Option<&ViewBox>,
    scale: f64,
) -> Option<ag_psd_rs::Layer> {
    if desc.hidden == Some(true) {
        return Some(ag_psd_rs::Layer {
            name: desc.name.clone(),
            hidden: true,
            visible: false,
            ..Default::default()
        });
    }

    match desc.layer_type.as_str() {
        "group" => None, // groups 由 convert_all 处理
        "text" => build_text_agpsd_layer(desc, view_box, scale),
        "graphic" => build_pixel_agpsd_layer(desc, render_result),
        _ => None,
    }
}

fn build_text_agpsd_layer(
    desc: &LayerDescriptor,
    view_box: Option<&ViewBox>,
    scale: f64,
) -> Option<ag_psd_rs::Layer> {
    let view_box_str = view_box.map(|vb| format!("{} {} {} {}", vb.x, vb.y, vb.w, vb.h));
    let psd_layer = build_text_layer(desc, view_box_str.as_deref(), scale)?;
    let text_data = psd_layer.text.as_ref()?;

    let mut layer = ag_psd_rs::Layer {
        name: psd_layer.name.clone(),
        text: Some(convert_text_data(text_data)),
        ..Default::default()
    };

    apply_layer_props(&mut layer, desc);
    Some(layer)
}

fn build_pixel_agpsd_layer(
    desc: &LayerDescriptor,
    render_result: Option<&RenderResult>,
) -> Option<ag_psd_rs::Layer> {
    let result = render_result?;

    let mut layer = ag_psd_rs::Layer {
        name: desc.name.clone(),
        top: result.top as i32,
        left: result.left as i32,
        bottom: result.bottom as i32,
        right: result.right as i32,
        image_data: Some(ag_psd_rs::ImageData {
            width: result.width,
            height: result.height,
            data: result.data.clone(),
        }),
        ..Default::default()
    };

    apply_layer_props(&mut layer, desc);
    Some(layer)
}

fn apply_layer_props(layer: &mut ag_psd_rs::Layer, desc: &LayerDescriptor) {
    let opacity_f = to_psd_opacity(desc.opacity);
    layer.opacity = (opacity_f * 255.0).round() as u8;

    let blend_str = to_psd_blend_mode(desc.blend_mode.as_deref());
    layer.blend_mode = ag_psd_rs::BlendMode::from_str(&blend_str);

    if desc.hidden == Some(true) {
        layer.hidden = true;
        layer.visible = false;
    }
}

fn convert_text_data(src: &PsdTextData) -> ag_psd_rs::TextData {
    ag_psd_rs::TextData {
        text: src.text.clone(),
        transform: src.transform,
        anti_alias: src.anti_alias.clone(),
        style: convert_text_style(&src.style),
        paragraph_style: ag_psd_rs::ParagraphStyle {
            justification: src.paragraph_style.justification.clone(),
        },
        style_runs: src.style_runs.as_ref().map(|runs| {
            runs.iter().map(|r| ag_psd_rs::StyleRun {
                length: r.length,
                style: convert_text_style(&r.style),
            }).collect()
        }),
    }
}

fn convert_text_style(src: &crate::types::PsdTextStyle) -> ag_psd_rs::TextStyle {
    ag_psd_rs::TextStyle {
        font_name: src.font.name.clone(),
        font_size: src.font_size,
        fill_color: ag_psd_rs::Color::new(
            src.fill_color.r,
            src.fill_color.g,
            src.fill_color.b,
        ),
        faux_bold: src.faux_bold,
        tracking: src.tracking,
        auto_leading: src.auto_leading,
        leading: src.leading,
    }
}

/// 构建 ag-psd-rs 的 group Layer
pub fn build_group_layer(
    desc: &LayerDescriptor,
    children: Vec<ag_psd_rs::Layer>,
) -> ag_psd_rs::Layer {
    let mut layer = ag_psd_rs::Layer {
        name: desc.name.clone(),
        opened: true,
        children: Some(children),
        ..Default::default()
    };
    apply_layer_props(&mut layer, desc);
    layer
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Color, TextInfo, TextRun};

    #[test]
    fn hidden_layer() {
        let desc = LayerDescriptor {
            layer_type: "graphic".to_string(),
            name: "hidden".to_string(),
            hidden: Some(true),
            transform: None, opacity: None, blend_mode: None,
            children: None, text_info: None, element_idx: None,
        };
        let layer = descriptor_to_agpsd_layer(&desc, None, None, 1.0).unwrap();
        assert!(layer.hidden);
        assert!(!layer.visible);
    }

    #[test]
    fn pixel_layer_from_render_result() {
        let desc = LayerDescriptor {
            layer_type: "graphic".to_string(),
            name: "rect".to_string(),
            opacity: Some(0.5),
            blend_mode: Some("multiply".to_string()),
            hidden: None, transform: None,
            children: None, text_info: None, element_idx: None,
        };
        let render = RenderResult {
            data: vec![255, 0, 0, 255],
            width: 1, height: 1,
            top: 10, left: 20, right: 21, bottom: 11,
        };
        let layer = descriptor_to_agpsd_layer(&desc, Some(&render), None, 1.0).unwrap();
        assert_eq!(layer.name, "rect");
        assert_eq!(layer.top, 10);
        assert_eq!(layer.left, 20);
        assert_eq!(layer.opacity, 128); // 0.5 * 255
        assert!(layer.image_data.is_some());
    }

    #[test]
    fn text_layer_conversion() {
        let desc = LayerDescriptor {
            layer_type: "text".to_string(),
            name: "hello".to_string(),
            text_info: Some(TextInfo {
                text: "Hello".to_string(),
                x: 10.0, y: 50.0,
                runs: vec![TextRun {
                    text: "Hello".to_string(),
                    font_family: "Arial".to_string(),
                    ps_name: "ArialMT".to_string(),
                    font_size: 24.0,
                    font_weight: "normal".to_string(),
                    faux_bold: false,
                    fill_color: Color { r: 0, g: 0, b: 0 },
                    letter_spacing: None,
                    line_height: None,
                }],
                text_anchor: "start".to_string(),
                is_box: false,
                box_bounds: None,
            }),
            transform: Some([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]),
            opacity: Some(1.0),
            blend_mode: None, hidden: None,
            children: None, element_idx: None,
        };
        let layer = descriptor_to_agpsd_layer(&desc, None, None, 1.0).unwrap();
        assert!(layer.text.is_some());
        assert_eq!(layer.text.as_ref().unwrap().text, "Hello");
    }

    #[test]
    fn group_layer_build() {
        let desc = LayerDescriptor {
            layer_type: "group".to_string(),
            name: "mygroup".to_string(),
            opacity: Some(0.8),
            blend_mode: None, hidden: None, transform: None,
            children: None, text_info: None, element_idx: None,
        };
        let layer = build_group_layer(&desc, vec![]);
        assert_eq!(layer.name, "mygroup");
        assert!(layer.opened);
        assert_eq!(layer.opacity, 204); // 0.8 * 255
    }
}
