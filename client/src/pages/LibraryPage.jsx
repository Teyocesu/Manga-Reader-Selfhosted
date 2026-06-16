import { useEffect, useMemo, useState } from "react";
import { getLibrary, imageUrl } from "../api.js";
import { MangaThumbnail } from "../components/MangaThumbnail.jsx";
import { readPreference, writePreference } from "../utils/preferences.js";

const LIBRARY_SORT_KEY = "manga-reader.library-sort";
const LIBRARY_VIEW_KEY = "manga-reader.library-view";

const SORT_OPTIONS = [
  { value: "recent", label: "Actualizado recientemente" },
  { value: "alpha", label: "Alfabético" },
  { value: "chapters", label: "Más capítulos" },
  { value: "pending", label: "Progreso pendiente" }
];

function loadStoredSort() {
  const stored = readPreference(LIBRARY_SORT_KEY, "recent");
  return SORT_OPTIONS.some((option) => option.value === stored) ? stored : "recent";
}

function loadStoredView() {
  return readPreference(LIBRARY_VIEW_KEY) === "compact" ? "compact" : "large";
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function isPending(manga) {
  return manga.totalPageCount > 0 && manga.progressPercent > 0 && manga.progressPercent < 100;
}

function MangaCard({ manga, onNavigate, featured = false }) {
  return (
    <article className={featured ? "manga-card continue-card" : "manga-card"}>
      <button className="cover-button" onClick={() => onNavigate(`/manga/${manga.id}`)}>
        <MangaThumbnail
          className="cover-image"
          loading="lazy"
          placeholderClassName="cover-placeholder"
          title={manga.title}
          url={manga.thumbnailUrl ? imageUrl(manga.thumbnailUrl) : ""}
        />
      </button>
      <div className="manga-card-body">
        <h2>{manga.title}</h2>
        <p>
          {manga.chapterCount} capítulo{manga.chapterCount === 1 ? "" : "s"} ·{" "}
          {manga.progressPercent}% leído
        </p>
        <div className="mini-progress" aria-label={`Progreso ${manga.progressPercent}%`}>
          <span style={{ width: `${manga.progressPercent}%` }} />
        </div>
        {manga.continueChapter ? (
          <p className="last-read">
            Último: {manga.continueChapter.title}
            {manga.lastReadAt ? ` · ${formatDate(manga.lastReadAt)}` : ""}
          </p>
        ) : (
          <p className="last-read">Sin progreso todavía</p>
        )}
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
  );
}

function MangaCompactRow({ manga, onNavigate }) {
  return (
    <article className="manga-list-row">
      <button className="compact-cover-button" onClick={() => onNavigate(`/manga/${manga.id}`)}>
        <MangaThumbnail
          className="compact-cover-image"
          loading="lazy"
          placeholderClassName="compact-cover-placeholder"
          title={manga.title}
          url={manga.thumbnailUrl ? imageUrl(manga.thumbnailUrl) : ""}
        />
      </button>
      <div className="manga-list-main">
        <h2>{manga.title}</h2>
        <p>
          {manga.chapterCount} capítulo{manga.chapterCount === 1 ? "" : "s"} ·{" "}
          {manga.progressPercent}% leído
        </p>
        <div className="mini-progress" aria-label={`Progreso ${manga.progressPercent}%`}>
          <span style={{ width: `${manga.progressPercent}%` }} />
        </div>
        <p className="last-read">
          {manga.continueChapter
            ? `Último: ${manga.continueChapter.title}${manga.lastReadAt ? ` · ${formatDate(manga.lastReadAt)}` : ""}`
            : "Sin progreso todavía"}
        </p>
      </div>
      <div className="manga-list-actions">
        <button onClick={() => onNavigate(`/manga/${manga.id}`)}>Ver</button>
        <button
          className={manga.continueChapter ? "accent-button" : ""}
          disabled={!manga.continueChapter}
          onClick={() => onNavigate(`/chapter/${manga.continueChapter.id}`)}
        >
          Continuar
        </button>
      </div>
    </article>
  );
}

export function LibraryPage({ onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    mangas: []
  });
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState(loadStoredSort);
  const [viewMode, setViewMode] = useState(loadStoredView);

  useEffect(() => {
    let alive = true;

    getLibrary()
      .then((data) => {
        if (alive) {
          setState({ loading: false, error: "", mangas: data.mangas });
        }
      })
      .catch(() => {
        if (alive) {
          setState({
            loading: false,
            error: "No se pudo cargar la biblioteca. Revisá que el servidor esté corriendo.",
            mangas: []
          });
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    writePreference(LIBRARY_SORT_KEY, sortBy);
  }, [sortBy]);

  useEffect(() => {
    writePreference(LIBRARY_VIEW_KEY, viewMode);
  }, [viewMode]);

  const continueMangas = useMemo(
    () =>
      state.mangas
        .filter((manga) => manga.continueChapter)
        .sort((a, b) => new Date(b.lastReadAt || 0) - new Date(a.lastReadAt || 0))
        .slice(0, 4),
    [state.mangas]
  );

  const filteredMangas = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const mangas = state.mangas.filter((manga) =>
      manga.title.toLowerCase().includes(normalizedQuery)
    );

    return [...mangas].sort((a, b) => {
      if (sortBy === "alpha") {
        return a.title.localeCompare(b.title, "es", { numeric: true, sensitivity: "base" });
      }

      if (sortBy === "chapters") {
        return b.chapterCount - a.chapterCount || a.title.localeCompare(b.title, "es");
      }

      if (sortBy === "pending") {
        return (
          Number(isPending(b)) - Number(isPending(a)) ||
          a.progressPercent - b.progressPercent ||
          new Date(b.lastReadAt || b.updatedAt) - new Date(a.lastReadAt || a.updatedAt)
        );
      }

      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [query, sortBy, state.mangas]);

  if (state.loading) {
    return (
      <section className="page-section">
        <div className="status-card">
          <p className="eyebrow">Biblioteca</p>
          <h2>Cargando tu colección...</h2>
          <p className="muted">Estoy preparando mangas, progreso y portadas.</p>
        </div>
      </section>
    );
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
            Buscá, ordená y retomá tus lecturas desde Mac o iPhone.
          </p>
        </div>
        <button className="primary-button" onClick={() => onNavigate("/upload")}>
          Subir capítulo
        </button>
      </div>

      {state.mangas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-cover" aria-hidden="true">MR</div>
          <h2>Tu biblioteca está vacía</h2>
          <p>Subí tu primer `.zip`, `.cbz`, `.rar` o `.cbr` para empezar.</p>
          <button className="primary-button" onClick={() => onNavigate("/upload")}>
            Subir archivo
          </button>
        </div>
      ) : (
        <>
          {continueMangas.length > 0 ? (
            <section className="library-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Retomar</p>
                  <h2>Continuar leyendo</h2>
                </div>
              </div>
              <div className="continue-grid">
                {continueMangas.map((manga) => (
                  <MangaCard featured key={manga.id} manga={manga} onNavigate={onNavigate} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="library-block">
            <div className="section-heading library-toolbar-heading">
              <div>
                <p className="eyebrow">Colección</p>
                <h2>Biblioteca</h2>
              </div>
              <div className="library-toolbar">
                <label>
                  Buscar
                  <input
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Chainsaw, tomo, manhwa..."
                    type="search"
                    value={query}
                  />
                </label>
                <label>
                  Ordenar
                  <select onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="library-view-control">
                  <span>Vista</span>
                  <div className="mode-toggle library-view-toggle" aria-label="Vista de biblioteca">
                    <button
                      className={viewMode === "large" ? "active" : ""}
                      onClick={() => setViewMode("large")}
                      type="button"
                    >
                      Portadas
                    </button>
                    <button
                      className={viewMode === "compact" ? "active" : ""}
                      onClick={() => setViewMode("compact")}
                      type="button"
                    >
                      Lista
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {filteredMangas.length === 0 ? (
              <div className="empty-state compact-empty">
                <h2>No encontré mangas con ese título</h2>
                <p>Probá con otra búsqueda o limpiá el campo.</p>
              </div>
            ) : (
              <>
                {viewMode === "compact" ? (
                  <div className="manga-list">
                    {filteredMangas.map((manga) => (
                      <MangaCompactRow key={manga.id} manga={manga} onNavigate={onNavigate} />
                    ))}
                  </div>
                ) : (
                  <div className="manga-grid">
                    {filteredMangas.map((manga) => (
                      <MangaCard key={manga.id} manga={manga} onNavigate={onNavigate} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
