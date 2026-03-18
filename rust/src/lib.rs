pub mod types;
pub mod utils;
pub mod svg;
pub mod psd;
pub mod core;

use wasm_bindgen::prelude::*;

/// All-in-one: parse + walk + enrich + extract parts in a SINGLE WASM call.
/// Returns JSON: { width, height, viewBox, layerCount, descriptors, prefix, elements }
#[wasm_bindgen(js_name = "processAll")]
pub fn wasm_process_all(svg_xml: &str, view_box_json: Option<String>, scale: Option<f64>) -> Result<String, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;

    let _scale = scale.unwrap_or(1.0);

    // 1. Parse dimensions
    let root = doc.root_element();
    let view_box = svg::parser::parse_view_box(root.attribute("viewBox"));
    let width: f64 = root.attribute("width").and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.w).unwrap_or(800.0));
    let height: f64 = root.attribute("height").and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.h).unwrap_or(600.0));

    // 2. Walk
    let mut descriptors = svg::walker::walk_svg(&doc);
    let layer_count = core::converter_core::count_all_layers(&descriptors);

    // 3. Enrich text
    let vb_override: Option<types::ViewBox> = view_box_json.and_then(|vb| serde_json::from_str(&vb).ok());
    let vb_ref = vb_override.as_ref().or(view_box.as_ref());
    let stylesheet = svg::style_resolver::parse_style_sheet(&doc);
    enrich_with_doc(&mut descriptors, &doc, vb_ref, &stylesheet);

    // 4. Extract SVG parts (prefix + element fragments)
    let (prefix, _) = build_svg_shell(svg_xml, &doc);
    let fo_re = regex::Regex::new(r"(?s)<foreignObject[^>]*>.*?</foreignObject>").unwrap();

    let mut elements = serde_json::Map::new();
    fn collect_and_extract(
        descs: &[types::LayerDescriptor],
        doc: &roxmltree::Document,
        svg_xml: &str,
        fo_re: &regex::Regex,
        elements: &mut serde_json::Map<String, serde_json::Value>,
    ) {
        for d in descs {
            if d.layer_type == "group" {
                if let Some(ref children) = d.children {
                    collect_and_extract(children, doc, svg_xml, fo_re, elements);
                }
            }
            if let Some(idx) = d.element_idx {
                if let Some(node) = doc.get_node(roxmltree::NodeId::new(idx)) {
                    if node.is_element() {
                        let el_range = node.range();
                        if !el_range.is_empty() && el_range.end <= svg_xml.len() {
                            let el_xml = fo_re.replace_all(&svg_xml[el_range], "");
                            let mut entry = serde_json::Map::new();
                            entry.insert("xml".into(), serde_json::Value::String(el_xml.into_owned()));
                            if let Some(ref m) = d.transform {
                                if !svg::transforms::is_identity(m) {
                                    entry.insert("transform".into(), serde_json::to_value(m).unwrap());
                                }
                            }
                            elements.insert(idx.to_string(), serde_json::Value::Object(entry));
                        }
                    }
                }
            }
        }
    }
    collect_and_extract(&descriptors, &doc, svg_xml, &fo_re, &mut elements);

    // 5. Build result
    let result = serde_json::json!({
        "width": width,
        "height": height,
        "viewBox": view_box,
        "layerCount": layer_count,
        "descriptors": descriptors,
        "prefix": prefix,
        "elements": elements,
    });

    Ok(result.to_string())
}

