import { useEffect, useState } from "react";
import { deleteChapter, deleteManga, getManga, imageUrl } from "../api.js";

export function MangaDetailPage({ mangaId, onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    manga: null,
    message: ""
  });

  function loadManga() {
    let alive = true;

    getManga(mangaId)
      .then((manga) => {
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: "",
            manga
          }));
        }
      })
      .catch((error) => {
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error.message,
            manga: null
          }));
        }
      });

    return () => {
      alive = false;
    };
  }

  useEffect(() => {
    setState({ loading: true, error: "", manga: null, message: "" });
    return loadManga();
  }, [mangaId]);

  async function handleDeleteManga() {
    const confirmed = window.confirm(
      "Esto eliminará el manga completo, capítulos, progreso, páginas y miniatura."
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteManga(mangaId);
      onNavigate("/");
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  }

  async function handleDeleteChapter(chapter) {
    const confirmed = window.confirm(
      "Esto eliminará el capítulo y sus páginas del storage local."
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteChapter(chapter.id);
      setState((current) => ({
        ...current,
        message: `Se eliminó "${chapter.title}".`
      }));
      loadManga();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  }

  if (state.loading) {
    return <p className="status-card">Cargando manga...</p>;
  }

  if (state.error) {
    return <p className="status-card error">{state.error}</p>;
  }

  return (
    <section className="page-section">
      <button className="text-button" onClick={() => onNavigate("/")}>
        Volver
      </button>
      <div className="manga-detail-hero">
        <div className="detail-cover">
          {state.manga.thumbnailUrl ? (
            <img
              alt={`Portada de ${state.manga.title}`}
              className="detail-cover-image"
              src={imageUrl(state.manga.thumbnailUrl)}
            />
          ) : (
            state.manga.title.slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <p className="eyebrow">Manga</p>
          <h1>{state.manga.title}</h1>
          <p className="hero-copy">
            {state.manga.chapters.length} capitulo
            {state.manga.chapters.length === 1 ? "" : "s"} disponible
            {state.manga.chapters.length === 1 ? "" : "s"}.
          </p>
          <button className="danger-button" onClick={handleDeleteManga}>
            Borrar manga
          </button>
        </div>
      </div>

      {state.message ? <p className="success">{state.message}</p> : null}

      <div className="chapter-list">
        {state.manga.chapters.map((chapter) => (
          <article className="chapter-row" key={chapter.id}>
            <div>
              <h2>{chapter.title}</h2>
              <p>
                {chapter.pageCount} pagina{chapter.pageCount === 1 ? "" : "s"}
                {chapter.progress
                  ? ` · progreso en página ${chapter.progress.currentPageIndex + 1}`
                  : ""}
              </p>
            </div>
            <div className="chapter-actions">
              <button
                className={chapter.progress ? "accent-button" : "primary-button"}
                onClick={() => onNavigate(`/chapter/${chapter.id}`)}
              >
                {chapter.progress ? "Continuar" : "Leer"}
              </button>
              <button className="danger-button" onClick={() => handleDeleteChapter(chapter)}>
                Borrar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
