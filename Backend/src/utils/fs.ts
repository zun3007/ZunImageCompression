import { createReadStream } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export const openReadStream = (filePath: string) => createReadStream(filePath);

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

export const cleanupDirectory = async (
  directoryPath: string,
  ttlMs: number,
  now = Date.now()
): Promise<void> => {
  const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => []);

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await cleanupDirectory(entryPath, ttlMs, now);
        const remainingEntries = await readdir(entryPath).catch(() => []);
        if (remainingEntries.length === 0) {
          await rm(entryPath, { recursive: true, force: true });
        }
        return;
      }

      const metadata = await stat(entryPath).catch(() => null);
      if (!metadata) {
        return;
      }

      if (now - metadata.mtimeMs >= ttlMs) {
        await rm(entryPath, { force: true });
      }
    })
  );
};
