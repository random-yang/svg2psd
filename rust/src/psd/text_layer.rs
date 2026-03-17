use crate::types::{LayerDescriptor, PsdLayer, PsdTextData, PsdTextStyle, PsdFont, PsdParagraphStyle, PsdStyleRun};

pub fn build_text_layer(
    desc: &LayerDescriptor,
    view_box_str: Option<&str>,
    scale: f64,
) -> Option<PsdLayer> {
    let info = desc.text_info.as_ref()?;
    if info.text.is_empty() {
        return None;
    }

    let (vb_x, vb_y) = if let Some(vb) = view_box_str {
        // Try JSON format first: {"x":50,"y":50,"w":200,"h":200}
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(vb) {
            let x = parsed.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = parsed.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            (x, y)
        } else {
            // Plain space/comma separated: "50 50 200 200"
            let parts: Vec<f64> = vb.split(|c: char| c.is_whitespace() || c == ',')
                .filter(|s| !s.is_empty())
                .filter_map(|s| s.parse().ok())
                .collect();
            (parts.first().copied().unwrap_or(0.0), parts.get(1).copied().unwrap_or(0.0))
        }
    } else {
        (0.0, 0.0)
    };

    let px = (info.x - vb_x) * scale;
    let py = (info.y - vb_y) * scale;

    let runs = &info.runs;
    let first_run = runs.first();

    let style_runs = build_style_runs(runs, scale);

    let style = if !style_runs.is_empty() {
        style_runs[0].style.clone()
    } else {
        let fr = first_run;
        PsdTextStyle {
            font: PsdFont {
                name: fr.map(|r| r.ps_name.clone()).unwrap_or_else(|| "ArialMT".to_string()),
            },
            font_size: fr.map(|r| r.font_size).unwrap_or(24.0) * scale,
            fill_color: fr.map(|r| r.fill_color.clone()).unwrap_or(crate::types::Color { r: 0, g: 0, b: 0 }),
            faux_bold: fr.map(|r| r.faux_bold).unwrap_or(false),
            tracking: fr.and_then(|r| {
                r.letter_spacing.map(|ls| (ls / r.font_size * 1000.0).round() as i32)
            }),
            auto_leading: fr.and_then(|r| r.line_height.map(|_| false)),
            leading: fr.and_then(|r| r.line_height.map(|lh| lh * scale)),
        }
    };

    let justification = justification_from_anchor(&info.text_anchor);

    let text_data = PsdTextData {
        text: info.text.clone(),
        anti_alias: "smooth".to_string(),
        transform: [1.0, 0.0, 0.0, 1.0, px, py],
        style,
        paragraph_style: PsdParagraphStyle {
            justification,
        },
        style_runs: if style_runs.len() > 1 { Some(style_runs) } else { None },
    };

    let mut layer = PsdLayer {
        name: desc.name.clone(),
        text: Some(text_data),
        top: None, left: None, bottom: None, right: None,
        opacity: None, blend_mode: None, hidden: None,
        opened: None, children: None, image_data: None,
    };

    if let Some(opacity) = desc.opacity {
        if opacity < 1.0 {
            layer.opacity = Some(opacity);
        }
    }
    if desc.hidden == Some(true) {
        layer.hidden = Some(true);
    }

    Some(layer)
}

fn build_style_runs(runs: &[crate::types::TextRun], scale: f64) -> Vec<PsdStyleRun> {
    if runs.is_empty() {
        return vec![];
    }

    runs.iter().map(|run| {
        PsdStyleRun {
            length: run.text.len(),
            style: PsdTextStyle {
                font: PsdFont { name: run.ps_name.clone() },
                font_size: run.font_size * scale,
                fill_color: run.fill_color.clone(),
                faux_bold: run.faux_bold,
                tracking: run.letter_spacing.map(|ls| (ls / run.font_size * 1000.0).round() as i32),
                auto_leading: run.line_height.map(|_| false),
                leading: run.line_height.map(|lh| lh * scale),
            },
        }
    }).collect()
}

