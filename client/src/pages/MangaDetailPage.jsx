import { useEffect, useState } from "react";
import { getManga } from "../api.js";

export function MangaDetailPage({ mangaId, onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    manga: null
  });

  useEffect(() => {
    let alive = true;

    getManga(mangaId)
      .then((manga) => {
        if (alive) {
          setState({ loading: false, error: "", manga });
        }
      })
      .catch((error) => {
        if (alive) {
          setState({ loading: false, error: error.message, manga: null });
        }
      });

    return () => {
      alive = false;
    };
  }, [mangaId]);

  if (state.loading) {
    return <p className="muted">Cargando manga...</p>;
  }

  if (state.error) {
    return <p className="error">{state.error}</p>;
  }

  return (
    <section className="page-section">
      <button className="text-button" onClick={() => onNavigate("/")}>
        Volver
      </button>
      <p className="eyebrow">Manga</p>
      <h1>{state.manga.title}</h1>

      <div className="chapter-list">
        {state.manga.chapters.map((chapter) => (
          <button
            className="chapter-row"
            key={chapter.id}
            onClick={() => onNavigate(`/chapter/${chapter.id}`)}
          >
            <span>{chapter.title}</span>
            <small>
              {chapter.pageCount} pagina{chapter.pageCount === 1 ? "" : "s"}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
