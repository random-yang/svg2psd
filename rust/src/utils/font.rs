use crate::types::FontMapEntry;
use std::collections::HashMap;
use std::sync::LazyLock;

static FONT_MAP: LazyLock<HashMap<&'static str, FontMapEntry>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("Arial", FontMapEntry { normal: "ArialMT", bold: "Arial-BoldMT" });
    m.insert("Helvetica", FontMapEntry { normal: "Helvetica", bold: "Helvetica-Bold" });
    m.insert("Helvetica Neue", FontMapEntry { normal: "HelveticaNeue", bold: "HelveticaNeue-Bold" });
    m.insert("Inter", FontMapEntry { normal: "Inter", bold: "Inter-Bold" });
    m.insert("Georgia", FontMapEntry { normal: "Georgia", bold: "Georgia-Bold" });
    m.insert("Times New Roman", FontMapEntry { normal: "TimesNewRomanPSMT", bold: "TimesNewRomanPS-BoldMT" });
    m.insert("Courier New", FontMapEntry { normal: "CourierNewPSMT", bold: "CourierNewPS-BoldMT" });
    m.insert("Verdana", FontMapEntry { normal: "Verdana", bold: "Verdana-Bold" });
    m.insert("Tahoma", FontMapEntry { normal: "Tahoma", bold: "Tahoma-Bold" });
    m.insert("Trebuchet MS", FontMapEntry { normal: "TrebuchetMS", bold: "TrebuchetMS-Bold" });
    m.insert("Comic Sans MS", FontMapEntry { normal: "ComicSansMS", bold: "ComicSansMS-Bold" });
    m.insert("Impact", FontMapEntry { normal: "Impact", bold: "Impact" });
    m.insert("Lucida Sans", FontMapEntry { normal: "LucidaGrande", bold: "LucidaGrande-Bold" });
    m.insert("Lucida Grande", FontMapEntry { normal: "LucidaGrande", bold: "LucidaGrande-Bold" });
    m.insert("Roboto", FontMapEntry { normal: "Roboto-Regular", bold: "Roboto-Bold" });
    m.insert("Open Sans", FontMapEntry { normal: "OpenSans-Regular", bold: "OpenSans-Bold" });
    m.insert("Noto Sans", FontMapEntry { normal: "NotoSans-Regular", bold: "NotoSans-Bold" });
    m.insert("Source Sans Pro", FontMapEntry { normal: "SourceSansPro-Regular", bold: "SourceSansPro-Bold" });
    m.insert("SF Pro", FontMapEntry { normal: "SFPro-Regular", bold: "SFPro-Bold" });
    m.insert("SF Pro Display", FontMapEntry { normal: "SFProDisplay-Regular", bold: "SFProDisplay-Bold" });
    m.insert("SF Pro Text", FontMapEntry { normal: "SFProText-Regular", bold: "SFProText-Bold" });
    m.insert("PingFang SC", FontMapEntry { normal: "PingFangSC-Regular", bold: "PingFangSC-Semibold" });
    m.insert("PingFang TC", FontMapEntry { normal: "PingFangTC-Regular", bold: "PingFangTC-Semibold" });
    m.insert("Microsoft YaHei", FontMapEntry { normal: "MicrosoftYaHei", bold: "MicrosoftYaHei-Bold" });
    m.insert("Noto Sans SC", FontMapEntry { normal: "NotoSansSC-Regular", bold: "NotoSansSC-Bold" });
    m
});

pub fn to_postscript_name(family: &str, weight: &str) -> String {
    let is_bold = weight == "bold" || weight.parse::<i32>().unwrap_or(0) >= 700;
    if let Some(entry) = FONT_MAP.get(family) {
        return if is_bold { entry.bold.to_string() } else { entry.normal.to_string() };
    }
    let base = family.replace(' ', "");
    if is_bold { format!("{}-Bold", base) } else { base }
}

pub fn clean_font_family(ff: Option<&str>) -> String {
    match ff {
        None | Some("") => "Arial".to_string(),
        Some(ff) => {
            let first = ff.split(',').next().unwrap_or("Arial").trim();
            first.replace(['\'', '"'], "")
        }
    }
}

pub fn is_bold_weight(weight: Option<&str>) -> bool {
    match weight {
        None => false,
        Some(w) => w == "bold" || w.parse::<i32>().unwrap_or(0) >= 700,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arial_normal() {
        assert_eq!(to_postscript_name("Arial", "normal"), "ArialMT");
    }

    #[test]
    fn arial_bold() {
        assert_eq!(to_postscript_name("Arial", "bold"), "Arial-BoldMT");
    }

    #[test]
    fn arial_700() {
        assert_eq!(to_postscript_name("Arial", "700"), "Arial-BoldMT");
    }

    #[test]
    fn unknown_normal() {
        assert_eq!(to_postscript_name("CustomFont", "normal"), "CustomFont");
    }

    #[test]
    fn unknown_bold() {
        assert_eq!(to_postscript_name("CustomFont", "bold"), "CustomFont-Bold");
    }

    #[test]
    fn clean_first_font() {
        assert_eq!(clean_font_family(Some("'Inter', sans-serif")), "Inter");
    }

    #[test]
    fn clean_null() {
        assert_eq!(clean_font_family(None), "Arial");
    }

    #[test]
    fn clean_quotes() {
        assert_eq!(clean_font_family(Some("\"Open Sans\", sans-serif")), "Open Sans");
    }

    #[test]
    fn bold_true() {
        assert!(is_bold_weight(Some("bold")));
    }

    #[test]
    fn bold_700() {
        assert!(is_bold_weight(Some("700")));
    }

    #[test]
    fn not_bold_normal() {
        assert!(!is_bold_weight(Some("normal")));
    }

    #[test]
    fn not_bold_400() {
        assert!(!is_bold_weight(Some("400")));
    }

    #[test]
    fn not_bold_none() {
        assert!(!is_bold_weight(None));
    }
}
