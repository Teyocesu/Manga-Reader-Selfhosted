import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import {
  extractArchiveChapters,
  sanitizeChapterTitleFromArchiveName,
  validateArchiveFilename
} from "../archive.js";
import { config, maxUploadBytes } from "../config.js";
import {
  clearMangaThumbnailPath,
  createImportedChapter,
  deleteChapters,
  deleteMangaIfEmpty,
  findChapterByTitle,
  findMangaByTitle,
  getManga,
  getOrCreateManga,
  setMangaThumbnailPath
} from "../db.js";
import {
  ensureStorageDirs,
  libraryDir,
  relativeStoragePath,
  resolveStoragePath,
  removeQuietly,
  tempDir
} from "../storage.js";
import { createMangaThumbnail, selectRepresentativePage } from "../thumbnails.js";

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

function summarizeImport({ manga, importedChapters, skippedChapters }) {
  const updatedManga = getManga(manga.id);
  const { chapters: _chapters, ...mangaSummary } = updatedManga || manga;
  const totalPages = importedChapters.reduce(
    (total, chapter) => total + chapter.chapter.pageCount,
    0
  );
  const totalChapters = importedChapters.length;
  const totalSkipped = skippedChapters.length;

  let message = "";
  if (totalChapters > 0 && totalSkipped > 0) {
    message = `Se importaron ${totalChapters} capítulo${totalChapters === 1 ? "" : "s"} y se omitieron ${totalSkipped} duplicado${totalSkipped === 1 ? "" : "s"}.`;
  } else if (totalChapters === 0 && totalSkipped > 0) {
    message = `No se importaron capítulos nuevos: ${totalSkipped} ya existía${totalSkipped === 1 ? "" : "n"}.`;
  }

  return {
    manga: mangaSummary,
    chapters: importedChapters.map((chapter) => chapter.chapter),
    skippedChapters,
    totalChapters,
    totalPages,
    totalSkipped,
    message
  };
}

uploadRouter.post("/upload", upload.single("archive"), async (req, res, next) => {
  let extractDir;
  let createdMangaId = null;
  let createdThumbnailPath = null;
  let thumbnailMangaId = null;
  const chapterDirs = [];
  const createdChapterIds = [];

  try {
    const mangaTitle = cleanTitle(req.body.mangaTitle);
    const chapterTitle = cleanTitle(req.body.chapterTitle);

    if (!mangaTitle) {
      return res.status(400).json({ error: "Manga title is required" });
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

    if (!manga.thumbnailPath) {
      const representativePage = selectRepresentativePage(extractedChapters);
      if (representativePage) {
        try {
          createdThumbnailPath = await createMangaThumbnail({
            mangaId: manga.id,
            sourcePath: representativePage.tempPath
          });
          thumbnailMangaId = manga.id;
          setMangaThumbnailPath(manga.id, createdThumbnailPath);
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[thumbnail] Could not generate thumbnail: ${error.message}`);
          }
        }
      }
    }

    const importedChapters = [];
    const skippedChapters = [];
    const isPack = extractedChapters.length > 1;

    for (const extractedChapter of extractedChapters) {
      const finalChapterTitle = isPack
        ? extractedChapter.chapterTitle
        : chapterTitle || sanitizeChapterTitleFromArchiveName(req.file.originalname);
      const existingChapter = findChapterByTitle(manga.id, finalChapterTitle);

      if (existingChapter) {
        skippedChapters.push({
          title: finalChapterTitle,
          reason: "Ya existe un capítulo con ese título en este manga."
        });
        continue;
      }

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
        chapterTitle: finalChapterTitle,
        originalFilename: isPack ? extractedChapter.originalFilename : req.file.originalname,
        chapterStoragePath: relativeStoragePath(chapterDir),
        pages
      });

      createdChapterIds.push(chapterId);
      importedChapters.push(importedChapter);
    }

    if (importedChapters.length === 1 && skippedChapters.length === 0) {
      res.status(201).json(importedChapters[0]);
      return;
    }

    res.status(importedChapters.length > 0 ? 201 : 200).json(
      summarizeImport({ manga, importedChapters, skippedChapters })
    );
  } catch (error) {
    try {
      deleteChapters(createdChapterIds);
      if (createdMangaId) {
        deleteMangaIfEmpty(createdMangaId);
      }
      if (createdThumbnailPath && thumbnailMangaId) {
        clearMangaThumbnailPath(thumbnailMangaId, createdThumbnailPath);
      }
    } catch {
      // Keep the original upload error; storage cleanup still runs below.
    }

    await Promise.all(chapterDirs.map((chapterDir) => removeQuietly(chapterDir)));
    if (createdThumbnailPath) {
      await removeQuietly(resolveStoragePath(createdThumbnailPath));
    }
    next(error);
  } finally {
    await removeQuietly(extractDir);
    await removeQuietly(req.file?.path);
  }
});