fn enrich_with_doc(
    descriptors: &mut [types::LayerDescriptor],
    doc: &roxmltree::Document,
    view_box: Option<&types::ViewBox>,
    stylesheet: &[svg::style_resolver::CssRule],
) {
    for desc in descriptors.iter_mut() {
        if desc.layer_type == "group" {
            if let Some(ref mut children) = desc.children {
                enrich_with_doc(children, doc, view_box, stylesheet);
            }
        } else if desc.layer_type == "text" {
            if let Some(idx) = desc.element_idx {
                if let Some(node) = doc.get_node(roxmltree::NodeId::new(idx)) {
                    let transform = desc.transform.unwrap_or([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
                    desc.text_info = svg::text_extractor::extract_text_info_from_node(
                        node, &transform, view_box, stylesheet,
                    );
                }
            }
        }
    }
}

/// Parse SVG string and return JSON with dimensions and viewBox
#[wasm_bindgen(js_name = "parseSvgString")]
pub fn wasm_parse_svg_string(xml: &str) -> Result<String, JsError> {
    let result = svg::parser::parse_svg_string(xml)
        .map_err(|e| JsError::new(&e))?;
    let json = serde_json::json!({
        "width": result.width,
        "height": result.height,
        "viewBox": result.view_box,
    });
    Ok(json.to_string())
}

/// Walk SVG and return layer descriptors as JSON
#[wasm_bindgen(js_name = "walkSvg")]
pub fn wasm_walk_svg(xml: &str) -> Result<String, JsError> {
    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| JsError::new(&format!("SVG 解析错误: {}", e)))?;
    let descriptors = svg::walker::walk_svg(&doc);
    Ok(serde_json::to_string(&descriptors).unwrap())
}

/// Parse color string, return JSON {r, g, b}
#[wasm_bindgen(js_name = "parseColor")]
pub fn wasm_parse_color(color: Option<String>) -> String {
    let c = utils::color::parse_color(color.as_deref());
    serde_json::to_string(&c).unwrap()
}

/// Parse transform string, return JSON array [a,b,c,d,e,f]
#[wasm_bindgen(js_name = "parseTransform")]
pub fn wasm_parse_transform(s: Option<String>) -> String {
    let m = svg::transforms::parse_transform(s.as_deref());
    serde_json::to_string(&m).unwrap()
}

/// Identity matrix as JSON
#[wasm_bindgen(js_name = "identity")]
pub fn wasm_identity() -> String {
    serde_json::to_string(&svg::transforms::identity()).unwrap()
}

/// Multiply two matrices
#[wasm_bindgen(js_name = "multiply")]
pub fn wasm_multiply(a_json: &str, b_json: &str) -> Result<String, JsError> {
    let a: types::Matrix = serde_json::from_str(a_json)
        .map_err(|e| JsError::new(&format!("Invalid matrix A: {}", e)))?;
    let b: types::Matrix = serde_json::from_str(b_json)
        .map_err(|e| JsError::new(&format!("Invalid matrix B: {}", e)))?;
    let result = svg::transforms::multiply(&a, &b);
    Ok(serde_json::to_string(&result).unwrap())
}

/// Transform a point
#[wasm_bindgen(js_name = "transformPoint")]
pub fn wasm_transform_point(matrix_json: &str, x: f64, y: f64) -> Result<String, JsError> {
    let m: types::Matrix = serde_json::from_str(matrix_json)
        .map_err(|e| JsError::new(&format!("Invalid matrix: {}", e)))?;
    let (rx, ry) = svg::transforms::transform_point(&m, x, y);
    Ok(serde_json::json!({"x": rx, "y": ry}).to_string())
}

/// Get translation from matrix
#[wasm_bindgen(js_name = "getTranslation")]
pub fn wasm_get_translation(matrix_json: &str) -> Result<String, JsError> {
    let m: types::Matrix = serde_json::from_str(matrix_json)
        .map_err(|e| JsError::new(&format!("Invalid matrix: {}", e)))?;
    let (tx, ty) = svg::transforms::get_translation(&m);
    Ok(serde_json::json!({"tx": tx, "ty": ty}).to_string())
}

/// Font utilities
#[wasm_bindgen(js_name = "toPostScriptName")]
pub fn wasm_to_postscript_name(family: &str, weight: &str) -> String {
    utils::font::to_postscript_name(family, weight)
}

#[wasm_bindgen(js_name = "cleanFontFamily")]
pub fn wasm_clean_font_family(ff: Option<String>) -> String {
    utils::font::clean_font_family(ff.as_deref())
}

#[wasm_bindgen(js_name = "isBoldWeight")]
pub fn wasm_is_bold_weight(weight: Option<String>) -> bool {
    utils::font::is_bold_weight(weight.as_deref())
}

/// PSD effects
#[wasm_bindgen(js_name = "toPsdOpacity")]
pub fn wasm_to_psd_opacity(opacity: Option<f64>) -> f64 {
    psd::effects::to_psd_opacity(opacity)
}

#[wasm_bindgen(js_name = "toPsdBlendMode")]
pub fn wasm_to_psd_blend_mode(mode: Option<String>) -> String {
    psd::effects::to_psd_blend_mode(mode.as_deref())
}

#[wasm_bindgen(js_name = "getBlendModeMap")]
pub fn wasm_get_blend_mode_map() -> String {
    let map = psd::effects::get_blend_mode_map();
    serde_json::to_string(&map).unwrap()
}

/// Style resolver
#[wasm_bindgen(js_name = "parseStyleAttr")]
pub fn wasm_parse_style_attr(style: Option<String>) -> String {
    let map = svg::style_resolver::parse_style_attr(style.as_deref());
    serde_json::to_string(&map).unwrap()
}

#[wasm_bindgen(js_name = "parseStyleSheet")]
pub fn wasm_parse_style_sheet(svg_xml: &str) -> Result<String, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;
    let rules = svg::style_resolver::parse_style_sheet(&doc);
    Ok(serde_json::to_string(&rules).unwrap())
}

