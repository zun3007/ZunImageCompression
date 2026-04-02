import sharp from "sharp";
import { GifWriter } from "omggif";

export const createJpegBuffer = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 240,
      height: 180,
      channels: 3,
      background: { r: 180, g: 100, b: 60 }
    }
  })
    .jpeg({ quality: 92 })
    .toBuffer();

export const createPngBuffer = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 120,
      height: 120,
      channels: 4,
      background: { r: 40, g: 120, b: 200, alpha: 0.45 }
    }
  })
    .png()
    .toBuffer();

export const createAnimatedGifBuffer = (): Buffer => {
  const buffer = Buffer.alloc(1024);
  const writer = new GifWriter(buffer, 2, 1, {
    loop: 0,
    palette: [0xff0000, 0x0000ff]
  });

  writer.addFrame(0, 0, 2, 1, new Uint8Array([0, 1]), { delay: 10 });
  writer.addFrame(0, 0, 2, 1, new Uint8Array([1, 0]), { delay: 10 });

  return Buffer.from(buffer.subarray(0, writer.end()));
};
