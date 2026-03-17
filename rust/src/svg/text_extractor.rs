use crate::types::{Matrix, ViewBox, TextInfo, TextRun, BoxBounds};
use crate::svg::transforms::get_translation;
use crate::svg::style_resolver::{resolve_styles, CssRule};
use crate::utils::color::parse_color;
use crate::utils::font::{clean_font_family, to_postscript_name, is_bold_weight};
use std::collections::HashMap;

pub fn extract_text_info(
    doc: &roxmltree::Document,
    node_id: u32,
    transform: &Matrix,
    view_box: Option<&ViewBox>,
    svg_root_id: Option<u32>,
) -> Option<TextInfo> {
    let node = doc.get_node(roxmltree::NodeId::new(node_id))?;
    let stylesheet = if let Some(root_id) = svg_root_id {
        if let Some(root_node) = doc.get_node(roxmltree::NodeId::new(root_id)) {
            parse_style_sheet_from_node(root_node)
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    let tag = node.tag_name().name();
    match tag {
        "text" => extract_from_text(node, transform, view_box, &stylesheet),
        "foreignObject" => extract_from_foreign_object(node, transform, view_box, &stylesheet),
        _ => None,
    }
}

/// Version that takes a roxmltree::Node directly (used internally)
pub fn extract_text_info_from_node(
    node: roxmltree::Node,
    transform: &Matrix,
    view_box: Option<&ViewBox>,
    stylesheet: &[CssRule],
) -> Option<TextInfo> {
    let tag = node.tag_name().name();
    match tag {
        "text" => extract_from_text(node, transform, view_box, stylesheet),
        "foreignObject" => extract_from_foreign_object(node, transform, view_box, stylesheet),
        _ => None,
    }
}

fn extract_from_text(
    text_el: roxmltree::Node,
    transform: &Matrix,
    _view_box: Option<&ViewBox>,
    stylesheet: &[CssRule],
) -> Option<TextInfo> {
    let x: f64 = text_el.attribute("x").and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let y: f64 = text_el.attribute("y").and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let styles = resolve_styles(text_el, &HashMap::new(), stylesheet);

    let tspans: Vec<_> = text_el.children()
        .filter(|c| c.is_element() && c.tag_name().name() == "tspan")
        .collect();

    let runs = if !tspans.is_empty() {
        tspans.iter()
            .map(|tspan| extract_run_from_tspan(*tspan, &styles, stylesheet))
            .collect()
    } else {
        let text = get_all_text(text_el).trim().to_string();
        if text.is_empty() {
            return None;
        }
        vec![build_run(&text, &styles)]
    };

    let runs: Vec<TextRun> = runs.into_iter().filter(|r| !r.text.is_empty()).collect();
    if runs.is_empty() {
        return None;
    }

    let full_text: String = runs.iter().map(|r| r.text.as_str()).collect();
    let text_anchor = styles.get("text-anchor").cloned().unwrap_or_else(|| "start".to_string());
    let (tx, ty) = get_translation(transform);

    Some(TextInfo {
        text: full_text,
        x: x + tx,
        y: y + ty,
        runs,
        text_anchor,
        is_box: false,
        box_bounds: None,
    })
}

fn extract_run_from_tspan(tspan: roxmltree::Node, parent_styles: &HashMap<String, String>, stylesheet: &[CssRule]) -> TextRun {
    let text = get_all_text(tspan).trim().to_string();
    let styles = resolve_styles(tspan, parent_styles, stylesheet);
    build_run(&text, &styles)
}

fn build_run(text: &str, styles: &HashMap<String, String>) -> TextRun {
    let font_family = clean_font_family(styles.get("font-family").map(|s| s.as_str()));
    let font_weight = styles.get("font-weight").cloned().unwrap_or_else(|| "normal".to_string());
    let font_size: f64 = styles.get("font-size")
        .and_then(|s| s.replace("px", "").trim().parse().ok())
        .unwrap_or(24.0);
    let fill = styles.get("fill")
        .or_else(|| styles.get("color"))
        .map(|s| s.as_str())
        .unwrap_or("#000000");
    let letter_spacing = parse_spacing(styles.get("letter-spacing").map(|s| s.as_str()));
    let line_height = parse_line_height(styles.get("line-height").map(|s| s.as_str()), Some(font_size));

    TextRun {
        text: text.to_string(),
        font_family: font_family.clone(),
        ps_name: to_postscript_name(&font_family, &font_weight),
        font_size,
        font_weight: font_weight.clone(),
        faux_bold: is_bold_weight(Some(&font_weight)),
        fill_color: parse_color(Some(fill)),
        letter_spacing,
        line_height,
    }
}

fn extract_from_foreign_object(
    fo_el: roxmltree::Node,
    transform: &Matrix,
    _view_box: Option<&ViewBox>,
    stylesheet: &[CssRule],
) -> Option<TextInfo> {
    let raw = get_all_text_foreign(fo_el);
    let raw = raw.trim().to_string();
    if raw.is_empty() {
        return None;
    }

    let fo_x: f64 = fo_el.attribute("x").and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let fo_y: f64 = fo_el.attribute("y").and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let fo_w: f64 = fo_el.attribute("width").and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let fo_h: f64 = fo_el.attribute("height").and_then(|v| v.parse().ok()).unwrap_or(0.0);

    let (tx, ty) = get_translation(transform);

    let style_info = extract_foreign_object_style(fo_el, stylesheet);
    let font_family = style_info.font_family.unwrap_or_else(|| "Inter".to_string());
    let font_weight = style_info.font_weight.unwrap_or_else(|| "normal".to_string());
    let font_size = style_info.font_size.unwrap_or(24.0);
    let fill = style_info.color.unwrap_or_else(|| "#000000".to_string());

    let run = TextRun {
        text: raw.clone(),
        font_family: font_family.clone(),
        ps_name: to_postscript_name(&font_family, &font_weight),
        font_size,
        font_weight: font_weight.clone(),
        faux_bold: is_bold_weight(Some(&font_weight)),
        fill_color: parse_color(Some(&fill)),
        letter_spacing: style_info.letter_spacing,
        line_height: style_info.line_height,
    };

    Some(TextInfo {
        text: raw,
        x: fo_x + tx,
        y: fo_y + ty + font_size,
        runs: vec![run],
        text_anchor: "start".to_string(),
        is_box: true,
        box_bounds: Some(BoxBounds {
            x: fo_x + tx,
            y: fo_y + ty,
            width: if fo_w != 0.0 { fo_w } else { 200.0 },
            height: if fo_h != 0.0 { fo_h } else { font_size * 2.0 },
        }),
    })
}

struct ForeignObjectStyleInfo {
    font_family: Option<String>,
    font_size: Option<f64>,
    font_weight: Option<String>,
    color: Option<String>,
    letter_spacing: Option<f64>,
    line_height: Option<f64>,
}

fn extract_foreign_object_style(fo_el: roxmltree::Node, stylesheet: &[CssRule]) -> ForeignObjectStyleInfo {
    let mut result = ForeignObjectStyleInfo {
        font_family: None,
        font_size: None,
        font_weight: None,
        color: None,
        letter_spacing: None,
        line_height: None,
    };

    walk_elements(fo_el, &mut |el| {
        let css_styles = resolve_styles(el, &HashMap::new(), stylesheet);
        if let Some(ff) = css_styles.get("font-family") {
            result.font_family = Some(clean_font_family(Some(ff)));
        }
        if let Some(fs) = css_styles.get("font-size") {
            if let Ok(v) = fs.replace("px", "").trim().parse::<f64>() {
                result.font_size = Some(v);
            }
        }
        if let Some(fw) = css_styles.get("font-weight") {
            result.font_weight = Some(fw.clone());
        }
        if let Some(c) = css_styles.get("color") {
            result.color = Some(c.clone());
        }
        let ls = parse_spacing(css_styles.get("letter-spacing").map(|s| s.as_str()));
        if ls.is_some() {
            result.letter_spacing = ls;
        }
        let lh = parse_line_height(css_styles.get("line-height").map(|s| s.as_str()), result.font_size);
        if lh.is_some() {
            result.line_height = lh;
        }
    });

    result
}

fn parse_spacing(val: Option<&str>) -> Option<f64> {
    match val {
        None | Some("normal") => None,
        Some(v) => {
            let n: f64 = v.replace("px", "").trim().parse().ok()?;
            if n.is_finite() { Some(n) } else { None }
        }
    }
}

fn parse_line_height(val: Option<&str>, font_size: Option<f64>) -> Option<f64> {
    match val {
        None | Some("normal") => None,
        Some(v) => {
            let n: f64 = v.replace("px", "").trim().parse().ok()?;
            if !n.is_finite() { return None; }
            if v.contains("px") {
                Some(n)
            } else {
                font_size.map(|fs| n * fs)
            }
        }
    }
}

fn walk_elements(node: roxmltree::Node, f: &mut dyn FnMut(roxmltree::Node)) {
    if node.is_element() {
        f(node);
    }
    for child in node.children() {
        walk_elements(child, f);
    }
}

fn get_all_text(el: roxmltree::Node) -> String {
    let mut text = String::new();
    for child in el.children() {
        if child.is_text() {
            text.push_str(child.text().unwrap_or(""));
        } else if child.is_element() {
            text.push_str(&get_all_text(child));
        }
    }
    text
}

static BLOCK_TAGS: &[&str] = &["p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "tr"];

fn get_all_text_foreign(el: roxmltree::Node) -> String {
    let mut text = String::new();
    for child in el.children() {
        if child.is_text() {
            text.push_str(child.text().unwrap_or(""));
        } else if child.is_element() {
            let tag = child.tag_name().name();
            if tag == "br" {
                text.push('\r');
            } else if BLOCK_TAGS.contains(&tag) {
                if !text.is_empty() {
                    text = text.trim_end().to_string();
                    if !text.ends_with('\r') {
                        text.push('\r');
                    }
                }
                text.push_str(&get_all_text_foreign(child));
            } else {
                text.push_str(&get_all_text_foreign(child));
            }
        }
    }
    text
}

pub fn parse_style_sheet_from_node(node: roxmltree::Node) -> Vec<CssRule> {
    let mut rules = vec![];
    for child in node.children() {
        if child.is_element() && child.tag_name().name() == "style" {
            let text = get_all_text(child);
            parse_rules(&text, &mut rules);
        }
    }
    rules
}

fn parse_rules(css: &str, out: &mut Vec<CssRule>) {
    // Remove comments
    let re_comment = regex::Regex::new(r"/\*[\s\S]*?\*/").unwrap();
    let css = re_comment.replace_all(css, "");

    let re = regex::Regex::new(r"([^{}]+)\{([^}]*)\}").unwrap();
    for caps in re.captures_iter(&css) {
        let selector_group = caps[1].trim();
        let body = caps[2].trim();
        if selector_group.is_empty() || body.is_empty() {
            continue;
        }
        let properties = parse_declarations(body);
        for sel in selector_group.split(',') {
            let selector = sel.trim().to_string();
            if !selector.is_empty() {
                let specificity = compute_specificity(&selector);
                out.push(CssRule { selector, specificity, properties: properties.clone() });
            }
        }
    }
}

fn parse_declarations(body: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for decl in body.split(';') {
        if let Some(idx) = decl.find(':') {
            let k = decl[..idx].trim();
            let v = decl[idx + 1..].trim();
            if !k.is_empty() && !v.is_empty() {
                map.insert(k.to_string(), v.to_string());
            }
        }
    }
    map
}

fn compute_specificity(selector: &str) -> i32 {
    let mut spec = 0;
    let cleaned = selector.replace(['>', '+', '~'], " ");
    for part in cleaned.trim().split_whitespace() {
        spec += (part.matches('#').count() as i32) * 100;
        spec += (part.matches('.').count() + part.matches('[').count()) as i32 * 10;
        let tag = regex::Regex::new(r"#[\w-]+").unwrap().replace_all(part, "");
        let tag = regex::Regex::new(r"\.[\w-]+").unwrap().replace_all(&tag, "");
        let tag = regex::Regex::new(r"\[.*?\]").unwrap().replace_all(&tag, "");
        let tag = regex::Regex::new(r":[\w-]+(\(.*?\))?").unwrap().replace_all(&tag, "");
        if !tag.is_empty() && tag != "*" {
            spec += 1;
        }
    }
    spec
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::svg::transforms::identity;

    fn parse_svg(svg_str: &str) -> roxmltree::Document {
        roxmltree::Document::parse(svg_str).unwrap()
    }

    fn find_text_element<'a>(doc: &'a roxmltree::Document<'a>) -> Option<roxmltree::Node<'a, 'a>> {
        doc.descendants().find(|n| {
            n.is_element() && (n.tag_name().name() == "text" || n.tag_name().name() == "foreignObject")
        })
    }

    #[test]
    fn simple_text_extract() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="24">Hello</text></svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert_eq!(info.text, "Hello");
        assert_eq!(info.x, 10.0);
        assert_eq!(info.y, 50.0);
        assert!(!info.is_box);
    }

    #[test]
    fn multi_tspan() {
        let doc = parse_svg(r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
            <text x="10" y="50" font-family="Arial" font-size="24" fill="#333">
                <tspan font-weight="bold" fill="red">Bold</tspan>
                <tspan font-size="16" fill="blue">Small</tspan>
            </text>
        </svg>"##);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert_eq!(info.runs.len(), 2);
        assert_eq!(info.runs[0].text, "Bold");
        assert!(info.runs[0].faux_bold);
        assert_eq!(info.runs[1].text, "Small");
        assert_eq!(info.runs[1].font_size, 16.0);
    }

    #[test]
    fn foreign_object_box() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
            <foreignObject x="10" y="20" width="200" height="100">
                <div xmlns="http://www.w3.org/1999/xhtml">Hello</div>
            </foreignObject>
        </svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert!(info.is_box);
        assert!(info.box_bounds.is_some());
        assert_eq!(info.box_bounds.as_ref().unwrap().width, 200.0);
        assert_eq!(info.box_bounds.as_ref().unwrap().height, 100.0);
    }

    #[test]
    fn empty_text_returns_none() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50"></text></svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]);
        assert!(info.is_none());
    }

    #[test]
    fn style_inherited_to_runs() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Inter" font-size="20" fill="blue">Test</text></svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert_eq!(info.runs[0].font_family, "Inter");
        assert_eq!(info.runs[0].font_size, 20.0);
        assert_eq!(info.runs[0].fill_color, crate::types::Color { r: 0, g: 0, b: 255 });
    }

    #[test]
    fn text_with_transform() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="10" y="30" font-family="Arial" font-size="20">Moved</text></svg>"#);
        let node = find_text_element(&doc).unwrap();
        let transform = crate::svg::transforms::parse_transform(Some("translate(100, 200)"));
        let info = extract_text_info_from_node(node, &transform, None, &[]).unwrap();
        assert_eq!(info.x, 110.0);
        assert_eq!(info.y, 230.0);
    }

    #[test]
    fn letter_spacing_extract() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="24" letter-spacing="5">Spaced</text></svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert_eq!(info.runs[0].letter_spacing, Some(5.0));
    }

    #[test]
    fn line_height_multiplier() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="20" line-height="1.5">Lined</text></svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert_eq!(info.runs[0].line_height, Some(30.0));
    }

    #[test]
    fn no_spacing_is_none() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-family="Arial" font-size="24">Plain</text></svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert!(info.runs[0].letter_spacing.is_none());
        assert!(info.runs[0].line_height.is_none());
    }

    #[test]
    fn foreign_object_paragraph_breaks() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
            <foreignObject x="10" y="20" width="200" height="100">
                <div xmlns="http://www.w3.org/1999/xhtml">
                    <p>Line one</p>
                    <p>Line two</p>
                </div>
            </foreignObject>
        </svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert_eq!(info.text, "Line one\rLine two");
    }

    #[test]
    fn foreign_object_br() {
        let doc = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
            <foreignObject x="10" y="20" width="200" height="100">
                <div xmlns="http://www.w3.org/1999/xhtml">Hello<br/>World</div>
            </foreignObject>
        </svg>"#);
        let node = find_text_element(&doc).unwrap();
        let info = extract_text_info_from_node(node, &identity(), None, &[]).unwrap();
        assert_eq!(info.text, "Hello\rWorld");
    }
}
