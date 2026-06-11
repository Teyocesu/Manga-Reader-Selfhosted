import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
const nestedArchiveMessage =
  "This archive contains another comic archive inside. Extract it or upload the inner .cbr/.cbz directly.";
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

function userInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function logArchive(message) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[archive] ${message}`);
  }
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

function validateImageCandidate(images, entryName, mimeType, size) {
  if (!mimeType) {
    throw userInputError(`Unsupported file in archive: ${entryName}`);
  }

  if (size === 0) {
    throw userInputError(`Empty image in archive: ${entryName}`);
  }

  if (images.length >= maxPages) {
    throw userInputError(`Archive exceeds ${maxPages} pages`);
  }
}

function validateNestedArchiveCandidate(entryName, size) {
  if (size === 0) {
    throw userInputError(`Empty nested archive in archive: ${entryName}`);
  }

  if (size > maxUploadBytes) {
    throw userInputError("Archive is too large after extraction");
  }
}

function classifyEntries(entries) {
  const images = [];
  const nestedArchives = [];
  let totalImageBytes = 0;
  let totalNestedBytes = 0;

  for (const entry of entries) {
    assertSafeEntryName(entry.name);

    if (entry.directory || isSkippableMetadata(entry.name)) {
      continue;
    }

    if (entry.encrypted) {
      throw userInputError(`Encrypted files are not supported: ${entry.name}`);
    }

    const ext = path.extname(entry.name).toLowerCase();
    const mimeType = allowedImageTypes.get(ext);

    if (mimeType) {
      totalImageBytes += entry.size || 0;
      if (totalImageBytes > maxUncompressedBytes) {
        throw userInputError("Archive is too large after extraction");
      }

      validateImageCandidate(images, entry.name, mimeType, entry.size || 0);
      images.push({
        originalPath: entry.name,
        extension: ext,
        mimeType
      });
      continue;
    }

    if (isSupportedArchive(entry.name)) {
      totalNestedBytes += entry.size || 0;
      if (totalNestedBytes > maxUncompressedBytes) {
        throw userInputError("Archive is too large after extraction");
      }

      validateNestedArchiveCandidate(entry.name, entry.size || 0);
      nestedArchives.push({
        originalPath: entry.name,
        extension: ext
      });
      continue;
    }

    throw userInputError(`Unsupported file in archive: ${entry.name}`);
  }

  images.sort((a, b) => collator.compare(a.originalPath, b.originalPath));
  nestedArchives.sort((a, b) => collator.compare(a.originalPath, b.originalPath));

  return { images, nestedArchives };
}

function assertExtractionPlan({ images, nestedArchives }, depth, options = {}) {
  const { allowMultiChapterPack = false } = options;

  if (images.length > 0 && nestedArchives.length > 0) {
    throw userInputError(
      "Archive contains images and nested archives. Remove the nested archive or upload it directly."
    );
  }

  if (nestedArchives.length > 0 && depth >= 1) {
    throw userInputError(nestedArchiveMessage);
  }

  if (nestedArchives.length > 1 && !allowMultiChapterPack) {
    throw userInputError(
      "This archive contains multiple comic archives inside. Upload it as a pack or extract one inner archive and upload it directly."
    );
  }

  if (images.length === 0 && nestedArchives.length === 0) {
    throw userInputError("Archive has no supported images");
  }
}

function finalizeDiscoveredPages(discovered) {
  discovered.sort((a, b) => collator.compare(a.originalPath, b.originalPath));

  if (discovered.length === 0) {
    throw userInputError("Archive has no supported images");
  }

  return discovered;
}

export function sanitizeChapterTitleFromArchiveName(filename) {
  const baseName = path.posix.basename(filename);
  const extension = path.extname(baseName);
  const withoutExtension = extension ? baseName.slice(0, -extension.length) : baseName;
  const cleanTitle = withoutExtension.replace(/[\x00-\x1f]/g, "").trim().replace(/\s+/g, " ");

  return cleanTitle || "Chapter";
}

async function listZipEntries(filePath) {
  let zipfile;
  try {
    zipfile = await openZip(filePath);
  } catch {
    throw userInputError("Archive is corrupt or not a valid zip/cbz file");
  }

  try {
    return await new Promise((resolve, reject) => {
      const entries = [];
      zipfile.readEntry();

      zipfile.on("entry", (entry) => {
        entries.push({
          name: entry.fileName,
          size: entry.uncompressedSize || 0,
          directory: /\/$/.test(entry.fileName),
          encrypted: Boolean(entry.generalPurposeBitFlag & 0x1)
        });
        zipfile.readEntry();
      });

      zipfile.once("end", () => resolve(entries));
      zipfile.once("error", reject);
    });
  } finally {
    zipfile.close();
  }
}

async function extractZipTargets(filePath, targets) {
  let zipfile;
  try {
    zipfile = await openZip(filePath);
  } catch {
    throw userInputError("Archive is corrupt or not a valid zip/cbz file");
  }

  const targetsByName = new Map(targets.map((target) => [target.originalPath, target]));
  let written = 0;

  try {
    await new Promise((resolve, reject) => {
      zipfile.readEntry();

      zipfile.on("entry", async (entry) => {
        try {
          const target = targetsByName.get(entry.fileName);
          if (!target) {
            zipfile.readEntry();
            return;
          }

          const readStream = await readEntry(zipfile, entry);
          await pipeline(readStream, createWriteStream(target.tempPath));

          const fileInfo = await stat(target.tempPath);
          if (fileInfo.size === 0) {
            throw userInputError(`Empty file in archive: ${entry.fileName}`);
          }

          written += 1;
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

  if (written !== targets.length) {
    throw userInputError("Archive is corrupt or missing expected files");
  }
}

async function extractZipImages(filePath, outputDir, images) {
  const targets = images.map((image, index) => ({
    ...image,
    tempPath: path.join(outputDir, `${String(index + 1).padStart(4, "0")}${image.extension}`)
  }));

  await extractZipTargets(filePath, targets);

  return finalizeDiscoveredPages(targets);
}

async function extractNestedZipArchive(filePath, outputDir, nestedArchive, depth) {
  const nestedPath = path.join(outputDir, `__nested-${depth + 1}${nestedArchive.extension}`);
  await extractZipNestedArchive(filePath, nestedArchive, nestedPath);

  try {
    return await extractArchive(nestedPath, nestedArchive.originalPath, outputDir, depth + 1);
  } finally {
    await rm(nestedPath, { force: true });
  }
}

async function extractZipArchive(filePath, originalFilename, outputDir, depth) {
  const entries = await listZipEntries(filePath);
  const plan = classifyEntries(entries);
  assertExtractionPlan(plan, depth);

  if (plan.nestedArchives.length === 1) {
    logArchive(`Processing nested archive ${plan.nestedArchives[0].originalPath}`);
    return extractNestedZipArchive(filePath, outputDir, plan.nestedArchives[0], depth);
  }

  return extractZipImages(filePath, outputDir, plan.images);
}

async function extractZipNestedArchive(filePath, nestedArchive, nestedPath) {
  await extractZipTargets(filePath, [{ ...nestedArchive, tempPath: nestedPath }]);
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

async function listRarEntries(filePath) {
  const extractor = await createRarExtractor(filePath);

  try {
    const list = extractor.getFileList();

    if (list.arcHeader.flags.volume) {
      throw userInputError("Multi-volume RAR archives are not supported");
    }

    return [...list.fileHeaders].map((header) => ({
      name: header.name,
      size: header.unpSize || 0,
      directory: Boolean(header.flags.directory),
      encrypted: Boolean(header.flags.encrypted)
    }));
  } catch (error) {
    throw asRarUserError(error);
  }
}

async function extractRarFiles(filePath, targets) {
  const extractor = await createRarExtractor(filePath);

  try {
    const extracted = extractor.extract({
      files: targets.map((target) => target.originalPath)
    });
    const extractedFiles = [...extracted.files];
    const extractedByName = new Map();

    for (const file of extractedFiles) {
      if (file.fileHeader.flags.directory || !file.extraction) {
        continue;
      }

      extractedByName.set(file.fileHeader.name, file.extraction);
    }

    for (const target of targets) {
      const bytes = extractedByName.get(target.originalPath);
      if (!bytes || bytes.byteLength === 0) {
        throw userInputError(`Empty file in archive: ${target.originalPath}`);
      }

      await writeFile(target.tempPath, Buffer.from(bytes));
    }
  } catch (error) {
    throw asRarUserError(error);
  }
}

async function extractRarImages(filePath, outputDir, images) {
  const targets = images.map((image, index) => ({
    ...image,
    tempPath: path.join(outputDir, `${String(index + 1).padStart(4, "0")}${image.extension}`)
  }));

  await extractRarFiles(filePath, targets);

  return finalizeDiscoveredPages(targets);
}

async function extractNestedRarArchive(filePath, outputDir, nestedArchive, depth) {
  const nestedPath = path.join(outputDir, `__nested-${depth + 1}${nestedArchive.extension}`);
  await extractRarNestedArchive(filePath, nestedArchive, nestedPath);

  try {
    return await extractArchive(nestedPath, nestedArchive.originalPath, outputDir, depth + 1);
  } finally {
    await rm(nestedPath, { force: true });
  }
}

async function extractRarArchive(filePath, originalFilename, outputDir, depth) {
  try {
    const entries = await listRarEntries(filePath);
    const plan = classifyEntries(entries);
    assertExtractionPlan(plan, depth);

    if (plan.nestedArchives.length === 1) {
      logArchive(`Processing nested archive ${plan.nestedArchives[0].originalPath}`);
      return extractNestedRarArchive(filePath, outputDir, plan.nestedArchives[0], depth);
    }

    return extractRarImages(filePath, outputDir, plan.images);
  } catch (error) {
    throw asRarUserError(error);
  }
}

async function extractRarNestedArchive(filePath, nestedArchive, nestedPath) {
  await extractRarFiles(filePath, [{ ...nestedArchive, tempPath: nestedPath }]);
}

async function extractNestedArchiveFile(filePath, archiveKind, nestedArchive, nestedPath) {
  if (archiveKind === "rar") {
    await extractRarNestedArchive(filePath, nestedArchive, nestedPath);
    return;
  }

  await extractZipNestedArchive(filePath, nestedArchive, nestedPath);
}

export async function extractArchive(filePath, originalFilename, outputDir, depth = 0) {
  const archiveKind = getArchiveKind(originalFilename);
  validateArchiveFilename(originalFilename);
  await mkdir(outputDir, { recursive: true });

  logArchive(
    `${depth === 0 ? "Processing outer archive" : "Processing inner archive"} ${originalFilename}`
  );

  if (archiveKind === "rar") {
    return extractRarArchive(filePath, originalFilename, outputDir, depth);
  }

  return extractZipArchive(filePath, originalFilename, outputDir, depth);
}

export async function extractArchiveChapters(filePath, originalFilename, outputDir) {
  const archiveKind = getArchiveKind(originalFilename);
  validateArchiveFilename(originalFilename);
  await mkdir(outputDir, { recursive: true });

  logArchive(`Processing outer archive ${originalFilename}`);

  const entries = archiveKind === "rar"
    ? await listRarEntries(filePath)
    : await listZipEntries(filePath);
  const plan = classifyEntries(entries);
  assertExtractionPlan(plan, 0, { allowMultiChapterPack: true });

  if (plan.nestedArchives.length <= 1) {
    const chapterOutputDir = path.join(outputDir, "chapter-0001");
    const pages = await extractArchive(filePath, originalFilename, chapterOutputDir, 0);

    return [
      {
        chapterTitle: null,
        originalFilename,
        pages
      }
    ];
  }

  logArchive(`Processing multi-chapter pack with ${plan.nestedArchives.length} inner archives`);

  const chapters = [];
  const nestedOutputDir = path.join(outputDir, "nested-archives");
  await mkdir(nestedOutputDir, { recursive: true });

  for (const [index, nestedArchive] of plan.nestedArchives.entries()) {
    const chapterNumber = String(index + 1).padStart(4, "0");
    const nestedPath = path.join(nestedOutputDir, `${chapterNumber}${nestedArchive.extension}`);
    const chapterOutputDir = path.join(outputDir, `chapter-${chapterNumber}`);

    logArchive(`Processing pack item ${nestedArchive.originalPath}`);
    await extractNestedArchiveFile(filePath, archiveKind, nestedArchive, nestedPath);

    const pages = await extractArchive(
      nestedPath,
      nestedArchive.originalPath,
      chapterOutputDir,
      1
    );

    chapters.push({
      chapterTitle: sanitizeChapterTitleFromArchiveName(nestedArchive.originalPath),
      originalFilename: nestedArchive.originalPath,
      pages
    });
  }

  return chapters;
}
