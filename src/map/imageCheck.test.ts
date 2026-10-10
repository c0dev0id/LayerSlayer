import { describe, expect, it } from 'vitest';
import { imageProblem } from './imageCheck';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p))).buffer;
const png = bytes('\x89PNG\r\n\x1a\n', [0, 0, 0, 13], 'IHDR', new Array(17).fill(0), [0, 0, 0, 0], 'IEND', [0xae, 0x42, 0x60, 0x82]);

describe('imageProblem', () => {
  it('takes whole PNG, JPEG, GIF and WebP images', () => {
    expect(imageProblem(png)).toBeUndefined();
    expect(imageProblem(bytes([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]))).toBeUndefined();
    expect(imageProblem(bytes([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9, 0, 0, 0]))).toBeUndefined();
    expect(imageProblem(bytes('GIF89a', [1, 2, 3, 0x3b]))).toBeUndefined();
    expect(imageProblem(bytes('RIFF', [8, 0, 0, 0], 'WEBP', 'VP8 '))).toBeUndefined();
  });

  it('tells images cut off on the way', () => {
    expect(imageProblem(png.slice(0, 40))).toBe('a PNG image that is cut off');
    expect(imageProblem(bytes([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))).toBe('a JPEG image that is cut off');
    expect(imageProblem(bytes('GIF89a', [1, 2, 3]))).toBe('a GIF image that is cut off');
    expect(imageProblem(bytes('RIFF', [100, 0, 0, 0], 'WEBP', 'VP8 '))).toBe('a WebP image that is cut off');
  });

  it('tells nothing and text where an image should be', () => {
    expect(imageProblem(new ArrayBuffer(0))).toBe('nothing');
    expect(imageProblem(bytes('<html><body>Bad gateway</body></html>'))).toBe('text instead of an image (“<html><body>Bad gateway</body></html>”)');
    expect(imageProblem(bytes('Upstream fetch failed: timeout'))).toMatch(/^text instead of an image/);
    const exception = '<?xml version="1.0"?><ServiceExceptionReport><ServiceException code="LayerNotDefined">Unknown layer x</ServiceException></ServiceExceptionReport>';
    expect(imageProblem(bytes(exception))).toBe('text instead of an image (“Unknown layer x”)');
  });

  it('lets kinds of image it does not know through', () => {
    expect(imageProblem(bytes([0, 0, 0, 0x1c], 'ftypavif', [1, 2, 3]))).toBeUndefined();
    expect(imageProblem(bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
  });
});
