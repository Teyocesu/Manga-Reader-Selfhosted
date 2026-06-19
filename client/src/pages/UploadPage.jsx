import { useEffect, useMemo, useRef, useState } from "react";
import { getAppConfig, getLibrary, getStorageStatus, uploadChapter } from "../api.js";
import { formatBytes, StorageOverview } from "../components/StorageOverview.jsx";

const ARCHIVE_EXTENSIONS = [".zip", ".cbz", ".rar", ".cbr"];
const DEFAULT_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"];
const QUEUE_LABELS = {
  completed: "completado",
  error: "error",
  importing: "importando",
  pending: "pendiente",
  warning: "duplicado/advertencia"
};
const QUEUE_STATE_MESSAGES = {
  completed: "Importación completada.",
  error: "No se pudo importar esta entrada.",
  importing: "Importando archivos y generando páginas...",
  pending: "Lista para subir.",
  warning: "El servidor detectó un posible duplicado."
};

function titleFromFilename(filename) {
  return String(filename || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[\x00-\x1f]/g, "")
    .trim()
    .replace(/\s+/g, " ") || "Capítulo";
}

function extensionOf(filename) {
  const match = String(filename || "").toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function formatFileSizeFromBytes(bytes) {
  const sizeMb = bytes / (1024 * 1024);
  return `${sizeMb >= 1 ? sizeMb.toFixed(1) : "<1"} MB`;
}

function formatItemSize(item) {
  return formatFileSizeFromBytes(item.totalSize || 0);
}

function makeQueueId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeRelativePath(file) {
  return file.webkitRelativePath || file.name;
}

function rootNameFromPath(relativePath, fallback) {
  const parts = String(relativePath || "").split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : titleFromFilename(fallback);
}

function uploadEntryFromFile(file, path = safeRelativePath(file)) {
  return { file, path };
}

function isArchiveFile(file, extensions = ARCHIVE_EXTENSIONS) {
  return extensions.includes(extensionOf(file.name));
}

function isImageFile(file, extensions = DEFAULT_IMAGE_EXTENSIONS) {
  return extensions.includes(extensionOf(file.name));
}

function queueItemFromArchive(file) {
  return {
    id: makeQueueId(),
    kind: "archive",
    file,
    chapterTitle: titleFromFilename(file.name),
    displayName: file.name,
    totalSize: file.size || 0,
    status: "pending",
    error: "",
    duplicateWarning: null,
    result: null
  };
}

function queueItemFromImageEntries(entries, fallbackName) {
  const firstPath = entries[0]?.path || fallbackName || "Carpeta";
  const folderName = rootNameFromPath(firstPath, fallbackName);

  return {
    id: makeQueueId(),
    kind: "folder",
    imageEntries: entries,
    folderName,
    chapterTitle: titleFromFilename(folderName),
    displayName: folderName,
    totalSize: entries.reduce((total, entry) => total + (entry.file.size || 0), 0),
    status: "pending",
    error: "",
    duplicateWarning: null,
    result: null
  };
}

function groupImageEntries(entries) {
  if (entries.length === 0) {
    return [];
  }

  const groups = new Map();

  for (const entry of entries) {
    const key = rootNameFromPath(entry.path, entry.file.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }

  return [...groups.entries()].map(([folderName, groupedEntries]) =>
    queueItemFromImageEntries(groupedEntries, folderName)
  );
}

function importedCountFromResult(result) {
  if (!result) {
    return 0;
  }

  if (Number.isInteger(result.totalChapters)) {
    return result.totalChapters;
  }

  return result.chapter ? 1 : 0;
}

function pageCountFromResult(result) {
  if (!result) {
    return 0;
  }

  if (Number.isInteger(result.totalPages)) {
    return result.totalPages;
  }

  return Array.isArray(result.pages) ? result.pages.length : 0;
}

function skippedCountFromResult(result) {
  if (!result) {
    return 0;
  }

  if (Number.isInteger(result.totalSkipped)) {
    return result.totalSkipped;
  }

  return Array.isArray(result.skippedChapters) ? result.skippedChapters.length : 0;
}

function queueItemResultMessage(item) {
  if (item.status === "completed") {
    const imported = importedCountFromResult(item.result);
    const pages = pageCountFromResult(item.result);
    const skipped = skippedCountFromResult(item.result);
    const parts = [];
    if (imported > 0) {
      parts.push(`${imported} capítulo${imported === 1 ? "" : "s"} importado${imported === 1 ? "" : "s"}`);
    }
    if (pages > 0) {
      parts.push(`${pages} página${pages === 1 ? "" : "s"}`);
    }
    if (skipped > 0) {
      parts.push(`${skipped} duplicado${skipped === 1 ? "" : "s"} omitido${skipped === 1 ? "" : "s"}`);
    }
    return item.result?.message || parts.join(" · ") || QUEUE_STATE_MESSAGES.completed;
  }

  if (item.status === "warning") {
    return item.duplicateWarning?.message || QUEUE_STATE_MESSAGES.warning;
  }

  if (item.status === "error") {
    return item.error ? `${QUEUE_STATE_MESSAGES.error}: ${item.error}` : QUEUE_STATE_MESSAGES.error;
  }

  return QUEUE_STATE_MESSAGES[item.status] || "";
}

function queueReportFromItems(items) {
  return items.reduce(
    (summary, item) => {
      if (item.status === "completed") {
        summary.imported += importedCountFromResult(item.result);
        summary.skipped += skippedCountFromResult(item.result);
      } else if (item.status === "warning") {
        summary.warnings += 1;
      } else if (item.status === "error") {
        summary.errors += 1;
      }

      return summary;
    },
    { imported: 0, skipped: 0, warnings: 0, errors: 0 }
  );
}

function queueReportText(summary) {
  const parts = [
    `${summary.imported} importado${summary.imported === 1 ? "" : "s"}`,
    `${summary.skipped + summary.warnings} duplicado${summary.skipped + summary.warnings === 1 ? "" : "s"}/advertencia${summary.skipped + summary.warnings === 1 ? "" : "s"}`,
    `${summary.errors} error${summary.errors === 1 ? "" : "es"}`
  ];

  return parts.join(" · ");
}

async function readDirectoryEntries(reader) {
  const allEntries = [];
  let batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));

  while (batch.length > 0) {
    allEntries.push(...batch);
    batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  }

  return allEntries;
}

