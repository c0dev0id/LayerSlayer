import { answerReason } from '../state/net';

/**
 * Whether a raster tile's answer is a whole image before the map decodes and keeps it. A
 * proxy or server can answer 200 with a page of text, nothing, or an image cut off on the
 * way; the map would only say that the image could not be decoded, and the tile cache would
 * keep the broken answer for a day.
 */

const bytesAt = (data: Uint8Array, at: number, length: number) => String.fromCharCode(...data.subarray(at, at + length));

/** What is wrong with a tile's answer for an image, or undefined where it is a whole image or a kind this does not know. */
export function imageProblem(buffer: ArrayBuffer): string | undefined {
  const data = new Uint8Array(buffer);
  if (data.length === 0) return 'nothing';
  const end = data.length;
  if (bytesAt(data, 0, 8) === '\x89PNG\r\n\x1a\n') {
    // The last chunk is IEND: its length (0), its type and its checksum.
    return bytesAt(data, end - 8, 4) === 'IEND' ? undefined : 'a PNG image that is cut off';
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    // Some encoders pad after the end marker, so it is looked for near the end.
    for (let i = end - 2; i >= Math.max(2, end - 64); i--) if (data[i] === 0xff && data[i + 1] === 0xd9) return undefined;
    return 'a JPEG image that is cut off';
  }
  if (bytesAt(data, 0, 4) === 'GIF8') return data[end - 1] === 0x3b ? undefined : 'a GIF image that is cut off';
  if (bytesAt(data, 0, 4) === 'RIFF' && bytesAt(data, 8, 4) === 'WEBP') {
    const size = new DataView(buffer).getUint32(4, true);
    return end >= size + 8 ? undefined : 'a WebP image that is cut off';
  }
  // Text where an image should be: an error page or message. SVG is text and an image.
  const start = new TextDecoder().decode(data.subarray(0, 200)).trim();
  if (/^(<\?xml[^>]*>\s*)?<svg/i.test(start)) return undefined;
  if (!/^[<{[]/.test(start) && !/^[\x20-\x7e\s]{16}/.test(start)) return undefined;
  // A service's error, such as a WMS exception sent as an image, says what went wrong.
  const reason = data.length < 10_000 ? answerReason(new TextDecoder().decode(data)) : undefined;
  return `text instead of an image (“${(reason ?? start).slice(0, 80)}”)`;
}
