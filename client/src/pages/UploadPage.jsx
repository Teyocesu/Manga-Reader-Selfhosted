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
  const [status, setStatus] = useState({ loading: false, error: "" });

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
            error: "No se pudo conectar con el servidor. Revisá que el backend esté corriendo."
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

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ loading: true, error: "" });

    try {
      const result = await uploadChapter({ mangaTitle, chapterTitle, archive });
      onNavigate(`/manga/${result.manga.id}`);
    } catch (error) {
      setStatus({ loading: false, error: error.message });
    }
  }

  return (
    <section className="page-section upload-layout">
      <div className="upload-intro">
        <p className="eyebrow">Upload local</p>
        <h1>Sumar un capítulo</h1>
        <p className="hero-copy">
          Cargá un archivo propio, el servidor lo valida y guarda las páginas
          en tu storage local.
        </p>
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        <label>
          Manga
          <input
            value={mangaTitle}
            onChange={(event) => setMangaTitle(event.target.value)}
            placeholder="Ej: One-shot personal"
            required
          />
        </label>

        <label>
          Capitulo
          <input
            value={chapterTitle}
            onChange={(event) => setChapterTitle(event.target.value)}
            placeholder="Ej: Capitulo 1"
            required
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
              onChange={(event) => setArchive(event.target.files?.[0] || null)}
              required
            />
          </span>
        </label>
        <p className="form-help">
          Formatos: {appConfig.upload.supportedFormats.join(", ")} · límite actual:{" "}
          {appConfig.upload.maxUploadMb} MB
        </p>
        {archive ? <p className="file-summary">{formatFileSize(archive)}</p> : null}

        {status.error ? <p className="error">{status.error}</p> : null}

        <button className="primary-button" disabled={status.loading}>
          {status.loading ? "Procesando archivo..." : "Subir"}
        </button>
      </form>
    </section>
  );
}
