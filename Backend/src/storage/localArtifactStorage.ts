import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, parse } from "node:path";

import { cleanupDirectory, fileExists, openReadStream } from "../utils/fs.js";

export class LocalArtifactStorage {
  public constructor(private readonly baseDir: string) {}

  public async writeArtifact(
    jobId: string,
    itemId: string,
    outputFilename: string,
    buffer: Buffer
  ): Promise<string> {
    const extension = extname(outputFilename) || ".bin";
    const targetPath = join(this.baseDir, jobId, `${itemId}${extension}`);

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);

    return targetPath;
  }

  public openReadStream(filePath: string) {
    return openReadStream(filePath);
  }

  public async exists(filePath: string): Promise<boolean> {
    return fileExists(filePath);
  }

  public async cleanupExpired(ttlMs: number): Promise<void> {
    await cleanupDirectory(this.baseDir, ttlMs);
  }

  public buildOutputFilename(originalFilename: string, extension: string): string {
    return `${parse(originalFilename).name}.${extension}`;
  }
}
