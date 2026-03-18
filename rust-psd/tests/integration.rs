use ag_psd_rs::*;

/// Write PSD bytes to a temp file and return the path
fn write_to_tmp(name: &str, psd: &Psd, opts: &WriteOptions) -> String {
    let data = write_psd(psd, opts);
    let path = format!("/tmp/ag-psd-rs-test-{}.psd", name);
    std::fs::write(&path, &data).unwrap();
    path
}

#[test]
fn writes_valid_psd_header() {
    let psd = Psd { width: 100, height: 200, children: vec![] };
    let data = write_psd(&psd, &WriteOptions::default());
    // "8BPS" signature
    assert_eq!(&data[0..4], b"8BPS");
    // version 1
    assert_eq!(data[4], 0);
    assert_eq!(data[5], 1);
    // channels = 3
    assert_eq!(u16::from_be_bytes([data[12], data[13]]), 3);
    // height = 200
    assert_eq!(u32::from_be_bytes([data[14], data[15], data[16], data[17]]), 200);
    // width = 100
    assert_eq!(u32::from_be_bytes([data[18], data[19], data[20], data[21]]), 100);
    // depth = 8
    assert_eq!(u16::from_be_bytes([data[22], data[23]]), 8);
    // color mode = 3 (RGB)
    assert_eq!(u16::from_be_bytes([data[24], data[25]]), 3);
}

#[test]
fn empty_psd_produces_valid_file() {
    let path = write_to_tmp("empty", &Psd { width: 4, height: 4, children: vec![] }, &WriteOptions::default());
    let data = std::fs::read(&path).unwrap();
    assert!(data.len() > 26, "PSD must be larger than header");
    // File is written for JS roundtrip test
}

#[test]
fn single_raster_layer() {
    let mut pixels = vec![0u8; 2 * 2 * 4];
    for i in 0..4 {
        pixels[i * 4] = 255;     // R
        pixels[i * 4 + 1] = 0;   // G
        pixels[i * 4 + 2] = 0;   // B
        pixels[i * 4 + 3] = 255; // A
    }
    let psd = Psd {
        width: 4, height: 4,
        children: vec![Layer {
            name: "RedBox".to_string(),
            top: 0, left: 0, bottom: 2, right: 2,
            image_data: Some(ImageData { width: 2, height: 2, data: pixels }),
            ..Layer::default()
        }],
    };
    let path = write_to_tmp("raster", &psd, &WriteOptions::default());
    let data = std::fs::read(&path).unwrap();
    assert!(data.len() > 100);
}

#[test]
fn group_with_children() {
    let pixels = vec![128u8; 2 * 2 * 4];
    let psd = Psd {
        width: 10, height: 10,
        children: vec![Layer {
            name: "MyGroup".to_string(),
            opened: true,
            children: Some(vec![
                Layer {
                    name: "Child1".to_string(),
                    top: 0, left: 0, bottom: 2, right: 2,
                    image_data: Some(ImageData { width: 2, height: 2, data: pixels.clone() }),
                    ..Layer::default()
                },
                Layer {
                    name: "Child2".to_string(),
                    top: 3, left: 3, bottom: 5, right: 5,
                    hidden: true,
                    ..Layer::default()
                },
            ]),
            ..Layer::default()
        }],
    };
    let path = write_to_tmp("group", &psd, &WriteOptions::default());
    let data = std::fs::read(&path).unwrap();
    assert!(data.len() > 200);
}

#[test]
fn blend_mode_and_opacity() {
    let pixels = vec![200u8; 3 * 3 * 4];
    let psd = Psd {
        width: 10, height: 10,
        children: vec![Layer {
            name: "Semi".to_string(),
            top: 0, left: 0, bottom: 3, right: 3,
            opacity: 128,
            blend_mode: BlendMode::Multiply,
            image_data: Some(ImageData { width: 3, height: 3, data: pixels }),
            ..Layer::default()
        }],
    };
    let path = write_to_tmp("blend", &psd, &WriteOptions::default());
    let data = std::fs::read(&path).unwrap();
    assert!(data.len() > 100);
}

#[test]
fn text_layer() {
    let psd = Psd {
        width: 100, height: 100,
        children: vec![Layer {
            name: "Hello".to_string(),
            text: Some(TextData {
                text: "Hello World".to_string(),
                transform: [1.0, 0.0, 0.0, 1.0, 10.0, 50.0],
                style: TextStyle {
                    font_name: "ArialMT".to_string(),
                    font_size: 24.0,
                    fill_color: Color { r: 0, g: 0, b: 0 },
                    ..TextStyle::default()
                },
                paragraph_style: ParagraphStyle { justification: "left".to_string() },
                style_runs: None,
                anti_alias: "smooth".to_string(),
            }),
            ..Layer::default()
        }],
    };
    let path = write_to_tmp("text", &psd, &WriteOptions { invalidate_text_layers: true, ..Default::default() });
    let data = std::fs::read(&path).unwrap();
    assert!(data.len() > 200);
}

#[test]
fn thumbnail_generation() {
    let psd = Psd { width: 50, height: 50, children: vec![] };
    let with = write_psd(&psd, &WriteOptions { generate_thumbnail: true, ..Default::default() });
    let without = write_psd(&psd, &WriteOptions::default());
    assert!(with.len() > without.len(), "thumbnail should increase file size");
}
