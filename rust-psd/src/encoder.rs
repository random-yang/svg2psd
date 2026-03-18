/// Binary writer for PSD format (big-endian)
pub struct PsdEncoder {
    buf: Vec<u8>,
}

impl PsdEncoder {
    pub fn new() -> Self {
        Self {
            buf: Vec::with_capacity(4096),
        }
    }

    pub fn write_u8(&mut self, v: u8) {
        self.buf.push(v);
    }

    pub fn write_u16(&mut self, v: u16) {
        self.buf.extend_from_slice(&v.to_be_bytes());
    }

    pub fn write_u32(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_be_bytes());
    }

    pub fn write_i16(&mut self, v: i16) {
        self.buf.extend_from_slice(&v.to_be_bytes());
    }

    pub fn write_i32(&mut self, v: i32) {
        self.buf.extend_from_slice(&v.to_be_bytes());
    }

    pub fn write_f64(&mut self, v: f64) {
        self.buf.extend_from_slice(&v.to_be_bytes());
    }

    pub fn write_bytes(&mut self, data: &[u8]) {
        self.buf.extend_from_slice(data);
    }

    /// Write an ASCII string padded/truncated to exactly `len` bytes
    pub fn write_ascii(&mut self, s: &str, len: usize) {
        let bytes = s.as_bytes();
        if bytes.len() >= len {
            self.buf.extend_from_slice(&bytes[..len]);
        } else {
            self.buf.extend_from_slice(bytes);
            self.buf.resize(self.buf.len() + (len - bytes.len()), 0);
        }
    }

    /// Write a Pascal string: length byte + string bytes + padding to alignment
    pub fn write_pascal_string(&mut self, s: &str, padding: usize) {
        let bytes = s.as_bytes();
        let len = bytes.len().min(255);
        self.write_u8(len as u8);
        self.buf.extend_from_slice(&bytes[..len]);
        // Pad so that total (1 + len) is a multiple of `padding`
        let total = 1 + len;
        if padding > 0 {
            let remainder = total % padding;
            if remainder != 0 {
                let pad = padding - remainder;
                for _ in 0..pad {
                    self.write_u8(0);
                }
            }
        }
    }

    /// Write a Unicode string: length u32 (in chars) + UTF-16BE code units
    pub fn write_unicode_string(&mut self, s: &str) {
        let utf16: Vec<u16> = s.encode_utf16().collect();
        self.write_u32(utf16.len() as u32);
        for &unit in &utf16 {
            self.write_u16(unit);
        }
    }

    pub fn len(&self) -> usize {
        self.buf.len()
    }

    pub fn position(&self) -> usize {
        self.buf.len()
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.buf
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.buf
    }

    /// Write a 0u32 placeholder and return its position for later filling
    pub fn write_placeholder_u32(&mut self) -> usize {
        let pos = self.buf.len();
        self.write_u32(0);
        pos
    }

    /// Fill a previously written u32 placeholder with (current_pos - pos - 4)
    pub fn fill_length_u32(&mut self, pos: usize) {
        let length = (self.buf.len() - pos - 4) as u32;
        let bytes = length.to_be_bytes();
        self.buf[pos] = bytes[0];
        self.buf[pos + 1] = bytes[1];
        self.buf[pos + 2] = bytes[2];
        self.buf[pos + 3] = bytes[3];
    }

    /// Pad to even byte boundary
    pub fn pad_to_even(&mut self) {
        if self.buf.len() % 2 != 0 {
            self.write_u8(0);
        }
    }
}

impl Default for PsdEncoder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_u8() {
        let mut enc = PsdEncoder::new();
        enc.write_u8(0xAB);
        assert_eq!(enc.as_bytes(), &[0xAB]);
    }

    #[test]
    fn test_write_u16_big_endian() {
        let mut enc = PsdEncoder::new();
        enc.write_u16(0x1234);
        assert_eq!(enc.as_bytes(), &[0x12, 0x34]);
    }

    #[test]
    fn test_write_u32_big_endian() {
        let mut enc = PsdEncoder::new();
        enc.write_u32(0x12345678);
        assert_eq!(enc.as_bytes(), &[0x12, 0x34, 0x56, 0x78]);
    }

    #[test]
    fn test_write_i16() {
        let mut enc = PsdEncoder::new();
        enc.write_i16(-1);
        assert_eq!(enc.as_bytes(), &[0xFF, 0xFF]);
    }

    #[test]
    fn test_write_i32() {
        let mut enc = PsdEncoder::new();
        enc.write_i32(-1);
        assert_eq!(enc.as_bytes(), &[0xFF, 0xFF, 0xFF, 0xFF]);
    }

    #[test]
    fn test_write_f64() {
        let mut enc = PsdEncoder::new();
        enc.write_f64(1.0);
        assert_eq!(enc.as_bytes(), &1.0_f64.to_be_bytes());
    }

    #[test]
    fn test_write_ascii() {
        let mut enc = PsdEncoder::new();
        enc.write_ascii("AB", 4);
        assert_eq!(enc.as_bytes(), &[b'A', b'B', 0, 0]);
    }

    #[test]
    fn test_write_ascii_truncate() {
        let mut enc = PsdEncoder::new();
        enc.write_ascii("ABCDE", 3);
        assert_eq!(enc.as_bytes(), &[b'A', b'B', b'C']);
    }

    #[test]
    fn test_write_pascal_string_padding_4() {
        let mut enc = PsdEncoder::new();
        // "AB" -> len=2, total=3, pad to 4 -> 1 zero
        enc.write_pascal_string("AB", 4);
        assert_eq!(enc.as_bytes(), &[2, b'A', b'B', 0]);
    }

    #[test]
    fn test_write_pascal_string_empty_padding_2() {
        let mut enc = PsdEncoder::new();
        // "" -> len=0, total=1, pad to 2 -> 1 zero
        enc.write_pascal_string("", 2);
        assert_eq!(enc.as_bytes(), &[0, 0]);
    }

    #[test]
    fn test_write_unicode_string() {
        let mut enc = PsdEncoder::new();
        enc.write_unicode_string("Hi");
        // length=2, then 'H'=0x0048, 'i'=0x0069
        assert_eq!(enc.as_bytes(), &[0, 0, 0, 2, 0, 0x48, 0, 0x69]);
    }

    #[test]
    fn test_placeholder_and_fill() {
        let mut enc = PsdEncoder::new();
        enc.write_u8(0xFF); // 1 byte before
        let pos = enc.write_placeholder_u32(); // position 1
        enc.write_u8(0xAA); // 1 byte after placeholder
        enc.write_u8(0xBB); // 1 more byte
        enc.fill_length_u32(pos); // should write 2 (2 bytes after the u32)
        assert_eq!(enc.as_bytes()[pos..pos + 4], [0, 0, 0, 2]);
    }

    #[test]
    fn test_pad_to_even() {
        let mut enc = PsdEncoder::new();
        enc.write_u8(0x01);
        assert_eq!(enc.len(), 1);
        enc.pad_to_even();
        assert_eq!(enc.len(), 2);
        enc.pad_to_even(); // already even, no-op
        assert_eq!(enc.len(), 2);
    }
}
