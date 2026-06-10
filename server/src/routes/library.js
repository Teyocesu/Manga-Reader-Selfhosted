import { Router } from "express";
import { getChapter, getManga, listLibrary } from "../db.js";

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

libraryRouter.get("/chapters/:chapterId", (req, res) => {
  const chapter = getChapter(req.params.chapterId);
  if (!chapter) {
    return res.status(404).json({ error: "Chapter not found" });
  }

  res.json(chapter);
});
