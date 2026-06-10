import { Router } from "express";
import { getProgress, saveProgress } from "../db.js";

export const progressRouter = Router();

progressRouter.get("/progress/:chapterId", (req, res) => {
  res.json({
    progress: getProgress(req.params.chapterId)
  });
});

progressRouter.put("/progress/:chapterId", (req, res) => {
  const progress = saveProgress(
    req.params.chapterId,
    req.body.currentPageIndex,
    req.body.mode
  );

  if (!progress) {
    return res.status(404).json({ error: "Chapter not found" });
  }

  res.json({ progress });
});