/// Process render result (crop transparent pixels)
#[wasm_bindgen(js_name = "processRenderResult")]
pub fn wasm_process_render_result(pixels: &[u8], width: u32, height: u32) -> Option<String> {
    let result = core::renderer_core::process_render_result(pixels, width, height)?;
    Some(serde_json::to_string(&result).unwrap())
}

#[wasm_bindgen(js_name = "isCompletelyTransparent")]
pub fn wasm_is_completely_transparent(pixels: &[u8]) -> bool {
    core::renderer_core::is_completely_transparent(pixels)
}

#[wasm_bindgen(js_name = "computeTightBBox")]
pub fn wasm_compute_tight_bbox(pixels: &[u8], width: u32, height: u32) -> Option<String> {
    let bbox = core::renderer_core::compute_tight_bbox(pixels, width, height)?;
    Some(serde_json::json!({
        "top": bbox.top,
        "left": bbox.left,
        "bottom": bbox.bottom,
        "right": bbox.right,
    }).to_string())
}

/// Count all layers
#[wasm_bindgen(js_name = "countAllLayers")]
pub fn wasm_count_all_layers(descriptors_json: &str) -> Result<usize, JsError> {
    let descs: Vec<types::LayerDescriptor> = serde_json::from_str(descriptors_json)
        .map_err(|e| JsError::new(&format!("Invalid JSON: {}", e)))?;
    Ok(core::converter_core::count_all_layers(&descs))
}

/// Extract text info
#[wasm_bindgen(js_name = "extractTextInfo")]
pub fn wasm_extract_text_info(
    svg_xml: &str,
    transform_json: &str,
    view_box_json: Option<String>,
) -> Result<Option<String>, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;
    let transform: types::Matrix = serde_json::from_str(transform_json)
        .map_err(|e| JsError::new(&format!("Invalid transform: {}", e)))?;
    let view_box: Option<types::ViewBox> = view_box_json
        .and_then(|vb| serde_json::from_str(&vb).ok());
    let stylesheet = svg::style_resolver::parse_style_sheet(&doc);

    for node in doc.descendants() {
        if node.is_element() {
            let tag = node.tag_name().name();
            if tag == "text" || tag == "foreignObject" {
                let info = svg::text_extractor::extract_text_info_from_node(
                    node, &transform, view_box.as_ref(), &stylesheet
                );
                return Ok(info.map(|i| serde_json::to_string(&i).unwrap()));
            }
        }
    }
    Ok(None)
}

/// Build text layer
#[wasm_bindgen(js_name = "buildTextLayer")]
pub fn wasm_build_text_layer(
    desc_json: &str,
    view_box_str: Option<String>,
    scale: f64,
) -> Result<Option<String>, JsError> {
    let desc: types::LayerDescriptor = serde_json::from_str(desc_json)
        .map_err(|e| JsError::new(&format!("Invalid descriptor: {}", e)))?;
    let layer = psd::text_layer::build_text_layer(&desc, view_box_str.as_deref(), scale);
    Ok(layer.map(|l| serde_json::to_string(&l).unwrap()))
}

