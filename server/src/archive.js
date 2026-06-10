import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createExtractorFromData } from "node-unrar-js";
import yauzl from "yauzl";
import { config, maxUploadBytes } from "./config.js";

const allowedImageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

const maxPages = config.maxImagesPerChapter;
const maxUncompressedBytes = maxUploadBytes;
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

function userInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isSupportedArchive(filename) {
  return getArchiveKind(filename) !== null;
}

function getArchiveKind(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".zip" || ext === ".cbz") {
    return "zip";
  }

  if (ext === ".rar" || ext === ".cbr") {
    return "rar";
  }

  return null;
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
    throw userInputError(`Unsafe archive entry path: ${entryName}`);
  }

  const parts = entryName.split("/");
  if (parts.some((part) => part === ".." || /[\x00-\x1f]/.test(part))) {
    throw userInputError(`Unsafe archive entry path: ${entryName}`);
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
    throw userInputError("Only .zip, .cbz, .rar and .cbr files are supported");
  }
}

function validateDiscoveredPage(discovered, entryName, ext, mimeType, size) {
  if (!mimeType) {
    throw userInputError(`Unsupported file in archive: ${entryName}`);
  }

  if (size === 0) {
    throw userInputError(`Empty image in archive: ${entryName}`);
  }

  if (discovered.length >= maxPages) {
    throw userInputError(`Archive exceeds ${maxPages} pages`);
  }
}

function finalizeDiscoveredPages(discovered) {
  discovered.sort((a, b) => collator.compare(a.originalPath, b.originalPath));

  if (discovered.length === 0) {
    throw userInputError("Archive has no supported images");
  }

  return discovered;
}

async function extractZipArchive(filePath, outputDir) {
  let zipfile;
  try {
    zipfile = await openZip(filePath);
  } catch {
    throw userInputError("Archive is corrupt or not a valid zip/cbz file");
  }

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
          totalBytes += entry.uncompressedSize || 0;
          if (totalBytes > maxUncompressedBytes) {
            throw userInputError("Archive is too large after extraction");
          }

          validateDiscoveredPage(
            discovered,
            entryName,
            ext,
            mimeType,
            entry.uncompressedSize || 0
          );

          const tempName = `${String(discovered.length + 1).padStart(4, "0")}${ext}`;
          const tempPath = path.join(outputDir, tempName);
          const readStream = await readEntry(zipfile, entry);
          await pipeline(readStream, createWriteStream(tempPath));

          const fileInfo = await stat(tempPath);
          if (fileInfo.size === 0) {
            throw userInputError(`Empty image in archive: ${entryName}`);
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

  return finalizeDiscoveredPages(discovered);
}

async function createRarExtractor(filePath) {
  try {
    const data = await readFile(filePath);
    const archiveData = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return await createExtractorFromData({ data: archiveData });
  } catch {
    throw userInputError("Archive is corrupt or not a valid rar/cbr file");
  }
}

function asRarUserError(error) {
  if (error?.statusCode) {
    return error;
  }

  return userInputError("Archive is corrupt or not a valid rar/cbr file");
}

async function extractRarArchive(filePath, outputDir) {
  const listExtractor = await createRarExtractor(filePath);
  try {
    const list = listExtractor.getFileList();

    if (list.arcHeader.flags.volume) {
      throw userInputError("Multi-volume RAR archives are not supported");
    }

    const headers = [...list.fileHeaders];
    const selectedHeaders = [];
    let totalBytes = 0;

    for (const header of headers) {
      const entryName = header.name;
      assertSafeEntryName(entryName);

      if (header.flags.directory || isSkippableMetadata(entryName)) {
        continue;
      }

      if (header.flags.encrypted) {
        throw userInputError(`Encrypted files are not supported: ${entryName}`);
      }

      const ext = path.extname(entryName).toLowerCase();
      const mimeType = allowedImageTypes.get(ext);
      totalBytes += header.unpSize || 0;
      if (totalBytes > maxUncompressedBytes) {
        throw userInputError("Archive is too large after extraction");
      }

      validateDiscoveredPage(selectedHeaders, entryName, ext, mimeType, header.unpSize || 0);
      selectedHeaders.push({
        originalPath: entryName,
        extension: ext,
        mimeType
      });
    }

    selectedHeaders.sort((a, b) => collator.compare(a.originalPath, b.originalPath));

    if (selectedHeaders.length === 0) {
      throw userInputError("Archive has no supported images");
    }

    const extractExtractor = await createRarExtractor(filePath);
    const extracted = extractExtractor.extract({
      files: selectedHeaders.map((header) => header.originalPath)
    });
    const extractedFiles = [...extracted.files];
    const extractedByName = new Map();

    for (const file of extractedFiles) {
      if (file.fileHeader.flags.directory || !file.extraction) {
        continue;
      }

      extractedByName.set(file.fileHeader.name, file.extraction);
    }

    const discovered = [];
    for (const [index, header] of selectedHeaders.entries()) {
      const bytes = extractedByName.get(header.originalPath);
      if (!bytes || bytes.byteLength === 0) {
        throw userInputError(`Empty image in archive: ${header.originalPath}`);
      }

      const tempName = `${String(index + 1).padStart(4, "0")}${header.extension}`;
      const tempPath = path.join(outputDir, tempName);
      await writeFile(tempPath, Buffer.from(bytes));

      discovered.push({
        originalPath: header.originalPath,
        tempPath,
        extension: header.extension,
        mimeType: header.mimeType
      });
    }

    return finalizeDiscoveredPages(discovered);
  } catch (error) {
    throw asRarUserError(error);
  }
}

export async function extractArchive(filePath, originalFilename, outputDir) {
  const archiveKind = getArchiveKind(originalFilename);
  validateArchiveFilename(originalFilename);
  await mkdir(outputDir, { recursive: true });

  if (archiveKind === "rar") {
    return extractRarArchive(filePath, outputDir);
  }

  return extractZipArchive(filePath, outputDir);
}
