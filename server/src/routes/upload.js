import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { extractArchiveChapters, validateArchiveFilename } from "../archive.js";
import { config, maxUploadBytes } from "../config.js";
import {
  createImportedChapter,
  deleteChapters,
  deleteMangaIfEmpty,
  findMangaByTitle,
  getManga,
  getOrCreateManga
} from "../db.js";
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
  let createdMangaId = null;
  const chapterDirs = [];
  const createdChapterIds = [];

  try {
    const mangaTitle = cleanTitle(req.body.mangaTitle);
    const chapterTitle = cleanTitle(req.body.chapterTitle);

    if (!mangaTitle || !chapterTitle) {
      return res.status(400).json({ error: "Manga title and chapter title are required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Archive file is required" });
    }

    const uploadId = randomUUID();
    extractDir = path.join(tempDir, `extract-${uploadId}`);
    const extractedChapters = await extractArchiveChapters(
      req.file.path,
      req.file.originalname,
      extractDir
    );

    const existingManga = findMangaByTitle(mangaTitle);
    const manga = getOrCreateManga(mangaTitle);
    if (!existingManga) {
      createdMangaId = manga.id;
    }

    const importedChapters = [];
    const isPack = extractedChapters.length > 1;

    for (const extractedChapter of extractedChapters) {
      const chapterId = randomUUID();
      const chapterDir = path.join(libraryDir, manga.id, chapterId);
      chapterDirs.push(chapterDir);
      await mkdir(chapterDir, { recursive: true });

      const pages = [];
      for (const [index, page] of extractedChapter.pages.entries()) {
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

      const importedChapter = createImportedChapter({
        mangaId: manga.id,
        chapterId,
        chapterTitle: isPack ? extractedChapter.chapterTitle : chapterTitle,
        originalFilename: isPack ? extractedChapter.originalFilename : req.file.originalname,
        chapterStoragePath: relativeStoragePath(chapterDir),
        pages
      });

      createdChapterIds.push(chapterId);
      importedChapters.push(importedChapter);
    }

    if (importedChapters.length === 1) {
      res.status(201).json(importedChapters[0]);
      return;
    }

    const updatedManga = getManga(manga.id);
    const { chapters: _chapters, ...mangaSummary } = updatedManga || manga;

    res.status(201).json({
      manga: mangaSummary,
      chapters: importedChapters.map((chapter) => chapter.chapter),
      totalChapters: importedChapters.length,
      totalPages: importedChapters.reduce(
        (total, chapter) => total + chapter.chapter.pageCount,
        0
      )
    });
  } catch (error) {
    try {
      deleteChapters(createdChapterIds);
      if (createdMangaId) {
        deleteMangaIfEmpty(createdMangaId);
      }
    } catch {
      // Keep the original upload error; storage cleanup still runs below.
    }

    await Promise.all(chapterDirs.map((chapterDir) => removeQuietly(chapterDir)));
    next(error);
  } finally {
    await removeQuietly(extractDir);
    await removeQuietly(req.file?.path);
  }
});
