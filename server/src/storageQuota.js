import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { checkpointDatabaseStorage, listLibrary } from "./db.js";
import { libraryDir, storageDir, tempDir, thumbnailsDir } from "./storage.js";

const warningThreshold = 0.8;
const criticalThreshold = 0.95;

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function fileSize(targetPath) {
  try {
    const stats = await stat(targetPath);
    return stats.isFile() ? stats.size : 0;
  } catch (error) {
    if (error.code === "ENOENT") {
      return 0;
    }

    throw error;
  }
}

export async function directorySize(targetPath) {
  let stats;
  try {
    stats = await stat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return 0;
    }

    throw error;
  }

  if (stats.isFile()) {
    return stats.size;
  }

  if (!stats.isDirectory()) {
    return 0;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map((entry) => directorySize(path.join(targetPath, entry.name)))
  );
  return sizes.reduce((total, size) => total + size, 0);
}

function isSameOrInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function safeDiskFreeBytes() {
  try {
    const stats = await statfs(storageDir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

async function databaseBytes() {
  checkpointDatabaseStorage();
  const dbPath = path.join(config.dataDir, "manga-reader.sqlite");
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const sizes = await Promise.all(files.map((file) => fileSize(file)));
  return sizes.reduce((total, size) => total + size, 0);
}

async function otherStorageBytes({ libraryBytes, thumbnailsBytes, tempBytes }) {
  const storageBytes = await directorySize(storageDir);
  return Math.max(0, storageBytes - libraryBytes - thumbnailsBytes - tempBytes);
}

function warningForUsage({ percentUsed, freeQuotaBytes }) {
  if (freeQuotaBytes <= 0 || percentUsed >= criticalThreshold * 100) {
    return {
      level: "critical",
      message: "La biblioteca alcanzó el límite configurado de almacenamiento."
    };
  }

  if (percentUsed >= warningThreshold * 100) {
    return {
      level: "near",
      message: "La biblioteca está cerca del límite configurado de almacenamiento."
    };
  }

  return {
    level: "ok",
    message: "Hay espacio disponible dentro de la cuota configurada."
  };
}

async function mangaStorageBreakdown() {
  const mangas = listLibrary();
  const entries = await Promise.all(
    mangas.map(async (manga) => ({
      id: manga.id,
      title: manga.title,
      bytes: await directorySize(path.join(libraryDir, manga.id)),
      chapterCount: manga.chapterCount
    }))
  );

  return entries.sort((a, b) => b.bytes - a.bytes).slice(0, 8);
}

export async function getStorageStatus() {
  await Promise.all([
    pathExists(storageDir),
    pathExists(libraryDir),
    pathExists(thumbnailsDir),
    pathExists(tempDir)
  ]);

  const [libraryBytes, thumbnailsBytes, tempBytes, dbBytes, diskFreeBytes] = await Promise.all([
    directorySize(libraryDir),
    directorySize(thumbnailsDir),
    directorySize(tempDir),
    databaseBytes(),
    safeDiskFreeBytes()
  ]);
  const otherBytes = await otherStorageBytes({ libraryBytes, thumbnailsBytes, tempBytes });
  const dataIncludedInStorage = isSameOrInside(storageDir, config.dataDir);
  const usedBytes =
    libraryBytes + thumbnailsBytes + tempBytes + otherBytes + (dataIncludedInStorage ? 0 : dbBytes);
  const quotaBytes = config.storageQuotaBytes;
  const freeQuotaBytes = Math.max(0, quotaBytes - usedBytes);
  const percentUsed = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 100;
  const warning = warningForUsage({ percentUsed, freeQuotaBytes });

  return {
    quotaBytes,
    usedBytes,
    freeQuotaBytes,
    diskFreeBytes,
    percentUsed,
    warning,
    breakdown: {
      libraryBytes,
      thumbnailsBytes,
      databaseBytes: dbBytes,
      tempBytes,
      otherBytes
    },
    heavyMangas: await mangaStorageBreakdown()
  };
}

export async function assertStorageQuota({ incomingBytes = 0, includeTemp = true } = {}) {
  const status = await getStorageStatus();
  const baseUsedBytes = includeTemp
    ? status.usedBytes
    : Math.max(0, status.usedBytes - status.breakdown.tempBytes);
  const projectedUsedBytes = baseUsedBytes + incomingBytes;
  const quotaExceeded = projectedUsedBytes > status.quotaBytes;
  const diskExceeded = status.diskFreeBytes != null && status.diskFreeBytes <= 0;

  if (quotaExceeded || diskExceeded) {
    const error = new Error(
      quotaExceeded
        ? "No hay espacio suficiente dentro de la cuota configurada para importar esta entrada."
        : "No hay espacio libre suficiente en el disco para importar esta entrada."
    );
    error.statusCode = 400;
    error.storage = {
      quotaBytes: status.quotaBytes,
      usedBytes: status.usedBytes,
      freeQuotaBytes: status.freeQuotaBytes,
      projectedUsedBytes,
      diskFreeBytes: status.diskFreeBytes
    };
    throw error;
  }

  return {
    ...status,
    projectedUsedBytes
  };
}
