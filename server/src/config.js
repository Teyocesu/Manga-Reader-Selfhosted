import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

function positiveIntegerFromEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  maxUploadMb: positiveIntegerFromEnv("MAX_UPLOAD_MB", 1024),
  maxImagesPerChapter: positiveIntegerFromEnv("MAX_IMAGES_PER_CHAPTER", 1000)
};

export const maxUploadBytes = config.maxUploadMb * 1024 * 1024;
