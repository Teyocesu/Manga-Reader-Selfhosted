import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

function pathFromEnv(name, fallback) {
  const value = process.env[name] || fallback;
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function positiveIntegerFromEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  appPassword: process.env.APP_PASSWORD || "",
  dataDir: pathFromEnv("DATA_DIR", "./data"),
  maxUploadMb: positiveIntegerFromEnv("MAX_UPLOAD_MB", 1024),
  maxImagesPerChapter: positiveIntegerFromEnv("MAX_IMAGES_PER_CHAPTER", 1000),
  storageDir: pathFromEnv("STORAGE_DIR", "./storage")
};

export const maxUploadBytes = config.maxUploadMb * 1024 * 1024;
