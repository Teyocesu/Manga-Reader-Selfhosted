import { useState } from "react";
import { uploadChapter } from "../api.js";

export function UploadPage({ onNavigate }) {
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [archive, setArchive] = useState(null);
  const [status, setStatus] = useState({ loading: false, error: "" });

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
    <section className="page-section">
      <p className="eyebrow">Upload local</p>
      <h1>Subir capitulo</h1>

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
          <input
            accept=".zip,.cbz,.rar,.cbr"
            type="file"
            onChange={(event) => setArchive(event.target.files?.[0] || null)}
            required
          />
        </label>

        {status.error ? <p className="error">{status.error}</p> : null}

        <button className="primary-button" disabled={status.loading}>
          {status.loading ? "Subiendo..." : "Subir"}
        </button>
      </form>
    </section>
  );
}
