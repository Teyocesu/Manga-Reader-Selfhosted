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
  listChaptersForDuplicateCheck,
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

function normalizeDuplicateText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(capitulo|cap|chapter|chap|ch|episodio|episode|tomo|volumen|volume|vol)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFilename(value) {
  return normalizeDuplicateText(path.posix.basename(String(value || "")));
}

function titleTokens(value) {
  return normalizeDuplicateText(value)
    .split(" ")
    .filter((token) => token.length > 0);
}

function similarityScore(left, right) {
  const normalizedLeft = normalizeDuplicateText(left);
  const normalizedRight = normalizeDuplicateText(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (
    Math.min(normalizedLeft.length, normalizedRight.length) >= 5 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return 0.86;
  }

  const leftTokens = new Set(titleTokens(normalizedLeft));
  const rightTokens = new Set(titleTokens(normalizedRight));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function imageNameSimilarity(incomingPages, existingPageFilenames) {
  if (!incomingPages.length || !existingPageFilenames.length) {
    return 0;
  }

  const incomingNames = incomingPages.map((page) => normalizeFilename(page.originalPath));
  const existingNames = existingPageFilenames.map((filename) => normalizeFilename(filename));
  const sampleSize = Math.min(incomingNames.length, existingNames.length, 8);
  let matches = 0;

  for (let index = 0; index < sampleSize; index += 1) {
    if (incomingNames[index] && incomingNames[index] === existingNames[index]) {
      matches += 1;
    }
  }

  return sampleSize > 0 ? matches / sampleSize : 0;
}

function isExactTitleMatch(left, right) {
  return cleanTitle(left).toLowerCase() === cleanTitle(right).toLowerCase();
}

function duplicateWarningForChapter({ existingChapters, incomingChapter }) {
  if (existingChapters.some((chapter) => isExactTitleMatch(chapter.title, incomingChapter.title))) {
    return null;
  }

  const candidates = existingChapters
    .map((chapter) => {
      const reasons = [];
      const sameOriginalFilename =
        normalizeFilename(chapter.originalFilename) === normalizeFilename(incomingChapter.originalFilename);
      const samePageCount = chapter.pageCount === incomingChapter.pages.length;
      const titleScore = similarityScore(chapter.title, incomingChapter.title);
      const imageScore = imageNameSimilarity(incomingChapter.pages, chapter.pageFilenames || []);

      if (sameOriginalFilename) {
        reasons.push("mismo archivo original");
      }

      if (titleScore >= 0.82) {
        reasons.push("título muy parecido");
      }

      if (samePageCount) {
        reasons.push("misma cantidad de páginas");
      }

      if (imageScore >= 0.72) {
        reasons.push("nombres de imágenes similares");
      }

      const isLikelyDuplicate =
        sameOriginalFilename ||
        titleScore >= 0.92 ||
        (titleScore >= 0.82 && samePageCount) ||
        (samePageCount && imageScore >= 0.72 && titleScore >= 0.55);

      return {
        chapter,
        reasons,
        score: Number(sameOriginalFilename) + titleScore + Number(samePageCount) + imageScore,
        isLikelyDuplicate
      };
    })
    .filter((candidate) => candidate.isLikelyDuplicate && candidate.reasons.length > 0)
    .sort((a, b) => b.score - a.score);

  const match = candidates[0];
  if (!match) {
    return null;
  }

  return {
    incomingTitle: incomingChapter.title,
    incomingOriginalFilename: incomingChapter.originalFilename,
    incomingPageCount: incomingChapter.pages.length,
    existingChapter: {
      id: match.chapter.id,
      title: match.chapter.title,
      originalFilename: match.chapter.originalFilename,
      pageCount: match.chapter.pageCount
    },
    reasons: match.reasons
  };
}

function findDuplicateWarnings({ existingChapters, extractedChapters, chapterTitle, uploadedFilename }) {
  const isPack = extractedChapters.length > 1;
  return extractedChapters
    .map((extractedChapter) => {
      const title = isPack
        ? extractedChapter.chapterTitle
        : chapterTitle || sanitizeChapterTitleFromArchiveName(uploadedFilename);

      return duplicateWarningForChapter({
        existingChapters,
        incomingChapter: {
          title,
          originalFilename: isPack ? extractedChapter.originalFilename : uploadedFilename,
          pages: extractedChapter.pages
        }
      });
    })
    .filter(Boolean);
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
    message = `${totalChapters} nuevo${totalChapters === 1 ? "" : "s"} importado${totalChapters === 1 ? "" : "s"}, ${totalSkipped} duplicado${totalSkipped === 1 ? "" : "s"} omitido${totalSkipped === 1 ? "" : "s"}.`;
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
    const mangaId = cleanTitle(req.body.mangaId);
    const confirmPotentialDuplicate = req.body.confirmPotentialDuplicate === "1";

    if (!mangaId && !mangaTitle) {
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

    const existingManga = mangaId ? getManga(mangaId) : findMangaByTitle(mangaTitle);
    if (mangaId && !existingManga) {
      return res.status(404).json({ error: "Manga not found" });
    }

    const manga = existingManga || getOrCreateManga(mangaTitle);
    if (!existingManga && !mangaId) {
      createdMangaId = manga.id;
    }

    const duplicateWarnings = findDuplicateWarnings({
      existingChapters: listChaptersForDuplicateCheck(manga.id),
      extractedChapters,
      chapterTitle,
      uploadedFilename: req.file.originalname
    });

    if (duplicateWarnings.length > 0 && !confirmPotentialDuplicate) {
      return res.status(409).json({
        error: "Parece que este capítulo ya existe",
        duplicateWarning: {
          message: "Parece que este capítulo ya existe",
          manga: {
            id: manga.id,
            title: manga.title
          },
          chapters: duplicateWarnings,
          canContinue: true
        }
      });
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
