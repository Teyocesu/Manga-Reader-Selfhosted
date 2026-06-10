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
    return <p className="status-card">Cargando biblioteca...</p>;
  }

  if (state.error) {
    return <p className="status-card error">{state.error}</p>;
  }

  return (
    <section className="page-section">
      <div className="catalog-hero">
        <div>
          <p className="eyebrow">Biblioteca local</p>
          <h1>Tu colección manga/manhwa</h1>
          <p className="hero-copy">
            Organizá tus archivos propios y retomá la lectura desde cualquier
            dispositivo en tu Wi-Fi.
          </p>
        </div>
        <button className="primary-button" onClick={() => onNavigate("/upload")}>
          Subir capitulo
        </button>
      </div>

      {state.mangas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-cover" aria-hidden="true">MR</div>
          <h2>No hay mangas todavia</h2>
          <p>Subi tu primer `.zip`, `.cbz`, `.rar` o `.cbr` para empezar.</p>
          <button className="primary-button" onClick={() => onNavigate("/upload")}>
            Subir archivo
          </button>
        </div>
      ) : (
        <div className="manga-grid">
          {state.mangas.map((manga) => (
            <article className="manga-card" key={manga.id}>
              <button className="cover-button" onClick={() => onNavigate(`/manga/${manga.id}`)}>
                <span className="cover-placeholder">{manga.title.slice(0, 2).toUpperCase()}</span>
              </button>
              <div className="manga-card-body">
                <h2>{manga.title}</h2>
                <p>
                  {manga.chapterCount} capitulo{manga.chapterCount === 1 ? "" : "s"}
                </p>
                <div className="card-actions">
                  <button onClick={() => onNavigate(`/manga/${manga.id}`)}>Ver</button>
                  {manga.continueChapter ? (
                    <button
                      className="accent-button"
                      onClick={() => onNavigate(`/chapter/${manga.continueChapter.id}`)}
                    >
                      Continuar
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
