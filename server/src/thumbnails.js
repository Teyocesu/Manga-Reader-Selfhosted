import path from "node:path";
import sharp from "sharp";
import { relativeStoragePath, thumbnailsDir } from "./storage.js";

const coverPatterns = ["cover", "portada", "front", "poster"];

function isCoverLike(page) {
  const name = String(page.originalPath || page.filename || "").toLowerCase();
  return coverPatterns.some((pattern) => name.includes(pattern));
}

export function selectRepresentativePage(chapters) {
  const pages = chapters.flatMap((chapter) => chapter.pages || []);
  return pages.find(isCoverLike) || chapters[0]?.pages?.[0] || null;
}

export async function createMangaThumbnail({ mangaId, sourcePath }) {
  const filename = `manga-${mangaId}.webp`;
  const destinationPath = path.join(thumbnailsDir, filename);

  await sharp(sourcePath)
    .rotate()
    .resize({
      width: 360,
      height: 520,
      fit: "cover",
      position: "top"
    })
    .webp({ quality: 78 })
    .toFile(destinationPath);

  return relativeStoragePath(destinationPath);
}
