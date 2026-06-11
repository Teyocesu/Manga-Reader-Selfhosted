import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "manga-reader.sqlite");

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS mangas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    manga_id TEXT NOT NULL,
    title TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (manga_id) REFERENCES mangas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (chapter_id, page_index),
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    chapter_id TEXT PRIMARY KEY,
    current_page_index INTEGER NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'page',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );
`);

try {
  db.exec("ALTER TABLE mangas ADD COLUMN thumbnail_path TEXT;");
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) {
    throw error;
  }
}

function rowToManga(row) {
  return {
    id: row.id,
    title: row.title,
    thumbnailPath: row.thumbnail_path ?? null,
    thumbnailUrl: row.thumbnail_path ? `/api/mangas/${row.id}/thumbnail` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chapterCount: row.chapter_count ?? 0,
    lastReadAt: row.last_read_at ?? null
  };
}

function rowToChapter(row) {
  return {
    id: row.id,
    mangaId: row.manga_id,
    title: row.title,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pageCount: row.page_count ?? 0,
    progress: row.current_page_index == null
      ? null
      : {
          currentPageIndex: row.current_page_index,
          mode: row.mode,
          updatedAt: row.progress_updated_at
        }
  };
}

function rowToPage(row) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    pageIndex: row.page_index,
    filename: row.filename,
    mimeType: row.mime_type,
    imageUrl: `/api/pages/${row.id}/image`
  };
}

function rowToProgress(row) {
  if (!row) {
    return null;
  }

  return {
    chapterId: row.chapter_id,
    currentPageIndex: row.current_page_index,
    mode: row.mode,
    updatedAt: row.updated_at
  };
}

function now() {
  return new Date().toISOString();
}

export function listLibrary() {
  const rows = db.prepare(`
    SELECT
      mangas.*,
      COUNT(chapters.id) AS chapter_count,
      MAX(reading_progress.updated_at) AS last_read_at
    FROM mangas
    LEFT JOIN chapters ON chapters.manga_id = mangas.id
    LEFT JOIN reading_progress ON reading_progress.chapter_id = chapters.id
    GROUP BY mangas.id
    ORDER BY mangas.updated_at DESC
  `).all();

  const latestProgress = db.prepare(`
    SELECT
      chapters.id,
      chapters.title,
      reading_progress.current_page_index,
      reading_progress.mode,
      reading_progress.updated_at
    FROM chapters
    JOIN reading_progress ON reading_progress.chapter_id = chapters.id
    WHERE chapters.manga_id = ?
    ORDER BY reading_progress.updated_at DESC
    LIMIT 1
  `);

  return rows.map((row) => {
    const manga = rowToManga(row);
    const progress = latestProgress.get(row.id);

    return {
      ...manga,
      continueChapter: progress
        ? {
            id: progress.id,
            title: progress.title,
            currentPageIndex: progress.current_page_index,
            mode: progress.mode,
            updatedAt: progress.updated_at
          }
        : null
    };
  });
}

export function getManga(mangaId) {
  const manga = db.prepare("SELECT * FROM mangas WHERE id = ?").get(mangaId);
  if (!manga) {
    return null;
  }

  const chapters = db.prepare(`
    SELECT
      chapters.*,
      COUNT(pages.id) AS page_count,
      reading_progress.current_page_index,
      reading_progress.mode,
      reading_progress.updated_at AS progress_updated_at
    FROM chapters
    LEFT JOIN pages ON pages.chapter_id = chapters.id
    LEFT JOIN reading_progress ON reading_progress.chapter_id = chapters.id
    WHERE chapters.manga_id = ?
    GROUP BY chapters.id
    ORDER BY chapters.created_at DESC
  `).all(mangaId);

  return {
    ...rowToManga({ ...manga, chapter_count: chapters.length }),
    chapters: chapters.map(rowToChapter)
  };
}

export function getChapter(chapterId) {
  const chapter = db.prepare(`
    SELECT
      chapters.*,
      mangas.title AS manga_title,
      COUNT(pages.id) AS page_count,
      reading_progress.current_page_index,
      reading_progress.mode,
      reading_progress.updated_at AS progress_updated_at
    FROM chapters
    JOIN mangas ON mangas.id = chapters.manga_id
    LEFT JOIN pages ON pages.chapter_id = chapters.id
    LEFT JOIN reading_progress ON reading_progress.chapter_id = chapters.id
    WHERE chapters.id = ?
    GROUP BY chapters.id
  `).get(chapterId);

  if (!chapter) {
    return null;
  }

  const pages = db.prepare(`
    SELECT * FROM pages
    WHERE chapter_id = ?
    ORDER BY page_index ASC
  `).all(chapterId);

  return {
    manga: {
      id: chapter.manga_id,
      title: chapter.manga_title
    },
    chapter: rowToChapter(chapter),
    pages: pages.map(rowToPage),
    progress: getProgress(chapterId)
  };
}

export function getProgress(chapterId) {
  const row = db.prepare(`
    SELECT * FROM reading_progress
    WHERE chapter_id = ?
  `).get(chapterId);

  return rowToProgress(row);
}

export function getPage(pageId) {
  const row = db.prepare(`
    SELECT * FROM pages
    WHERE id = ?
  `).get(pageId);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    chapterId: row.chapter_id,
    pageIndex: row.page_index,
    filename: row.filename,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    createdAt: row.created_at
  };
}

export function saveProgress(chapterId, currentPageIndex, mode) {
  const chapter = db.prepare("SELECT id FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) {
    return null;
  }

  const safePageIndex = Math.max(0, Number.parseInt(currentPageIndex, 10) || 0);
  const safeMode = mode === "webtoon" ? "webtoon" : "page";
  const updatedAt = now();

  db.prepare(`
    INSERT INTO reading_progress (chapter_id, current_page_index, mode, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chapter_id) DO UPDATE SET
      current_page_index = excluded.current_page_index,
      mode = excluded.mode,
      updated_at = excluded.updated_at
  `).run(chapterId, safePageIndex, safeMode, updatedAt);

  return getProgress(chapterId);
}

function normalizeTitle(title) {
  return String(title || "").trim().replace(/\s+/g, " ");
}

export function getOrCreateManga(title) {
  const cleanTitle = normalizeTitle(title);
  if (!cleanTitle) {
    throw new Error("Manga title is required");
  }

  const existing = findMangaByTitle(cleanTitle);

  if (existing) {
    return existing;
  }

  const id = randomUUID();
  const createdAt = now();

  db.prepare(`
    INSERT INTO mangas (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, cleanTitle, createdAt, createdAt);

  return rowToManga({
    id,
    title: cleanTitle,
    created_at: createdAt,
    updated_at: createdAt
  });
}