/// Build PSD structure
#[wasm_bindgen(js_name = "buildPsdStructure")]
pub fn wasm_build_psd_structure(
    descriptors_json: &str,
    width: f64,
    height: f64,
    scale: f64,
) -> Result<String, JsError> {
    let descs: Vec<types::LayerDescriptor> = serde_json::from_str(descriptors_json)
        .map_err(|e| JsError::new(&format!("Invalid JSON: {}", e)))?;
    let psd = psd::builder::build_psd_structure(&descs, width, height, scale);
    Ok(serde_json::to_string(&psd).unwrap())
}

/// Resolve styles
#[wasm_bindgen(js_name = "resolveStyles")]
pub fn wasm_resolve_styles(
    svg_xml: &str,
    element_tag: &str,
    parent_styles_json: &str,
) -> Result<String, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;
    let parent_styles: std::collections::HashMap<String, String> = serde_json::from_str(parent_styles_json)
        .unwrap_or_default();
    let stylesheet = svg::style_resolver::parse_style_sheet(&doc);

    for node in doc.descendants() {
        if node.is_element() && node.tag_name().name() == element_tag {
            let styles = svg::style_resolver::resolve_styles(node, &parent_styles, &stylesheet);
            return Ok(serde_json::to_string(&styles).unwrap());
        }
    }
    Ok("{}".to_string())
}

/// Enrich text descriptors
#[wasm_bindgen(js_name = "enrichTextDescriptors")]
pub fn wasm_enrich_text_descriptors(
    descriptors_json: &str,
    svg_xml: &str,
    view_box_json: Option<String>,
) -> Result<String, JsError> {
    let mut descs: Vec<types::LayerDescriptor> = serde_json::from_str(descriptors_json)
        .map_err(|e| JsError::new(&format!("Invalid JSON: {}", e)))?;
    let view_box: Option<types::ViewBox> = view_box_json
        .and_then(|vb| serde_json::from_str(&vb).ok());
    core::converter_core::enrich_text_descriptors(&mut descs, svg_xml, view_box.as_ref());
    Ok(serde_json::to_string(&descs).unwrap())
}

/// Parse view box
#[wasm_bindgen(js_name = "parseViewBox")]
pub fn wasm_parse_view_box(attr: Option<String>) -> String {
    let result = svg::parser::parse_view_box(attr.as_deref());
    serde_json::to_string(&result).unwrap()
}

/// Get style value
#[wasm_bindgen(js_name = "getStyleValue")]
pub fn wasm_get_style_value(
    svg_xml: &str,
    element_tag: &str,
    prop: &str,
    inherited: Option<String>,
) -> Result<Option<String>, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;
    for node in doc.descendants() {
        if node.is_element() && node.tag_name().name() == element_tag {
            return Ok(svg::style_resolver::get_style_value(node, prop, inherited.as_deref()));
        }
    }
    Ok(None)
}

/// Get matched CSS properties
#[wasm_bindgen(js_name = "getMatchedCssProperties")]
pub fn wasm_get_matched_css_properties(
    svg_xml: &str,
    element_tag: &str,
) -> Result<String, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;
    let stylesheet = svg::style_resolver::parse_style_sheet(&doc);
    for node in doc.descendants() {
        if node.is_element() && node.tag_name().name() == element_tag {
            let props = svg::style_resolver::get_matched_css_properties(node, &stylesheet);
            return Ok(serde_json::to_string(&props).unwrap());
        }
    }
    Ok("{}".to_string())
}

/// Build standalone SVG string for a single element by its node ID
#[wasm_bindgen(js_name = "buildStandaloneSvgForElement")]
pub fn wasm_build_standalone_svg_for_element(
    svg_xml: &str,
    element_idx: u32,
    transform_json: Option<String>,
) -> Result<Option<String>, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;

    let transform: Option<types::Matrix> = transform_json
        .and_then(|t| serde_json::from_str(&t).ok());

    let (prefix, suffix) = build_svg_shell(svg_xml, &doc);

    match build_element_svg(svg_xml, &doc, element_idx, transform.as_ref(), &prefix, &suffix) {
        Some(s) => Ok(Some(s)),
        None => Ok(None),
    }
}

