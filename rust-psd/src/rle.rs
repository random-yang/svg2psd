/// Compress a single scanline using PackBits RLE encoding.
///
/// PackBits algorithm:
/// - Runs of 3+ identical bytes: (257 - run_length) as u8, then the repeated byte (max run 128)
/// - Literal sequences: (count - 1) as u8, then the literal bytes (max count 128)
pub fn pack_bits(data: &[u8]) -> Vec<u8> {
    let mut result = Vec::new();
    let len = data.len();
    let mut i = 0;

    while i < len {
        // Check for a run of identical bytes
        let mut run_len = 1;
        while i + run_len < len && run_len < 128 && data[i + run_len] == data[i] {
            run_len += 1;
        }

        if run_len >= 3 {
            // Encode as a run
            result.push((257 - run_len) as u8);
            result.push(data[i]);
            i += run_len;
        } else {
            // Collect literal bytes
            let start = i;
            let mut lit_len = 0;

            while i < len && lit_len < 128 {
                // Check if a run of 3+ starts here
                if i + 2 < len && data[i] == data[i + 1] && data[i] == data[i + 2] {
                    break;
                }
                i += 1;
                lit_len += 1;
            }

            if lit_len == 0 {
                // Edge case: we have a short run (1-2 identical bytes), treat as literal
                result.push(0); // literal count 1 -> header byte 0
                result.push(data[i]);
                i += 1;
            } else {
                result.push((lit_len - 1) as u8);
                result.extend_from_slice(&data[start..start + lit_len]);
            }
        }
    }

    result
}

/// Compress a full channel's data using RLE.
/// `data` contains the raw bytes for one channel, row by row (width bytes per row).
/// Returns (byte_counts_per_row, all_compressed_data).
pub fn compress_channel_rle(data: &[u8], width: u32, height: u32) -> (Vec<u16>, Vec<u8>) {
    let w = width as usize;
    let h = height as usize;
    let mut byte_counts = Vec::with_capacity(h);
    let mut compressed = Vec::new();

    for row in 0..h {
        let start = row * w;
        let end = (start + w).min(data.len());
        let row_data = if start < data.len() {
            &data[start..end]
        } else {
            &[]
        };
        let row_compressed = pack_bits(row_data);
        byte_counts.push(row_compressed.len() as u16);
        compressed.extend_from_slice(&row_compressed);
    }

    (byte_counts, compressed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_bits_run() {
        // 5 identical bytes: header = 257-5 = 252, then the byte
        let data = vec![0xAA; 5];
        let result = pack_bits(&data);
        assert_eq!(result, vec![252, 0xAA]);
    }

    #[test]
    fn test_pack_bits_literal() {
        let data = vec![1, 2, 3, 4];
        let result = pack_bits(&data);
        // literal of length 4: header = 3, then the bytes
        assert_eq!(result, vec![3, 1, 2, 3, 4]);
    }

    #[test]
    fn test_pack_bits_mixed() {
        // 3 literals, then a run of 4
        let data = vec![1, 2, 3, 0xBB, 0xBB, 0xBB, 0xBB];
        let result = pack_bits(&data);
        // literal: header=2, bytes=[1,2,3], run: header=253, byte=0xBB
        assert_eq!(result, vec![2, 1, 2, 3, 253, 0xBB]);
    }

    #[test]
    fn test_pack_bits_empty() {
        let result = pack_bits(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_pack_bits_single() {
        let result = pack_bits(&[42]);
        assert_eq!(result, vec![0, 42]);
    }

    #[test]
    fn test_pack_bits_two_same() {
        // Two identical bytes — not enough for a run (min 3), treated as literal
        let result = pack_bits(&[5, 5]);
        assert_eq!(result, vec![1, 5, 5]);
    }

    #[test]
    fn test_compress_channel_rle() {
        let width = 4u32;
        let height = 2u32;
        // Row 0: [1, 2, 3, 4], Row 1: [5, 5, 5, 5]
        let data = vec![1, 2, 3, 4, 5, 5, 5, 5];
        let (counts, compressed) = compress_channel_rle(&data, width, height);
        assert_eq!(counts.len(), 2);
        // Row 0 is all literal: header=3, then 4 bytes -> 5 bytes
        assert_eq!(counts[0], 5);
        // Row 1 is a run of 4: header=253, byte -> 2 bytes
        assert_eq!(counts[1], 2);
        assert_eq!(compressed.len(), 7);
    }

    #[test]
    fn test_pack_bits_long_run_max_128() {
        // Run of 200 identical bytes should be split into 128 + 72
        let data = vec![0xFF; 200];
        let result = pack_bits(&data);
        // First run: 128 -> header = 257-128 = 129
        // Second run: 72 -> header = 257-72 = 185
        assert_eq!(result, vec![129, 0xFF, 185, 0xFF]);
    }
}
