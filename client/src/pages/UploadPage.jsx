import { useEffect, useState } from "react";
import { getAppConfig, uploadChapter } from "../api.js";

export function UploadPage({ onNavigate }) {
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [archive, setArchive] = useState(null);
  const [appConfig, setAppConfig] = useState({
    upload: {
      maxUploadMb: 1024,
      supportedFormats: [".zip", ".cbz", ".rar", ".cbr"]
    }
  });
  const [status, setStatus] = useState({ loading: false, error: "", success: "" });
  const [importedSubmissionKey, setImportedSubmissionKey] = useState("");

  const fileKey = archive
    ? `${archive.name}:${archive.size}:${archive.lastModified}`
    : "";
  const submissionKey = [
    mangaTitle.trim().toLowerCase(),
    chapterTitle.trim().toLowerCase(),
    fileKey
  ].join("|");
  const alreadyImportedFromSelection =
    Boolean(fileKey) && importedSubmissionKey === submissionKey;
  const submitDisabled = status.loading || alreadyImportedFromSelection;
  const previewTitle = archive
    ? chapterTitle.trim() || titleFromFilename(archive.name)
    : "";

  useEffect(() => {
    let alive = true;

    getAppConfig()
      .then((config) => {
        if (alive) {
          setAppConfig(config);
        }
      })
      .catch(() => {
        if (alive) {
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
  }, []);

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

  async function handleSubmit(event) {
    event.preventDefault();

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
      const result = await uploadChapter({ mangaTitle, chapterTitle, archive });
      setImportedSubmissionKey(submissionKey);

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
      setStatus({ loading: false, error: error.message, success: "" });
    }
  }

  return (
    <section className="page-section upload-layout">
      <div className="upload-intro">
        <p className="eyebrow">Upload local</p>
        <h1>Importar manga</h1>
        <p className="hero-copy">
          Cargá un archivo propio, el servidor lo valida y guarda capítulos o
          tomos en tu storage local.
        </p>
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        <label>
          Manga
          <input
            value={mangaTitle}
            onChange={(event) => {
              setMangaTitle(event.target.value);
              setStatus((current) => ({ ...current, success: "" }));
            }}
            placeholder="Ej: One-shot personal"
            required
          />
        </label>

        <label>
          Título base (opcional)
          <input
            value={chapterTitle}
            onChange={(event) => {
              setChapterTitle(event.target.value);
              setStatus((current) => ({ ...current, success: "" }));
            }}
            placeholder="Ej: Tomo 01"
          />
        </label>

        <label>
          Archivo `.zip`, `.cbz`, `.rar` o `.cbr`
          <span className="file-drop">
            <strong>Elegir archivo</strong>
            <small>Formatos locales soportados, sin descargas externas</small>
            <input
              accept=".zip,.cbz,.rar,.cbr"
              type="file"
              onChange={(event) => {
                setArchive(event.target.files?.[0] || null);
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
        {previewTitle ? (
          <p className="form-help">
            Se importará como: {previewTitle}. Si es un pack, se usarán los nombres de los archivos internos.
          </p>
        ) : null}

        {status.error ? <p className="error">{status.error}</p> : null}
        {status.success ? <p className="success">{status.success}</p> : null}
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