/// Batch build standalone SVGs for multiple elements in ONE parse pass
/// Input: descriptors_json (array with elementIdx + transform fields)
/// Output: JSON object { "elementIdx": "svgString", ... }
#[wasm_bindgen(js_name = "buildAllStandaloneSvgs")]
pub fn wasm_build_all_standalone_svgs(
    svg_xml: &str,
    descriptors_json: &str,
) -> Result<String, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;

    let descs: Vec<serde_json::Value> = serde_json::from_str(descriptors_json)
        .map_err(|e| JsError::new(&format!("Invalid JSON: {}", e)))?;

    let (prefix, suffix) = build_svg_shell(svg_xml, &doc);
    let fo_re = regex::Regex::new(r"(?s)<foreignObject[^>]*>.*?</foreignObject>").unwrap();

    let mut result_map = serde_json::Map::new();

    fn collect_leaves(descs: &[serde_json::Value], out: &mut Vec<(u32, Option<types::Matrix>)>) {
        for d in descs {
            if let Some(children) = d.get("children").and_then(|c| c.as_array()) {
                collect_leaves(children, out);
            }
            if let Some(idx) = d.get("elementIdx").and_then(|v| v.as_u64()) {
                let transform: Option<types::Matrix> = d.get("transform")
                    .and_then(|t| serde_json::from_value(t.clone()).ok());
                out.push((idx as u32, transform));
            }
        }
    }

    let mut leaves = Vec::new();
    collect_leaves(&descs, &mut leaves);

    for (element_idx, transform) in &leaves {
        let node = match doc.get_node(roxmltree::NodeId::new(*element_idx)) {
            Some(n) if n.is_element() => n,
            _ => continue,
        };

        let el_range = node.range();
        if el_range.is_empty() || el_range.end > svg_xml.len() {
            continue;
        }
        let el_xml = &svg_xml[el_range];
        let el_xml = fo_re.replace_all(el_xml, "");

        let mut svg_str = String::with_capacity(prefix.len() + el_xml.len() + suffix.len() + 100);
        svg_str.push_str(&prefix);

        if let Some(m) = transform {
            if !svg::transforms::is_identity(m) {
                let [a, b, c, d, e, f] = m;
                svg_str.push_str(&format!(
                    "<g transform=\"matrix({},{},{},{},{},{})\">",
                    a, b, c, d, e, f
                ));
                svg_str.push_str(&el_xml);
                svg_str.push_str("</g>");
            } else {
                svg_str.push_str(&el_xml);
            }
        } else {
            svg_str.push_str(&el_xml);
        }

        svg_str.push_str(&suffix);
        result_map.insert(element_idx.to_string(), serde_json::Value::String(svg_str));
    }

    Ok(serde_json::Value::Object(result_map).to_string())
}

