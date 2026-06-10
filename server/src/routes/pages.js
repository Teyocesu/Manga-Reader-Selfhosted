import { access } from "node:fs/promises";
import { Router } from "express";
import { getPage } from "../db.js";
import { resolveStoragePath } from "../storage.js";

export const pagesRouter = Router();

pagesRouter.get("/pages/:pageId/image", async (req, res, next) => {
  try {
    const page = getPage(req.params.pageId);
    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    const imagePath = resolveStoragePath(page.storagePath);
    await access(imagePath);

    res.type(page.mimeType);
    res.sendFile(imagePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "Image file not found" });
    }

    next(error);
  }
});