export function findMangaByTitle(title) {
  const cleanTitle = normalizeTitle(title);
  if (!cleanTitle) {
    return null;
  }

  const existing = db.prepare(`
    SELECT * FROM mangas
    WHERE lower(title) = lower(?)
    ORDER BY created_at ASC
    LIMIT 1
  `).get(cleanTitle);

  if (existing) {
    return rowToManga(existing);
  }

  return null;
}

export function deleteChapters(chapterIds) {
  if (!chapterIds.length) {
    return;
  }

  try {
    db.exec("BEGIN");
    const deleteChapter = db.prepare("DELETE FROM chapters WHERE id = ?");

    for (const chapterId of chapterIds) {
      deleteChapter.run(chapterId);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteChapter(chapterId) {
  const chapter = db.prepare(`
    SELECT id, manga_id, storage_path
    FROM chapters
    WHERE id = ?
  `).get(chapterId);

  if (!chapter) {
    return null;
  }

  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM chapters WHERE id = ?").run(chapterId);
    db.prepare(`
      UPDATE mangas
      SET updated_at = ?
      WHERE id = ?
    `).run(now(), chapter.manga_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    id: chapter.id,
    mangaId: chapter.manga_id,
    storagePath: chapter.storage_path
  };
}

export function deleteManga(mangaId) {
  const manga = db.prepare(`
    SELECT id, thumbnail_path
    FROM mangas
    WHERE id = ?
  `).get(mangaId);

  if (!manga) {
    return null;
  }

  const chapters = db.prepare(`
    SELECT id, storage_path
    FROM chapters
    WHERE manga_id = ?
  `).all(mangaId);

  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM mangas WHERE id = ?").run(mangaId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    id: manga.id,
    thumbnailPath: manga.thumbnail_path,
    chapterStoragePaths: chapters.map((chapter) => chapter.storage_path)
  };
}

export function deleteMangaIfEmpty(mangaId) {
  db.prepare(`
    DELETE FROM mangas
    WHERE id = ?
      AND NOT EXISTS (
        SELECT 1 FROM chapters
        WHERE manga_id = ?
      )
  `).run(mangaId, mangaId);
}

export function setMangaThumbnailPath(mangaId, thumbnailPath) {
  const updatedAt = now();
  db.prepare(`
    UPDATE mangas
    SET thumbnail_path = ?,
        updated_at = ?
    WHERE id = ?
      AND thumbnail_path IS NULL
  `).run(thumbnailPath, updatedAt, mangaId);

  return getManga(mangaId);
}

export function clearMangaThumbnailPath(mangaId, thumbnailPath) {
  db.prepare(`
    UPDATE mangas
    SET thumbnail_path = NULL
    WHERE id = ?
      AND thumbnail_path = ?
  `).run(mangaId, thumbnailPath);
}

export function getMangaThumbnail(mangaId) {
  const row = db.prepare(`
    SELECT id, thumbnail_path
    FROM mangas
    WHERE id = ?
  `).get(mangaId);

  if (!row?.thumbnail_path) {
    return null;
  }

  return {
    mangaId: row.id,
    storagePath: row.thumbnail_path
  };
}

export function findChapterByTitle(mangaId, title) {
  const cleanTitle = normalizeTitle(title);
  if (!mangaId || !cleanTitle) {
    return null;
  }

  const chapter = db.prepare(`
    SELECT
      chapters.*,
      COUNT(pages.id) AS page_count,
      reading_progress.current_page_index,
      reading_progress.mode,
      reading_progress.updated_at AS progress_updated_at
    FROM chapters
    LEFT JOIN pages ON pages.chapter_id = chapters.id
    LEFT JOIN reading_progress ON reading_progress.chapter_id = chapters.id
    WHERE chapters.manga_id = ?
      AND lower(chapters.title) = lower(?)
    GROUP BY chapters.id
    ORDER BY chapters.created_at ASC
    LIMIT 1
  `).get(mangaId, cleanTitle);

  return chapter ? rowToChapter(chapter) : null;
}

export function updateMangaTitle(mangaId, title) {
  const cleanTitle = normalizeTitle(title);
  if (!cleanTitle) {
    const error = new Error("Manga title is required");
    error.statusCode = 400;
    throw error;
  }

  const existing = db.prepare("SELECT id FROM mangas WHERE id = ?").get(mangaId);
  if (!existing) {
    return null;
  }

  db.prepare(`
    UPDATE mangas
    SET title = ?,
        updated_at = ?
    WHERE id = ?
  `).run(cleanTitle, now(), mangaId);

  return getManga(mangaId);
}

export function updateChapterTitle(chapterId, title) {
  const cleanTitle = normalizeTitle(title);
  if (!cleanTitle) {
    const error = new Error("Chapter title is required");
    error.statusCode = 400;
    throw error;
  }

  const chapter = db.prepare(`
    SELECT id, manga_id
    FROM chapters
    WHERE id = ?
  `).get(chapterId);
  if (!chapter) {
    return null;
  }

  const updatedAt = now();
  db.prepare(`
    UPDATE chapters
    SET title = ?,
        updated_at = ?
    WHERE id = ?
  `).run(cleanTitle, updatedAt, chapterId);
  db.prepare(`
    UPDATE mangas
    SET updated_at = ?
    WHERE id = ?
  `).run(updatedAt, chapter.manga_id);

  return getChapter(chapterId);
}

export function createImportedChapter({
  mangaId,
  chapterId,
  chapterTitle,
  originalFilename,
  chapterStoragePath,
  pages
}) {
  const cleanTitle = normalizeTitle(chapterTitle);
  if (!cleanTitle) {
    throw new Error("Chapter title is required");
  }

  if (!pages.length) {
    throw new Error("Chapter requires at least one page");
  }

  const createdAt = now();

  try {
    db.exec("BEGIN");

    db.prepare(`
      INSERT INTO chapters (
        id,
        manga_id,
        title,
        original_filename,
        storage_path,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      chapterId,
      mangaId,
      cleanTitle,
      originalFilename,
      chapterStoragePath,
      createdAt,
      createdAt
    );

    const insertPage = db.prepare(`
      INSERT INTO pages (
        id,
        chapter_id,
        page_index,
        filename,
        storage_path,
        mime_type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const page of pages) {
      insertPage.run(
        randomUUID(),
        chapterId,
        page.pageIndex,
        page.filename,
        page.storagePath,
        page.mimeType,
        createdAt
      );
    }

    db.prepare(`
      UPDATE mangas
      SET updated_at = ?
      WHERE id = ?
    `).run(createdAt, mangaId);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getChapter(chapterId);
}
