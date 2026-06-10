import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

const allowedImageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

const maxPages = 500;
const maxUncompressedBytes = 600 * 1024 * 1024;
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

function isSupportedArchive(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext === ".zip" || ext === ".cbz";
}

function isSkippableMetadata(entryName) {
  const base = path.posix.basename(entryName);
  return (
    entryName.startsWith("__MACOSX/") ||
    base === ".DS_Store" ||
    base === "Thumbs.db"
  );
}

function assertSafeEntryName(entryName) {
  if (
    entryName.includes("\\") ||
    entryName.includes("\0") ||
    entryName.startsWith("/") ||
    /^[a-zA-Z]:/.test(entryName)
  ) {
    throw new Error(`Unsafe archive entry path: ${entryName}`);
  }

  const parts = entryName.split("/");
  if (parts.some((part) => part === ".." || /[\x00-\x1f]/.test(part))) {
    throw new Error(`Unsafe archive entry path: ${entryName}`);
  }
}

function openZip(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      filePath,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zipfile) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(zipfile);
      }
    );
  });
}

function readEntry(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stream);
    });
  });
}

export function validateArchiveFilename(filename) {
  if (!isSupportedArchive(filename)) {
    throw new Error("Only .zip and .cbz files are supported");
  }
}

export async function extractArchive(filePath, originalFilename, outputDir) {
  validateArchiveFilename(originalFilename);
  await mkdir(outputDir, { recursive: true });

  const zipfile = await openZip(filePath);
  const discovered = [];
  let totalBytes = 0;

  try {
    await new Promise((resolve, reject) => {
      zipfile.readEntry();

      zipfile.on("entry", async (entry) => {
        try {
          const entryName = entry.fileName;
          assertSafeEntryName(entryName);

          if (/\/$/.test(entryName) || isSkippableMetadata(entryName)) {
            zipfile.readEntry();
            return;
          }

          const ext = path.extname(entryName).toLowerCase();
          const mimeType = allowedImageTypes.get(ext);
          if (!mimeType) {
            throw new Error(`Unsupported file in archive: ${entryName}`);
          }

          totalBytes += entry.uncompressedSize || 0;
          if (totalBytes > maxUncompressedBytes) {
            throw new Error("Archive is too large after extraction");
          }

          if (discovered.length >= maxPages) {
            throw new Error(`Archive exceeds ${maxPages} pages`);
          }

          const tempName = `${String(discovered.length + 1).padStart(4, "0")}${ext}`;
          const tempPath = path.join(outputDir, tempName);
          const readStream = await readEntry(zipfile, entry);
          await pipeline(readStream, createWriteStream(tempPath));

          const fileInfo = await stat(tempPath);
          if (fileInfo.size === 0) {
            throw new Error(`Empty image in archive: ${entryName}`);
          }

          discovered.push({
            originalPath: entryName,
            tempPath,
            extension: ext,
            mimeType
          });

          zipfile.readEntry();
        } catch (error) {
          reject(error);
        }
      });

      zipfile.once("end", resolve);
      zipfile.once("error", reject);
    });
  } finally {
    zipfile.close();
  }

  discovered.sort((a, b) => collator.compare(a.originalPath, b.originalPath));

  if (discovered.length === 0) {
    throw new Error("Archive has no supported images");
  }

  return discovered;
}
