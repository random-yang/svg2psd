use std::collections::HashMap;
use std::sync::LazyLock;

static BLEND_MODE_MAP: LazyLock<HashMap<&'static str, &'static str>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("normal", "normal");
    m.insert("multiply", "multiply");
    m.insert("screen", "screen");
    m.insert("overlay", "overlay");
    m.insert("darken", "darken");
    m.insert("lighten", "lighten");
    m.insert("color-dodge", "color dodge");
    m.insert("color-burn", "color burn");
    m.insert("hard-light", "hard light");
    m.insert("soft-light", "soft light");
    m.insert("difference", "difference");
    m.insert("exclusion", "exclusion");
    m.insert("hue", "hue");
    m.insert("saturation", "saturation");
    m.insert("color", "color");
    m.insert("luminosity", "luminosity");
    m.insert("plus-darker", "darken");
    m.insert("plus-lighter", "lighten");
    m
});

pub fn to_psd_opacity(opacity: Option<f64>) -> f64 {
    match opacity {
        None => 1.0,
        Some(v) => v.clamp(0.0, 1.0),
    }
}

pub fn to_psd_blend_mode(mode: Option<&str>) -> String {
    match mode {
        None => "normal".to_string(),
        Some(m) => {
            let key = m.trim().to_lowercase();
            BLEND_MODE_MAP
                .get(key.as_str())
                .unwrap_or(&"normal")
                .to_string()
        }
    }
}

pub fn get_blend_mode_map() -> &'static HashMap<&'static str, &'static str> {
    &BLEND_MODE_MAP
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- to_psd_opacity tests ---

    #[test]
    fn opacity_normal_value() {
        assert!((to_psd_opacity(Some(0.5)) - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn opacity_none_returns_1() {
        assert!((to_psd_opacity(None) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn opacity_negative_clamps_to_0() {
        assert!((to_psd_opacity(Some(-0.5)) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn opacity_greater_than_1_clamps_to_1() {
        assert!((to_psd_opacity(Some(1.5)) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn opacity_zero() {
        assert!((to_psd_opacity(Some(0.0)) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn opacity_exactly_1() {
        assert!((to_psd_opacity(Some(1.0)) - 1.0).abs() < f64::EPSILON);
    }

    // --- to_psd_blend_mode tests ---

    #[test]
    fn blend_mode_multiply() {
        assert_eq!(to_psd_blend_mode(Some("multiply")), "multiply");
    }

    #[test]
    fn blend_mode_color_dodge() {
        assert_eq!(to_psd_blend_mode(Some("color-dodge")), "color dodge");
    }

    #[test]
    fn blend_mode_unknown_returns_normal() {
        assert_eq!(to_psd_blend_mode(Some("unknown-mode")), "normal");
    }

    #[test]
    fn blend_mode_none_returns_normal() {
        assert_eq!(to_psd_blend_mode(None), "normal");
    }

    #[test]
    fn blend_mode_case_insensitive() {
        assert_eq!(to_psd_blend_mode(Some("Multiply")), "multiply");
        assert_eq!(to_psd_blend_mode(Some("COLOR-DODGE")), "color dodge");
    }

    #[test]
    fn blend_mode_trims_whitespace() {
        assert_eq!(to_psd_blend_mode(Some("  multiply  ")), "multiply");
    }

    // --- BLEND_MODE_MAP tests ---

    #[test]
    fn blend_mode_map_contains_all_16_standard_css_blend_modes() {
        let standard_modes = [
            "normal",
            "multiply",
            "screen",
            "overlay",
            "darken",
            "lighten",
            "color-dodge",
            "color-burn",
            "hard-light",
            "soft-light",
            "difference",
            "exclusion",
            "hue",
            "saturation",
            "color",
            "luminosity",
        ];
        let map = get_blend_mode_map();
        for mode in &standard_modes {
            assert!(
                map.contains_key(mode),
                "BLEND_MODE_MAP missing standard CSS blend mode: {mode}"
            );
        }
    }

    #[test]
    fn blend_mode_map_contains_plus_variants() {
        let map = get_blend_mode_map();
        assert_eq!(map.get("plus-darker"), Some(&"darken"));
        assert_eq!(map.get("plus-lighter"), Some(&"lighten"));
    }

    #[test]
    fn blend_mode_map_has_18_entries_total() {
        assert_eq!(get_blend_mode_map().len(), 18);
    }
}
