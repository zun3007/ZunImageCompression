declare module "omggif" {
  export class GifWriter {
    public constructor(
      buffer: Uint8Array,
      width: number,
      height: number,
      globalPalette?: { loop?: number; palette?: number[] }
    );

    public addFrame(
      x: number,
      y: number,
      width: number,
      height: number,
      indexedPixels: Uint8Array,
      options?: { delay?: number; palette?: number[] }
    ): void;

    public end(): number;
  }
}
