import { useEffect, useState } from "react";
import { getLibrary } from "../api.js";

export function LibraryPage({ onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    mangas: []
  });

  useEffect(() => {
    let alive = true;

    getLibrary()
      .then((data) => {
        if (alive) {
          setState({ loading: false, error: "", mangas: data.mangas });
        }
      })
      .catch((error) => {
        if (alive) {
          setState({ loading: false, error: error.message, mangas: [] });
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) {
    return <p className="muted">Cargando biblioteca...</p>;
  }

  if (state.error) {
    return <p className="error">{state.error}</p>;
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Biblioteca local</p>
          <h1>Tu coleccion</h1>
        </div>
        <button className="primary-button" onClick={() => onNavigate("/upload")}>
          Subir capitulo
        </button>
      </div>

      {state.mangas.length === 0 ? (
        <div className="empty-state">
          <h2>No hay mangas todavia</h2>
          <p>Subi tu primer `.zip`, `.cbz`, `.rar` o `.cbr` para empezar.</p>
          <button className="primary-button" onClick={() => onNavigate("/upload")}>
            Subir archivo
          </button>
        </div>
      ) : (
        <div className="item-grid">
          {state.mangas.map((manga) => (
            <button
              className="library-item"
              key={manga.id}
              onClick={() => onNavigate(`/manga/${manga.id}`)}
            >
              <span>{manga.title}</span>
              <small>
                {manga.chapterCount} capitulo{manga.chapterCount === 1 ? "" : "s"}
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
