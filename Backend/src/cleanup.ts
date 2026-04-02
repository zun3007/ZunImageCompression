import { cleanupDirectory } from "./utils/fs.js";

export const startCleanupLoop = (options: {
  uploadTmpDir: string;
  artifactDir: string;
  ttlMs: number;
  intervalMs?: number;
}) => {
  const intervalId = setInterval(async () => {
    await Promise.all([
      cleanupDirectory(options.uploadTmpDir, options.ttlMs),
      cleanupDirectory(options.artifactDir, options.ttlMs)
    ]).catch(() => undefined);
  }, options.intervalMs ?? 60_000);

  return () => {
    clearInterval(intervalId);
  };
};