async function entriesFromFileSystemEntry(entry, prefix = "") {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    return [uploadEntryFromFile(file, `${prefix}${file.name}`)];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const childEntries = await readDirectoryEntries(entry.createReader());
  const nestedEntries = await Promise.all(
    childEntries.map((childEntry) =>
      entriesFromFileSystemEntry(childEntry, `${prefix}${entry.name}/`)
    )
  );

  return nestedEntries.flat();
}

async function entriesFromDrop(dataTransfer) {
  const items = [...(dataTransfer.items || [])];
  const fileSystemItems = items
    .map((item) => (item.kind === "file" && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (fileSystemItems.length > 0) {
    const nestedEntries = await Promise.all(
      fileSystemItems.map((entry) => entriesFromFileSystemEntry(entry))
    );
    return nestedEntries.flat();
  }

  return [...(dataTransfer.files || [])].map((file) => uploadEntryFromFile(file));
}

export function UploadPage({ initialMangaId = "", onNavigate }) {
  const [importMode, setImportMode] = useState(initialMangaId ? "existing" : "new");
  const [selectedMangaId, setSelectedMangaId] = useState(initialMangaId);
  const [mangas, setMangas] = useState([]);
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [queueItems, setQueueItems] = useState([]);
  const [queueTargetMangaId, setQueueTargetMangaId] = useState("");
  const [appConfig, setAppConfig] = useState({
    upload: {
      maxUploadMb: 1024,
      maxImagesPerChapter: 500,
      supportedFormats: ARCHIVE_EXTENSIONS,
      supportedImageFormats: DEFAULT_IMAGE_EXTENSIONS
    }
  });
  const [setupLoading, setSetupLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState({ error: "", success: "" });
  const [storageStatus, setStorageStatus] = useState(null);
  const [storageConfirmed, setStorageConfirmed] = useState(false);
  const archiveInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const archiveExtensions = appConfig.upload.supportedFormats || ARCHIVE_EXTENSIONS;
  const imageExtensions = appConfig.upload.supportedImageFormats || DEFAULT_IMAGE_EXTENSIONS;
  const selectedManga = mangas.find((manga) => manga.id === selectedMangaId);
  const queueSummary = useMemo(() => {
    const counts = queueItems.reduce((summary, item) => {
      summary[item.status] = (summary[item.status] || 0) + 1;
      return summary;
    }, {});

    return Object.entries(counts)
      .map(([statusKey, count]) => `${count} ${QUEUE_LABELS[statusKey] || statusKey}`)
      .join(" · ");
  }, [queueItems]);
  const queueReport = useMemo(() => queueReportFromItems(queueItems), [queueItems]);
  const hasQueueReport = queueItems.some((item) =>
    item.status === "completed" || item.status === "warning" || item.status === "error"
  );
  const pendingQueueBytes = useMemo(
    () =>
      queueItems
        .filter((item) => item.status === "pending" || item.status === "error")
        .reduce((total, item) => total + (item.totalSize || 0), 0),
    [queueItems]
  );
  const storagePreflight = useMemo(() => {
    if (!storageStatus || pendingQueueBytes <= 0) {
      return {
        exceedsQuota: false,
        requiresConfirmation: false,
        estimatedRemainingBytes: storageStatus?.freeQuotaBytes ?? 0
      };
    }

    const estimatedRemainingBytes = storageStatus.freeQuotaBytes - pendingQueueBytes;
    const quotaBytes = storageStatus.quotaBytes || 1;
    const remainingRatio = estimatedRemainingBytes / quotaBytes;
    const exceedsQuota = estimatedRemainingBytes < 0;
    const requiresConfirmation =
      !exceedsQuota && (remainingRatio <= 0.1 || storageStatus.warning?.level !== "ok");

    return {
      exceedsQuota,
      requiresConfirmation,
      estimatedRemainingBytes
    };
  }, [pendingQueueBytes, storageStatus]);
  const canSubmit =
    !setupLoading &&
    !isProcessing &&
    queueItems.some((item) => item.status === "pending" || item.status === "error") &&
    (importMode === "existing" ? Boolean(selectedMangaId) : Boolean(mangaTitle.trim())) &&
    !storagePreflight.exceedsQuota &&
    (!storagePreflight.requiresConfirmation || storageConfirmed);
  const targetMangaId = importMode === "existing" ? selectedMangaId : queueTargetMangaId;

  useEffect(() => {
    let alive = true;

    setSetupLoading(true);
    setImportMode(initialMangaId ? "existing" : "new");
    setSelectedMangaId(initialMangaId);
    setQueueTargetMangaId("");
    setQueueItems([]);
    setStatus({ error: "", success: "" });

    Promise.all([getAppConfig(), getLibrary(), getStorageStatus()])
      .then(([config, library, storage]) => {
        if (alive) {
          setAppConfig(config);
          setMangas(library.mangas);
          setStorageStatus(storage);
          setSetupLoading(false);
          if (initialMangaId) {
            setSelectedMangaId(initialMangaId);
          } else if (library.mangas.length > 0) {
            setSelectedMangaId(library.mangas[0].id);
          }
        }
      })
      .catch(() => {
        if (alive) {
          setSetupLoading(false);
          setStatus({
            error: "No se pudo conectar con el servidor. Revisá que el backend esté corriendo.",
            success: ""
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [initialMangaId]);

  useEffect(() => {
    setStorageConfirmed(false);
  }, [pendingQueueBytes]);

  async function refreshStorageStatus() {
    try {
      setStorageStatus(await getStorageStatus());
    } catch {
      // Backend still enforces quota; keep the last visible value if refresh fails.
    }
  }

  function resetInputs() {
    if (archiveInputRef.current) {
      archiveInputRef.current.value = "";
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }

  function setQueueItem(itemId, patch) {
    setQueueItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  }

  function addEntries(entries) {
    const archiveItems = [];
    const imageEntries = [];
    const unsupported = [];

    for (const entry of entries) {
      if (isArchiveFile(entry.file, archiveExtensions)) {
        archiveItems.push(queueItemFromArchive(entry.file));
      } else if (isImageFile(entry.file, imageExtensions)) {
        imageEntries.push(entry);
      } else {
        unsupported.push(entry.path || entry.file.name);
      }
    }

    const folderItems = groupImageEntries(imageEntries);
    const nextItems = [...archiveItems, ...folderItems];

    if (nextItems.length === 1 && chapterTitle.trim()) {
      nextItems[0].chapterTitle = chapterTitle.trim().replace(/\s+/g, " ");
    }

    if (nextItems.length > 0) {
      setQueueItems((current) => [...current, ...nextItems]);
      setStatus({
        error: unsupported.length > 0
          ? `Se ignoraron archivos no soportados: ${unsupported.slice(0, 3).join(", ")}${unsupported.length > 3 ? "..." : ""}`
          : "",
        success: `${nextItems.length} entrada${nextItems.length === 1 ? "" : "s"} agregada${nextItems.length === 1 ? "" : "s"} a la cola.`
      });
    } else if (unsupported.length > 0) {
      setStatus({
        error: `Formato no soportado: ${unsupported.slice(0, 3).join(", ")}${unsupported.length > 3 ? "..." : ""}`,
        success: ""
      });
    }

    resetInputs();
  }

  function handleArchiveInput(event) {
    addEntries([...event.target.files].map((file) => uploadEntryFromFile(file)));
  }

  function handleFolderInput(event) {
    addEntries([...event.target.files].map((file) => uploadEntryFromFile(file)));
  }

  async function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);

    try {
      addEntries(await entriesFromDrop(event.dataTransfer));
    } catch {
      setStatus({
        error: "No se pudo leer la carpeta arrastrada. Probá con el selector de carpeta.",
        success: ""
      });
    }
  }

  function removeQueueItem(itemId) {
    setQueueItems((current) => current.filter((item) => item.id !== itemId));
  }

  function updateQueueItemTitle(itemId, value) {
    setQueueItem(itemId, { chapterTitle: value, error: "", errorDetail: null });
  }

  async function uploadQueueItem(item, options = {}) {
    setQueueItem(item.id, {
      status: "importing",
      error: "",
      duplicateWarning: null,
      errorDetail: null
    });

    try {
      const result = await uploadChapter({
        mangaId: options.targetMangaId || "",
        mangaTitle: options.targetMangaId ? "" : mangaTitle,
        chapterTitle: item.chapterTitle,
        archive: item.kind === "archive" ? item.file : null,
        imageEntries: item.kind === "folder" ? item.imageEntries : [],
        folderName: item.kind === "folder" ? item.folderName : "",
        confirmPotentialDuplicate: options.confirmPotentialDuplicate
      });
      const nextMangaId = result.manga?.id || options.targetMangaId || "";
      if (nextMangaId && importMode === "new") {
        setQueueTargetMangaId(nextMangaId);
      }
      setQueueItem(item.id, {
        status: "completed",
        result,
        error: "",
        duplicateWarning: null,
        errorDetail: null
      });
      return { ok: true, mangaId: nextMangaId, result };
    } catch (error) {
      if (error.status === 409 && error.body?.duplicateWarning) {
        const warningMangaId = error.body.duplicateWarning.manga?.id || options.targetMangaId || "";
        if (warningMangaId && importMode === "new") {
          setQueueTargetMangaId(warningMangaId);
        }
        setQueueItem(item.id, {
          status: "warning",
          error: "",
          duplicateWarning: error.body.duplicateWarning
        });
        return { ok: false, mangaId: warningMangaId, warning: true };
      }

      setQueueItem(item.id, {
        status: "error",
        error: error.message,
        duplicateWarning: null,
        errorDetail: error.body || null
      });
      return { ok: false, error: true, mangaId: options.targetMangaId || "" };
    }
  }

  async function processQueue(event) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsProcessing(true);
    setStatus({ error: "", success: "" });

    let currentMangaId = importMode === "existing" ? selectedMangaId : queueTargetMangaId;
    const itemsToProcess = queueItems.filter(
      (item) => item.status === "pending" || item.status === "error"
    );
    const finalSummary = { imported: 0, skipped: 0, warnings: 0, errors: 0 };

    for (const item of itemsToProcess) {
      const result = await uploadQueueItem(item, { targetMangaId: currentMangaId });
      if (result.mangaId) {
        currentMangaId = result.mangaId;
      }
      if (result.ok) {
        finalSummary.imported += importedCountFromResult(result.result);
        finalSummary.skipped += skippedCountFromResult(result.result);
      } else if (result.warning) {
        finalSummary.warnings += 1;
      } else if (result.error) {
        finalSummary.errors += 1;
      }
      await refreshStorageStatus();
    }

    setIsProcessing(false);
    setStatus({
      error: finalSummary.errors > 0 ? "Algunas entradas no se pudieron importar. Revisá el detalle de la cola." : "",
      success: `Cola finalizada: ${queueReportText(finalSummary)}.`
    });
  }

  async function continueWarningItem(item) {
    if (isProcessing) {
      return;
    }

    setIsProcessing(true);
    const currentMangaId =
      importMode === "existing"
        ? selectedMangaId
        : item.duplicateWarning?.manga?.id || queueTargetMangaId;
    const result = await uploadQueueItem(item, {
      targetMangaId: currentMangaId,
      confirmPotentialDuplicate: true
    });
    await refreshStorageStatus();
    setIsProcessing(false);
    setStatus({
      error: result.ok ? "" : "No se pudo continuar esa entrada.",
      success: result.ok ? "Entrada importada después de confirmar advertencia." : ""
    });
  }

  return (
    <section className="page-section upload-layout">
      <div className="upload-intro">
        <p className="eyebrow">Importación local</p>
        <h1>{importMode === "existing" ? "Subir continuación" : "Importar manga"}</h1>
        <p className="hero-copy">
          Podés subir comprimidos o carpetas con imágenes. La cola procesa cada entrada sin
          frenar las demás si una falla.
        </p>
      </div>

      <form className="upload-form" onSubmit={processQueue}>
        {setupLoading ? (
          <p className="file-summary">Cargando configuración y biblioteca...</p>
        ) : null}

        <StorageOverview storage={storageStatus} />

        <div className="mode-toggle upload-mode-toggle" aria-label="Tipo de importación">
          <button
            className={importMode === "new" ? "active" : ""}
            onClick={() => {
              setImportMode("new");
              setQueueTargetMangaId("");
              setStatus({ error: "", success: "" });
            }}
            type="button"
          >
            Crear manga nuevo
          </button>
          <button
            className={importMode === "existing" ? "active" : ""}
            disabled={mangas.length === 0}
            onClick={() => {
              setImportMode("existing");
              setQueueTargetMangaId("");
              setStatus({ error: "", success: "" });
            }}
            type="button"
          >
            Agregar a manga existente
          </button>
        </div>

        {importMode === "existing" ? (
          <label>
            Manga existente
            <select
              onChange={(event) => {
                setSelectedMangaId(event.target.value);
                setStatus({ error: "", success: "" });
              }}
              required
              value={selectedMangaId}
            >
              {mangas.map((manga) => (
                <option key={manga.id} value={manga.id}>
                  {manga.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Manga
            <input
              value={mangaTitle}
              onChange={(event) => {
                setMangaTitle(event.target.value);
                setQueueTargetMangaId("");
                setStatus({ error: "", success: "" });
              }}
              placeholder="Ej: One-shot personal"
              required
            />
          </label>
        )}

        <label>
          Título base por defecto (opcional)
          <input
            value={chapterTitle}
            onChange={(event) => setChapterTitle(event.target.value)}
            placeholder="Si agregás una sola entrada, podés pisar su título acá"
          />
        </label>

        <div
          className={`file-drop queue-drop ${isDragging ? "dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) {
              setIsDragging(false);
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            void handleDrop(event);
          }}
        >
          <strong>Arrastrá archivos o carpetas</strong>
          <small>
            Comprimidos {archiveExtensions.join(", ")} o imágenes {imageExtensions.join(", ")}
          </small>
          <div className="upload-picker-actions">
            <label className="picker-button">
              Elegir archivos
              <input
                accept={archiveExtensions.join(",")}
                multiple
                onChange={handleArchiveInput}
                ref={archiveInputRef}
                type="file"
              />
            </label>
            <label className="picker-button">
              Elegir carpeta
              <input
                multiple
                onChange={handleFolderInput}
                ref={folderInputRef}
                type="file"
                webkitdirectory="true"
              />
            </label>
          </div>
        </div>

        <p className="form-help">
          Límite actual: {appConfig.upload.maxUploadMb} MB · hasta{" "}
          {appConfig.upload.maxImagesPerChapter} imágenes por capítulo.
        </p>
        {importMode === "existing" && selectedManga ? (
          <p className="form-help">Se agregará a: {selectedManga.title}.</p>
        ) : null}

        {pendingQueueBytes > 0 ? (
          <section className={`storage-preflight ${storagePreflight.exceedsQuota ? "critical" : storagePreflight.requiresConfirmation ? "near" : "ok"}`}>
            <div>
              <strong>Preflight de espacio</strong>
              <p>
                Cola: {formatBytes(pendingQueueBytes)} · libre estimado después de subir:{" "}
                {formatBytes(Math.max(0, storagePreflight.estimatedRemainingBytes))}
              </p>
              <p>
                Los comprimidos pueden expandirse al importar; el servidor vuelve a validar y limpia
                archivos parciales si la cuota se supera.
              </p>
            </div>
            {storagePreflight.exceedsQuota ? (
              <p className="storage-preflight-message">
                Esta cola supera la cuota disponible. Quitá entradas o ampliá la cuota.
              </p>
            ) : storagePreflight.requiresConfirmation ? (
              <label className="storage-confirmation">
                <input
                  checked={storageConfirmed}
                  onChange={(event) => setStorageConfirmed(event.target.checked)}
                  type="checkbox"
                />
                Confirmo subir aunque el espacio quedará bajo.
              </label>
            ) : null}
          </section>
        ) : null}

        {queueItems.length > 0 ? (
          <section className="upload-queue" aria-label="Cola de subida">
            <div className="upload-queue-heading">
              <div>
                <p className="eyebrow">Cola</p>
                <h2>{queueItems.length} entrada{queueItems.length === 1 ? "" : "s"}</h2>
              </div>
              <button
                disabled={isProcessing}
                onClick={() => {
                  setQueueItems([]);
                  setQueueTargetMangaId("");
                  setStatus({ error: "", success: "" });
                }}
                type="button"
              >
                Vaciar
              </button>
            </div>
            {queueSummary ? <p className="form-help">{queueSummary}</p> : null}
            {hasQueueReport ? (
              <div className="queue-final-report" aria-live="polite">
                <strong>Resumen</strong>
                <span>{queueReportText(queueReport)}</span>
              </div>
            ) : null}
            <div className="upload-queue-list">
              {queueItems.map((item) => (
                <article className={`upload-queue-item ${item.status}`} key={item.id}>
                  <div className="queue-item-main">
                    <div className="queue-item-title">
                      <strong>{item.displayName}</strong>
                      <span>{item.kind === "folder" ? "Carpeta" : "Comprimido"} · {formatItemSize(item)}</span>
                    </div>
                    <label>
                      Título
                      <input
                        disabled={item.status === "importing" || item.status === "completed"}
                        onChange={(event) => updateQueueItemTitle(item.id, event.target.value)}
                        value={item.chapterTitle}
                      />
                    </label>
                    <p className={`queue-item-message ${item.status}`}>
                      {queueItemResultMessage(item)}
                    </p>
                    {item.duplicateWarning ? (
                      <div className="duplicate-warning queue-warning">
                        <h2>{item.duplicateWarning.message}</h2>
                        {item.duplicateWarning.chapters.map((warning) => (
                          <div
                            className="duplicate-warning-item"
                            key={`${item.id}-${warning.incomingTitle}-${warning.existingChapter.id}`}
                          >
                            <p>
                              <strong>{warning.incomingTitle}</strong> se parece a{" "}
                              <strong>{warning.existingChapter.title}</strong>
                            </p>
                            <p>
                              Capítulo relacionado: {warning.existingChapter.title}
                              {warning.existingChapter.originalFilename
                                ? ` · ${warning.existingChapter.originalFilename}`
                                : ""}{" "}
                              · {warning.existingChapter.pageCount} página{warning.existingChapter.pageCount === 1 ? "" : "s"}
                            </p>
                            <p>
                              Entrada nueva: {warning.incomingOriginalFilename || warning.incomingTitle} ·{" "}
                              {warning.incomingPageCount} página{warning.incomingPageCount === 1 ? "" : "s"}
                            </p>
                            <ul className="duplicate-reasons">
                              {warning.reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {item.result?.skippedChapters?.length > 0 ? (
                      <div className="queue-result-detail">
                        <strong>Duplicados omitidos</strong>
                        <ul>
                          {item.result.skippedChapters.map((chapter) => (
                            <li key={`${item.id}-${chapter.title}`}>
                              {chapter.title}: {chapter.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {item.errorDetail?.error && item.errorDetail.error !== item.error ? (
                      <p className="queue-error-detail">{item.errorDetail.error}</p>
                    ) : null}
                    {item.error ? <p className="error">{item.error}</p> : null}
                  </div>
                  <div className="queue-item-actions">
                    <span className={`queue-status ${item.status}`}>
                      {QUEUE_LABELS[item.status]}
                    </span>
                    {item.status === "warning" ? (
                      <button
                        className="accent-button"
                        disabled={isProcessing}
                        onClick={() => continueWarningItem(item)}
                        type="button"
                      >
                        Continuar
                      </button>
                    ) : null}
                    <button
                      disabled={item.status === "importing"}
                      onClick={() => removeQueueItem(item.id)}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {status.error ? <p className="error">{status.error}</p> : null}
        {status.success ? <p className="success">{status.success}</p> : null}

        <div className="upload-submit-row">
          <button className="primary-button" disabled={!canSubmit}>
            {isProcessing ? "Procesando cola..." : "Subir cola"}
          </button>
          {targetMangaId ? (
            <button onClick={() => onNavigate(`/manga/${targetMangaId}`)} type="button">
              Ver manga
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
