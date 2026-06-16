import { useEffect, useRef, useState } from "react";
import { getAppConfig, getLibrary, uploadChapter } from "../api.js";

export function UploadPage({ initialMangaId = "", onNavigate }) {
  const [importMode, setImportMode] = useState(initialMangaId ? "existing" : "new");
  const [selectedMangaId, setSelectedMangaId] = useState(initialMangaId);
  const [mangas, setMangas] = useState([]);
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [archive, setArchive] = useState(null);
  const [appConfig, setAppConfig] = useState({
    upload: {
      maxUploadMb: 1024,
      supportedFormats: [".zip", ".cbz", ".rar", ".cbr"]
    }
  });
  const [setupLoading, setSetupLoading] = useState(true);
  const [status, setStatus] = useState({ loading: false, error: "", success: "" });
  const [importedSubmissionKey, setImportedSubmissionKey] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const fileInputRef = useRef(null);

  const fileKey = archive
    ? `${archive.name}:${archive.size}:${archive.lastModified}`
    : "";
  const submissionKey = [
    importMode,
    selectedMangaId,
    mangaTitle.trim().toLowerCase(),
    chapterTitle.trim().toLowerCase(),
    fileKey
  ].join("|");
  const alreadyImportedFromSelection =
    Boolean(fileKey) && importedSubmissionKey === submissionKey;
  const submitDisabled =
    status.loading ||
    setupLoading ||
    alreadyImportedFromSelection ||
    Boolean(duplicateWarning) ||
    (importMode === "existing" && !selectedMangaId);
  const previewTitle = archive
    ? chapterTitle.trim() || titleFromFilename(archive.name)
    : "";
  const selectedManga = mangas.find((manga) => manga.id === selectedMangaId);

  useEffect(() => {
    let alive = true;

    setSetupLoading(true);
    setImportMode(initialMangaId ? "existing" : "new");
    setSelectedMangaId(initialMangaId);
    setImportedSubmissionKey("");
    setStatus({ loading: false, error: "", success: "" });

    Promise.all([getAppConfig(), getLibrary()])
      .then(([config, library]) => {
        if (alive) {
          setAppConfig(config);
          setMangas(library.mangas);
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
            loading: false,
            error: "No se pudo conectar con el servidor. Revisá que el backend esté corriendo.",
            success: ""
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [initialMangaId]);

  function formatFileSize(file) {
    if (!file) {
      return "";
    }

    const sizeMb = file.size / (1024 * 1024);
    return `${file.name} · ${sizeMb >= 1 ? sizeMb.toFixed(1) : "<1"} MB`;
  }

  function titleFromFilename(filename) {
    return filename
      .replace(/\.[^.]+$/, "")
      .replace(/[\x00-\x1f]/g, "")
      .trim()
      .replace(/\s+/g, " ") || "Capítulo";
  }

  function formatUploadSummary(result) {
    if (result.message) {
      return result.message;
    }

    if (result.totalChapters > 1) {
      return `Pack importado: ${result.totalChapters} capítulos, ${result.totalPages} páginas.`;
    }

    if (result.totalChapters === 1) {
      const skipped = result.totalSkipped
        ? ` Se omitieron ${result.totalSkipped} duplicado${result.totalSkipped === 1 ? "" : "s"}.`
        : "";
      return `Importado: 1 capítulo, ${result.totalPages} páginas.${skipped}`;
    }

    if (result.totalSkipped > 0) {
      return `No se importaron capítulos nuevos: ${result.totalSkipped} ya existía${result.totalSkipped === 1 ? "" : "n"}.`;
    }

    return "Importación finalizada.";
  }

  function clearDuplicateWarning() {
    setDuplicateWarning(null);
  }

  function cancelDuplicateWarning() {
    setDuplicateWarning(null);
    setArchive(null);
    setStatus({ loading: false, error: "", success: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function submitUpload(confirmPotentialDuplicate = false) {
    if (alreadyImportedFromSelection) {
      setStatus({
        loading: false,
        error: "",
        success: "Este archivo ya fue importado desde esta selección. Elegí otro archivo o cambiá los datos para volver a subir."
      });
      return;
    }

    setStatus({ loading: true, error: "", success: "" });

    try {
      const result = await uploadChapter({
        mangaId: importMode === "existing" ? selectedMangaId : "",
        mangaTitle,
        chapterTitle,
        archive,
        confirmPotentialDuplicate
      });
      setImportedSubmissionKey(submissionKey);
      setDuplicateWarning(null);

      if ("totalChapters" in result) {
        setStatus({
          loading: false,
          error: "",
          success: formatUploadSummary(result)
        });
        return;
      }

      onNavigate(`/manga/${result.manga.id}`);
    } catch (error) {
      if (error.status === 409 && error.body?.duplicateWarning) {
        setDuplicateWarning(error.body.duplicateWarning);
        setStatus({ loading: false, error: "", success: "" });
        return;
      }

      setStatus({ loading: false, error: error.message, success: "" });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await submitUpload(false);
  }

  return (
    <section className="page-section upload-layout">
      <div className="upload-intro">
        <p className="eyebrow">Importación local</p>
        <h1>{importMode === "existing" ? "Subir continuación" : "Importar manga"}</h1>
        <p className="hero-copy">
          Cargá un archivo propio, el servidor lo valida y guarda capítulos o
          tomos en tu storage local.
        </p>
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        {setupLoading ? (
          <p className="file-summary">Cargando configuración y biblioteca...</p>
        ) : null}

        <div className="mode-toggle upload-mode-toggle" aria-label="Tipo de importación">
          <button
            className={importMode === "new" ? "active" : ""}
            onClick={() => {
              setImportMode("new");
              clearDuplicateWarning();
              setStatus((current) => ({ ...current, success: "" }));
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
              clearDuplicateWarning();
              setStatus((current) => ({ ...current, success: "" }));
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
                clearDuplicateWarning();
                setStatus((current) => ({ ...current, success: "" }));
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
                clearDuplicateWarning();
                setStatus((current) => ({ ...current, success: "" }));
              }}
              placeholder="Ej: One-shot personal"
              required
            />
          </label>
        )}

        <label>
          Título base (opcional)
          <input
            value={chapterTitle}
            onChange={(event) => {
              setChapterTitle(event.target.value);
              clearDuplicateWarning();
              setStatus((current) => ({ ...current, success: "" }));
            }}
            placeholder="Ej: Tomo 01"
          />
        </label>

        <label>
          Archivo .zip, .cbz, .rar o .cbr
          <span className="file-drop">
            <strong>Elegir archivo</strong>
            <small>Formatos locales soportados, sin descargas externas</small>
            <input
              accept=".zip,.cbz,.rar,.cbr"
              ref={fileInputRef}
              type="file"
              onChange={(event) => {
                setArchive(event.target.files?.[0] || null);
                clearDuplicateWarning();
                setStatus((current) => ({ ...current, success: "" }));
              }}
              required
            />
          </span>
        </label>
        <p className="form-help">
          Formatos: {appConfig.upload.supportedFormats.join(", ")} · límite actual:{" "}
          {appConfig.upload.maxUploadMb} MB
        </p>
        {archive ? <p className="file-summary">{formatFileSize(archive)}</p> : null}
        {importMode === "existing" && selectedManga ? (
          <p className="form-help">Se agregará a: {selectedManga.title}.</p>
        ) : null}
        {previewTitle ? (
          <p className="form-help">
            Se importará como: {previewTitle}. Si es un pack, se usarán los nombres de los archivos internos.
          </p>
        ) : null}

        {status.error ? <p className="error">{status.error}</p> : null}
        {status.success ? <p className="success">{status.success}</p> : null}
        {duplicateWarning ? (
          <div className="duplicate-warning">
            <h2>{duplicateWarning.message}</h2>
            {duplicateWarning.chapters.map((warning) => (
              <div className="duplicate-warning-item" key={`${warning.incomingTitle}-${warning.existingChapter.id}`}>
                <p>
                  <strong>{warning.incomingTitle}</strong> se parece a{" "}
                  <strong>{warning.existingChapter.title}</strong>
                </p>
                <p>
                  {warning.existingChapter.pageCount} página{warning.existingChapter.pageCount === 1 ? "" : "s"} ·{" "}
                  {warning.reasons.join(", ")}
                </p>
              </div>
            ))}
            <div className="duplicate-warning-actions">
              <button onClick={cancelDuplicateWarning} type="button">
                Cancelar
              </button>
              <button
                className="accent-button"
                disabled={status.loading || !duplicateWarning.canContinue}
                onClick={() => submitUpload(true)}
                type="button"
              >
                {status.loading ? "Procesando..." : "Continuar de todos modos"}
              </button>
            </div>
          </div>
        ) : null}
        {alreadyImportedFromSelection ? (
          <p className="form-help">
            Este archivo ya fue importado desde esta selección. Elegí otro archivo o cambiá los datos.
          </p>
        ) : null}

        <button className="primary-button" disabled={submitDisabled}>
          {status.loading ? "Procesando archivo..." : "Subir"}
        </button>
      </form>
    </section>
  );
}