/// Extract SVG shell prefix and all element fragments in ONE parse pass.
/// Returns JSON: { "prefix": "<svg...><defs>...</defs>", "elements": { "idx": { "xml": "...", "transform": [..] | null } } }
/// JS assembles: prefix + (transform wrapper) + element xml + "</svg>"
#[wasm_bindgen(js_name = "extractSvgParts")]
pub fn wasm_extract_svg_parts(
    svg_xml: &str,
    descriptors_json: &str,
) -> Result<String, JsError> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| JsError::new(&format!("SVG parse error: {}", e)))?;

    let descs: Vec<serde_json::Value> = serde_json::from_str(descriptors_json)
        .map_err(|e| JsError::new(&format!("Invalid JSON: {}", e)))?;

    let (prefix, _) = build_svg_shell(svg_xml, &doc);

    let fo_re = regex::Regex::new(r"(?s)<foreignObject[^>]*>.*?</foreignObject>").unwrap();

    let mut elements = serde_json::Map::new();

    fn collect_leaves(descs: &[serde_json::Value], out: &mut Vec<(u32, Option<types::Matrix>)>) {
        for d in descs {
            if let Some(children) = d.get("children").and_then(|c| c.as_array()) {
                collect_leaves(children, out);
            }
            if let Some(idx) = d.get("elementIdx").and_then(|v| v.as_u64()) {
                let transform: Option<types::Matrix> = d.get("transform")
                    .and_then(|t| serde_json::from_value(t.clone()).ok());
                out.push((idx as u32, transform));
            }
        }
    }

    let mut leaves = Vec::new();
    collect_leaves(&descs, &mut leaves);

    for (element_idx, transform) in &leaves {
        let node = match doc.get_node(roxmltree::NodeId::new(*element_idx)) {
            Some(n) if n.is_element() => n,
            _ => continue,
        };
        let el_range = node.range();
        if el_range.is_empty() || el_range.end > svg_xml.len() { continue; }

        let el_xml = fo_re.replace_all(&svg_xml[el_range], "");

        let mut entry = serde_json::Map::new();
        entry.insert("xml".into(), serde_json::Value::String(el_xml.into_owned()));
        if let Some(m) = transform {
            if !svg::transforms::is_identity(m) {
                entry.insert("transform".into(), serde_json::to_value(m).unwrap());
            }
        }
        elements.insert(element_idx.to_string(), serde_json::Value::Object(entry));
    }

    let mut result = serde_json::Map::new();
    result.insert("prefix".into(), serde_json::Value::String(prefix));
    result.insert("elements".into(), serde_json::Value::Object(elements));

    Ok(serde_json::Value::Object(result).to_string())
}

/// Pre-compute the SVG shell (header + defs/style + closing tag) from a parsed document.
/// This avoids re-parsing the XML for each element.
fn build_svg_shell(svg_xml: &str, doc: &roxmltree::Document) -> (String, String) {
    let root = doc.root_element();

    let root_range = root.range();
    let root_xml = &svg_xml[root_range];
    let open_tag_end = root_xml.find('>').unwrap_or(0);
    let open_tag = &root_xml[..open_tag_end + 1];
    let open_tag = if open_tag.ends_with("/>") {
        format!("{}>", &open_tag[..open_tag.len() - 2])
    } else {
        open_tag.to_string()
    };

    let mut prefix = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    prefix.push_str(&open_tag);

    for child in root.children() {
        if child.is_element() {
            let tag = child.tag_name().name();
            if tag == "defs" || tag == "style" {
                let range = child.range();
                if !range.is_empty() && range.end <= svg_xml.len() {
                    prefix.push_str(&svg_xml[range]);
                }
            }
        }
    }

    (prefix, "</svg>".to_string())
}

fn build_element_svg(
    svg_xml: &str,
    doc: &roxmltree::Document,
    element_idx: u32,
    transform: Option<&types::Matrix>,
    prefix: &str,
    suffix: &str,
) -> Option<String> {
    let node = doc.get_node(roxmltree::NodeId::new(element_idx))?;
    if !node.is_element() {
        return None;
    }

    let el_range = node.range();
    if el_range.is_empty() || el_range.end > svg_xml.len() {
        return None;
    }
    let el_xml = &svg_xml[el_range];

    let fo_re = regex::Regex::new(r"(?s)<foreignObject[^>]*>.*?</foreignObject>").unwrap();
    let el_xml = fo_re.replace_all(el_xml, "");

    let mut result = String::with_capacity(prefix.len() + el_xml.len() + suffix.len() + 100);
    result.push_str(prefix);

    if let Some(m) = transform {
        if !svg::transforms::is_identity(m) {
            let [a, b, c, d, e, f] = *m;
            result.push_str(&format!(
                "<g transform=\"matrix({},{},{},{},{},{})\">",
                a, b, c, d, e, f
            ));
            result.push_str(&el_xml);
            result.push_str("</g>");
        } else {
            result.push_str(&el_xml);
        }
    } else {
        result.push_str(&el_xml);
    }

    result.push_str(suffix);
    Some(result)
}
