use crate::types::{LayerDescriptor, PsdDocument, PsdLayer};
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
    m
});

pub fn build_psd_structure(
    descriptors: &[LayerDescriptor],
    width: f64,
    height: f64,
    scale: f64,
) -> PsdDocument {
    let psd_w = (width * scale).round() as u32;
    let psd_h = (height * scale).round() as u32;

    let children = process_descriptors(descriptors);

    PsdDocument {
        width: psd_w,
        height: psd_h,
        children,
    }
}

fn process_descriptors(descs: &[LayerDescriptor]) -> Vec<PsdLayer> {
    let mut layers = Vec::new();
    for desc in descs {
        if let Some(layer) = process_descriptor(desc) {
            layers.push(layer);
        }
    }
    layers
}

fn process_descriptor(desc: &LayerDescriptor) -> Option<PsdLayer> {
    if desc.hidden == Some(true) {
        return Some(create_hidden_layer(desc));
    }

    match desc.layer_type.as_str() {
        "group" => {
            let children = process_descriptors(desc.children.as_deref().unwrap_or(&[]));
            if children.is_empty() {
                return None;
            }

            let mut layer = PsdLayer {
                name: desc.name.clone(),
                opened: Some(true),
                children: Some(children),
                top: None, left: None, bottom: None, right: None,
                opacity: None, blend_mode: None, hidden: None,
                text: None, image_data: None,
            };
            apply_common_props(&mut layer, desc);
            Some(layer)
        }
        "text" | "graphic" => {
            // For text/graphic without rendering, just create stub
            // Actual rendering is done on JS side
            let mut layer = PsdLayer {
                name: desc.name.clone(),
                top: None, left: None, bottom: None, right: None,
                opacity: None, blend_mode: None, hidden: None,
                opened: None, children: None, text: None, image_data: None,
            };
            apply_common_props(&mut layer, desc);
            Some(layer)
        }
        _ => None,
    }
}

fn create_hidden_layer(desc: &LayerDescriptor) -> PsdLayer {
    PsdLayer {
        name: desc.name.clone(),
        hidden: Some(true),
        top: None, left: None, bottom: None, right: None,
        opacity: None, blend_mode: None, opened: None,
        children: None, text: None, image_data: None,
    }
}

fn apply_common_props(layer: &mut PsdLayer, desc: &LayerDescriptor) {
    if let Some(opacity) = desc.opacity {
        if opacity < 1.0 {
            layer.opacity = Some(opacity);
        }
    }
    if let Some(ref blend_mode) = desc.blend_mode {
        let psd_mode = BLEND_MODE_MAP.get(blend_mode.as_str()).map(|s| s.to_string());
        if psd_mode.is_some() {
            layer.blend_mode = psd_mode;
        }
    }
    if desc.hidden == Some(true) {
        layer.hidden = Some(true);
    }
}

pub fn count_layers(descriptors: &[LayerDescriptor]) -> usize {
    let mut count = 0;
    for desc in descriptors {
        if desc.layer_type == "group" {
            if let Some(ref children) = desc.children {
                count += count_layers(children);
            }
        } else {
            count += 1;
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_descriptor() {
        let descs = vec![LayerDescriptor {
            layer_type: "graphic".to_string(),
            name: "hidden-rect".to_string(),
            hidden: Some(true),
            transform: None, opacity: None, blend_mode: None,
            children: None, text_info: None, element_idx: None,
        }];
        let psd = build_psd_structure(&descs, 100.0, 100.0, 1.0);
        assert_eq!(psd.children.len(), 1);
        assert_eq!(psd.children[0].hidden, Some(true));
        assert_eq!(psd.children[0].name, "hidden-rect");
    }

    #[test]
    fn empty_descriptors() {
        let psd = build_psd_structure(&[], 100.0, 100.0, 1.0);
        assert_eq!(psd.children.len(), 0);
    }

    #[test]
    fn group_descriptor() {
        let descs = vec![LayerDescriptor {
            layer_type: "group".to_string(),
            name: "mygroup".to_string(),
            children: Some(vec![
                LayerDescriptor {
                    layer_type: "graphic".to_string(),
                    name: "child1".to_string(),
                    hidden: Some(true),
                    transform: None, opacity: None, blend_mode: None,
                    children: None, text_info: None, element_idx: None,
                },
                LayerDescriptor {
                    layer_type: "graphic".to_string(),
                    name: "child2".to_string(),
                    hidden: Some(true),
                    transform: None, opacity: None, blend_mode: None,
                    children: None, text_info: None, element_idx: None,
                },
            ]),
            transform: None, opacity: None, blend_mode: None,
            hidden: None, text_info: None, element_idx: None,
        }];
        let psd = build_psd_structure(&descs, 100.0, 100.0, 1.0);
        assert_eq!(psd.children.len(), 1);
        assert_eq!(psd.children[0].name, "mygroup");
        assert_eq!(psd.children[0].children.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn group_opacity_blend() {
        let descs = vec![LayerDescriptor {
            layer_type: "group".to_string(),
            name: "styled-group".to_string(),
            opacity: Some(0.5),
            blend_mode: Some("multiply".to_string()),
            children: Some(vec![LayerDescriptor {
                layer_type: "graphic".to_string(),
                name: "child".to_string(),
                hidden: Some(true),
                transform: None, opacity: None, blend_mode: None,
                children: None, text_info: None, element_idx: None,
            }]),
            transform: None, hidden: None, text_info: None, element_idx: None,
        }];
        let psd = build_psd_structure(&descs, 100.0, 100.0, 1.0);
        assert_eq!(psd.children[0].opacity, Some(0.5));
        assert_eq!(psd.children[0].blend_mode, Some("multiply".to_string()));
    }

    #[test]
    fn scale_applied() {
        let psd = build_psd_structure(&[], 100.0, 100.0, 2.0);
        assert_eq!(psd.width, 200);
        assert_eq!(psd.height, 200);
    }
}
