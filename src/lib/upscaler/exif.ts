/**
 * Minimal JPEG EXIF handling — zero dependencies, runs on the main thread
 * (segment extraction) and inside the Web Worker (segment injection).
 *
 * PixelForge re-encodes pixels through a canvas, which always strips metadata.
 * When the user opts in, the original EXIF APP1 segment is copied into the
 * upscaled JPEG so camera dates, device info and GPS survive the pipeline.
 */

/** Extracts the raw APP1 "Exif" segment (marker+length+payload) from a JPEG File. */
export async function extractExifSegment(file: File): Promise<ArrayBuffer | null> {
  try {
    const isJpeg =
      /image\/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name);
    if (!isJpeg) return null;
    // APP1 segments live in the header; 256 KB covers every camera file in practice.
    const head = new Uint8Array(await file.slice(0, 262_144).arrayBuffer());
    if (head[0] !== 0xff || head[1] !== 0xd8) return null; // not a JPEG
    let i = 2;
    while (i + 4 <= head.length) {
      if (head[i] !== 0xff) return null; // lost marker sync — bail safely
      const marker = head[i + 1];
      // standalone markers without a length field
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (head[i + 2] << 8) | head[i + 3];
      if (len < 2) return null;
      if (marker === 0xe1) {
        const s = head;
        const isExif =
          s[i + 4] === 0x45 && s[i + 5] === 0x78 && s[i + 6] === 0x69 && s[i + 7] === 0x66 &&
          s[i + 8] === 0x00 && s[i + 9] === 0x00; // "Exif\0\0"
        if (isExif) return head.slice(i, i + 2 + len).buffer;
      }
      if (marker === 0xda) return null; // start of scan — EXIF must precede it
      i += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Rewrites the EXIF Orientation tag (0x0112) to 1 (upright). The canvas
 * pipeline already bakes the rotation into the pixels — leaving the tag in
 * would make viewers rotate the upscaled image a second time.
 */
export function normalizeExifOrientation(segment: Uint8Array): Uint8Array {
  try {
    const u16 = (o: number) => (segment[o] << 8) | segment[o + 1];
    // TIFF header starts after the 6-byte "Exif\0\0" signature (offset 2+6 in the APP1 segment)
    const tiff = 10;
    if (tiff + 8 > segment.length) return segment;
    const little = segment[tiff] === 0x49 && segment[tiff + 1] === 0x49;
    const rd16 = little
      ? (o: number) => segment[o] | (segment[o + 1] << 8)
      : u16;
    const rd32 = little
      ? (o: number) => segment[o] | (segment[o + 1] << 8) | (segment[o + 2] << 16) | (segment[o + 3] << 24)
      : (o: number) => (segment[o] << 24) | (segment[o + 1] << 16) | (segment[o + 2] << 8) | segment[o + 3];
    const ifd0 = tiff + rd32(tiff + 4);
    if (ifd0 + 2 > segment.length) return segment;
    const count = rd16(ifd0);
    for (let e = 0; e < count; e++) {
      const entry = ifd0 + 2 + e * 12;
      if (entry + 12 > segment.length) return segment;
      if (rd16(entry) === 0x0112) {
        // value offset field holds the SHORT inline (little- or big-endian)
        const v = entry + 8;
        segment[v] = 1;
        segment[v + 1] = 0;
        if (!little) {
          segment[v] = 0;
          segment[v + 1] = 1;
        }
        return segment;
      }
    }
  } catch {
    /* malformed EXIF — ship it unchanged rather than failing the job */
  }
  return segment;
}

/** Splices a (normalized) APP1 EXIF segment into an encoded JPEG blob. */
export async function jpegWithExif(jpeg: Blob, exifSegment: ArrayBuffer): Promise<Blob> {
  try {
    const src = new Uint8Array(await jpeg.arrayBuffer());
    if (src[0] !== 0xff || src[1] !== 0xd8) return jpeg;
    if (src[2] === 0xff && src[3] === 0xe1) return jpeg; // already carries EXIF
    const seg = normalizeExifOrientation(new Uint8Array(exifSegment));
    const out = new Uint8Array(src.length + seg.length);
    out.set(src.subarray(0, 2), 0); // SOI
    out.set(seg, 2);
    out.set(src.subarray(2), 2 + seg.length);
    return new Blob([out], { type: 'image/jpeg' });
  } catch {
    return jpeg; // never fail a finished job over metadata
  }
}
