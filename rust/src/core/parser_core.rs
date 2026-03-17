use crate::types::ViewBox;
use crate::svg::parser::parse_view_box;

#[derive(Debug)]
pub struct ParsedSvg {
    pub width: f64,
    pub height: f64,
    pub view_box: Option<ViewBox>,
}

pub fn parse_svg_from_document(doc: &roxmltree::Document) -> Result<ParsedSvg, String> {
    let svg = doc.root_element();
    if svg.tag_name().name() != "svg" {
        return Err("无效的 SVG 文件：缺少 <svg> 根元素".to_string());
    }

    let view_box = parse_view_box(svg.attribute("viewBox"));
    let width: f64 = svg.attribute("width")
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.w).unwrap_or(800.0));
    let height: f64 = svg.attribute("height")
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.h).unwrap_or(600.0));

    Ok(ParsedSvg { width, height, view_box })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_doc(svg_str: &str) -> roxmltree::Document {
        roxmltree::Document::parse(svg_str).unwrap()
    }

    #[test]
    fn extract_width_height_viewbox() {
        let doc = make_doc(r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"></svg>"#);
        let result = parse_svg_from_document(&doc).unwrap();
        assert_eq!(result.width, 200.0);
        assert_eq!(result.height, 100.0);
        assert_eq!(result.view_box, Some(ViewBox { x: 0.0, y: 0.0, w: 200.0, h: 100.0 }));
    }

    #[test]
    fn infer_from_viewbox() {
        let doc = make_doc(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"></svg>"#);
        let result = parse_svg_from_document(&doc).unwrap();
        assert_eq!(result.width, 400.0);
        assert_eq!(result.height, 300.0);
    }

    #[test]
    fn defaults() {
        let doc = make_doc(r#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#);
        let result = parse_svg_from_document(&doc).unwrap();
        assert_eq!(result.width, 800.0);
        assert_eq!(result.height, 600.0);
        assert!(result.view_box.is_none());
    }

    #[test]
    fn non_svg_root() {
        let doc = make_doc(r#"<div xmlns="http://www.w3.org/1999/xhtml">hello</div>"#);
        let result = parse_svg_from_document(&doc);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("缺少 <svg> 根元素"));
    }
}
