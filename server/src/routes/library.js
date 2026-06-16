import { Router } from "express";
import { access } from "node:fs/promises";
import path from "node:path";
import {
  bulkUpdateChapterTitles,
  deleteChapter,
  deleteManga,
  getChapter,
  getManga,
  getMangaThumbnail,
  listLibrary,
  reorderMangaChapters,
  updateChapterTitle,
  updateMangaTitle
} from "../db.js";
import { libraryDir, removeQuietly, resolveStoragePath } from "../storage.js";

export const libraryRouter = Router();

libraryRouter.get("/library", (_req, res) => {
  res.json({ mangas: listLibrary() });
});

libraryRouter.get("/mangas/:mangaId", (req, res) => {
  const manga = getManga(req.params.mangaId);
  if (!manga) {
    return res.status(404).json({ error: "Manga not found" });
  }

  res.json(manga);
});

libraryRouter.put("/mangas/:mangaId", (req, res, next) => {
  try {
    const manga = updateMangaTitle(req.params.mangaId, req.body?.title);
    if (!manga) {
      return res.status(404).json({ error: "Manga not found" });
    }

    res.json(manga);
  } catch (error) {
    next(error);
  }
});

libraryRouter.post("/mangas/:mangaId/chapters/reorder", (req, res, next) => {
  try {
    const manga = reorderMangaChapters(req.params.mangaId, req.body?.chapterIds);
    if (!manga) {
      return res.status(404).json({ error: "Manga not found" });
    }

    res.json(manga);
  } catch (error) {
    next(error);
  }
});

libraryRouter.post("/mangas/:mangaId/chapters/rename", (req, res, next) => {
  try {
    const manga = bulkUpdateChapterTitles(req.params.mangaId, req.body?.chapters);
    if (!manga) {
      return res.status(404).json({ error: "Manga not found" });
    }

    res.json(manga);
  } catch (error) {
    next(error);
  }
});

libraryRouter.get("/mangas/:mangaId/thumbnail", async (req, res, next) => {
  try {
    const thumbnail = getMangaThumbnail(req.params.mangaId);
    if (!thumbnail) {
      return res.status(404).json({ error: "Thumbnail not found" });
    }

    const thumbnailPath = resolveStoragePath(thumbnail.storagePath);
    await access(thumbnailPath);

    res.type("image/webp");
    res.sendFile(thumbnailPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Thumbnail file not found" });
    }

    next(error);
  }
});

libraryRouter.get("/chapters/:chapterId", (req, res) => {
  const chapter = getChapter(req.params.chapterId);
  if (!chapter) {
    return res.status(404).json({ error: "Chapter not found" });
  }

  res.json(chapter);
});

libraryRouter.put("/chapters/:chapterId", (req, res, next) => {
  try {
    const chapter = updateChapterTitle(req.params.chapterId, req.body?.title);
    if (!chapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

libraryRouter.delete("/chapters/:chapterId", async (req, res, next) => {
  try {
    const deletedChapter = deleteChapter(req.params.chapterId);
    if (!deletedChapter) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    await removeQuietly(resolveStoragePath(deletedChapter.storagePath));

    res.json({
      deletedChapterId: deletedChapter.id,
      mangaId: deletedChapter.mangaId,
      message: "Capítulo eliminado."
    });
  } catch (error) {
    next(error);
  }
});

libraryRouter.delete("/mangas/:mangaId", async (req, res, next) => {
  try {
    const deletedManga = deleteManga(req.params.mangaId);
    if (!deletedManga) {
      return res.status(404).json({ error: "Manga not found" });
    }

    await removeQuietly(path.join(libraryDir, deletedManga.id));
    if (deletedManga.thumbnailPath) {
      await removeQuietly(resolveStoragePath(deletedManga.thumbnailPath));
    }

    res.json({
      deletedMangaId: deletedManga.id,
      message: "Manga eliminado."
    });
  } catch (error) {
    next(error);
  }
});
