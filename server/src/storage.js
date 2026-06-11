import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");
export const storageDir = path.join(rootDir, "storage");
export const tempDir = path.join(storageDir, ".tmp");
export const libraryDir = path.join(storageDir, "library");
export const thumbnailsDir = path.join(storageDir, "thumbnails");

export async function ensureStorageDirs() {
  await mkdir(tempDir, { recursive: true });
  await mkdir(libraryDir, { recursive: true });
  await mkdir(thumbnailsDir, { recursive: true });
}

export function relativeStoragePath(absolutePath) {
  return path.relative(storageDir, absolutePath).split(path.sep).join("/");
}

export function resolveStoragePath(relativePath) {
  const resolved = path.resolve(storageDir, relativePath);
  const root = path.resolve(storageDir);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage path");
  }

  return resolved;
}

export async function removeQuietly(targetPath) {
  if (!targetPath) {
    return;
  }

  await rm(targetPath, { recursive: true, force: true });
}