fn justification_from_anchor(anchor: &str) -> String {
    match anchor {
        "middle" => "center".to_string(),
        "end" => "right".to_string(),
        _ => "left".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{TextInfo, TextRun, Color};

    fn make_text_desc(text: &str, x: f64, y: f64, font_family: &str, font_size: f64, runs: Vec<TextRun>) -> LayerDescriptor {
        LayerDescriptor {
            layer_type: "text".to_string(),
            name: format!("Text: {}", &text[..text.len().min(30)]),
            transform: Some([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]),
            opacity: Some(1.0),
            blend_mode: None,
            hidden: None,
            children: None,
            text_info: Some(TextInfo {
                text: text.to_string(),
                x,
                y,
                runs,
                text_anchor: "start".to_string(),
                is_box: false,
                box_bounds: None,
            }),
            element_idx: None,
        }
    }

    fn simple_run(text: &str, font_size: f64) -> TextRun {
        TextRun {
            text: text.to_string(),
            font_family: "Arial".to_string(),
            ps_name: "ArialMT".to_string(),
            font_size,
            font_weight: "normal".to_string(),
            faux_bold: false,
            fill_color: Color { r: 0, g: 0, b: 0 },
            letter_spacing: None,
            line_height: None,
        }
    }

    #[test]
    fn simple_text_layer() {
        let desc = make_text_desc("Hello", 10.0, 50.0, "Arial", 24.0, vec![simple_run("Hello", 24.0)]);
        let layer = build_text_layer(&desc, Some("0 0 200 200"), 1.0).unwrap();
        let text = layer.text.as_ref().unwrap();
        assert_eq!(text.text, "Hello");
        assert!(text.transform[4] > 0.0); // px
    }

    #[test]
    fn viewbox_offset() {
        let desc = make_text_desc("Offset", 60.0, 80.0, "Arial", 24.0, vec![simple_run("Offset", 24.0)]);
        let layer = build_text_layer(&desc, Some("50 50 200 200"), 1.0).unwrap();
        let text = layer.text.as_ref().unwrap();
        assert_eq!(text.transform[4], 10.0);
        assert_eq!(text.transform[5], 30.0);
    }

    #[test]
    fn opacity_passed() {
        let mut desc = make_text_desc("Hello", 10.0, 50.0, "Arial", 24.0, vec![simple_run("Hello", 24.0)]);
        desc.opacity = Some(0.5);
        let layer = build_text_layer(&desc, Some("0 0 200 200"), 1.0).unwrap();
        assert_eq!(layer.opacity, Some(0.5));
    }

    #[test]
    fn letter_spacing_to_tracking() {
        let mut run = simple_run("Tracked", 20.0);
        run.letter_spacing = Some(5.0);
        let desc = make_text_desc("Tracked", 10.0, 50.0, "Arial", 20.0, vec![run]);
        let layer = build_text_layer(&desc, Some("0 0 200 200"), 1.0).unwrap();
        let text = layer.text.as_ref().unwrap();
        assert_eq!(text.style.tracking, Some(250));
    }

    #[test]
    fn line_height_to_leading() {
        let mut run = simple_run("Leaded", 20.0);
        run.line_height = Some(30.0);
        let desc = make_text_desc("Leaded", 10.0, 50.0, "Arial", 20.0, vec![run]);
        let layer = build_text_layer(&desc, Some("0 0 200 200"), 1.0).unwrap();
        let text = layer.text.as_ref().unwrap();
        assert_eq!(text.style.auto_leading, Some(false));
        assert_eq!(text.style.leading, Some(30.0));
    }

    #[test]
    fn leading_scale() {
        let mut run = simple_run("Scaled", 20.0);
        run.line_height = Some(30.0);
        let desc = make_text_desc("Scaled Leading", 10.0, 50.0, "Arial", 20.0, vec![run]);
        let layer = build_text_layer(&desc, Some("0 0 200 200"), 2.0).unwrap();
        let text = layer.text.as_ref().unwrap();
        assert_eq!(text.style.leading, Some(60.0));
        assert_eq!(text.style.auto_leading, Some(false));
    }

    #[test]
    fn no_tracking_leading_when_absent() {
        let desc = make_text_desc("Plain", 10.0, 50.0, "Arial", 24.0, vec![simple_run("Plain", 24.0)]);
        let layer = build_text_layer(&desc, Some("0 0 200 200"), 1.0).unwrap();
        let text = layer.text.as_ref().unwrap();
        assert!(text.style.tracking.is_none());
        assert!(text.style.leading.is_none());
        assert!(text.style.auto_leading.is_none());
    }

    #[test]
    fn scale_font_size_and_coords() {
        let desc = make_text_desc("Scaled", 10.0, 50.0, "Arial", 24.0, vec![simple_run("Scaled", 24.0)]);
        let layer = build_text_layer(&desc, Some("0 0 200 200"), 2.0).unwrap();
        let text = layer.text.as_ref().unwrap();
        assert_eq!(text.style.font_size, 48.0);
        assert_eq!(text.transform[4], 20.0);
        assert_eq!(text.transform[5], 100.0);
    }
}
