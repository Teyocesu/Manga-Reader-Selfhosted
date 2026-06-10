import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { extractArchive, validateArchiveFilename } from "../archive.js";
import { config, maxUploadBytes } from "../config.js";
import { createImportedChapter, getOrCreateManga } from "../db.js";
import {
  ensureStorageDirs,
  libraryDir,
  relativeStoragePath,
  removeQuietly,
  tempDir
} from "../storage.js";

await ensureStorageDirs();

const upload = multer({
  dest: tempDir,
  limits: {
    fileSize: maxUploadBytes,
    files: 1
  },
  fileFilter: (_req, file, callback) => {
    try {
      validateArchiveFilename(file.originalname);
      callback(null, true);
    } catch (error) {
      callback(error);
    }
  }
});

export const uploadRouter = Router();

export function uploadLimitErrorMessage() {
  return `File too large. Max allowed size is ${config.maxUploadMb} MB.`;
}

function cleanTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function pageFilename(index, extension) {
  return `${String(index + 1).padStart(4, "0")}${extension}`;
}

uploadRouter.post("/upload", upload.single("archive"), async (req, res, next) => {
  let extractDir;
  let chapterDir;

  try {
    const mangaTitle = cleanTitle(req.body.mangaTitle);
    const chapterTitle = cleanTitle(req.body.chapterTitle);

    if (!mangaTitle || !chapterTitle) {
      return res.status(400).json({ error: "Manga title and chapter title are required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Archive file is required" });
    }

    const chapterId = randomUUID();
    extractDir = path.join(tempDir, `extract-${chapterId}`);
    const extractedPages = await extractArchive(
      req.file.path,
      req.file.originalname,
      extractDir
    );

    const manga = getOrCreateManga(mangaTitle);
    chapterDir = path.join(libraryDir, manga.id, chapterId);
    await mkdir(chapterDir, { recursive: true });

    const pages = [];
    for (const [index, page] of extractedPages.entries()) {
      const filename = pageFilename(index, page.extension);
      const finalPath = path.join(chapterDir, filename);
      await rename(page.tempPath, finalPath);
      pages.push({
        pageIndex: index,
        filename,
        storagePath: relativeStoragePath(finalPath),
        mimeType: page.mimeType
      });
    }

    const chapter = createImportedChapter({
      mangaId: manga.id,
      chapterId,
      chapterTitle,
      originalFilename: req.file.originalname,
      chapterStoragePath: relativeStoragePath(chapterDir),
      pages
    });

    res.status(201).json(chapter);
  } catch (error) {
    await removeQuietly(chapterDir);
    next(error);
  } finally {
    await removeQuietly(extractDir);
    await removeQuietly(req.file?.path);
  }
});
