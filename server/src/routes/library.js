import { Router } from "express";
import { access } from "node:fs/promises";
import { getChapter, getManga, getMangaThumbnail, listLibrary } from "../db.js";
import { resolveStoragePath } from "../storage.js";

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
