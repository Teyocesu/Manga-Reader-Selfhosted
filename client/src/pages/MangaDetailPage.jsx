import { useEffect, useState } from "react";
import {
  deleteChapter,
  deleteManga,
  getManga,
  imageUrl,
  reorderChapters,
  updateChapter,
  updateManga
} from "../api.js";
import { MangaThumbnail } from "../components/MangaThumbnail.jsx";

function formatDate(value) {
  if (!value) {
    return "Sin lecturas todavía";
  }

  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function chapterProgressPercent(chapter) {
  if (!chapter.progress || chapter.pageCount === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round(((chapter.progress.currentPageIndex + 1) / chapter.pageCount) * 100)
  );
}

export function MangaDetailPage({ mangaId, onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    manga: null,
    message: ""
  });
  const [mangaTitleDraft, setMangaTitleDraft] = useState("");
  const [chapterTitleDrafts, setChapterTitleDrafts] = useState({});
  const [movingChapterId, setMovingChapterId] = useState("");

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
          setMangaTitleDraft(manga.title);
          setChapterTitleDrafts(
            Object.fromEntries(
              manga.chapters.map((chapter) => [chapter.id, chapter.title])
            )
          );
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

  async function handleSaveMangaTitle(event) {
    event.preventDefault();

    try {
      const manga = await updateManga(mangaId, { title: mangaTitleDraft });
      setState((current) => ({
        ...current,
        error: "",
        message: "Título de manga actualizado.",
        manga
      }));
      setMangaTitleDraft(manga.title);
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  }

  async function handleSaveChapterTitle(event, chapter) {
    event.preventDefault();

    try {
      await updateChapter(chapter.id, { title: chapterTitleDrafts[chapter.id] });
      setState((current) => ({
        ...current,
        error: "",
        message: `Se actualizó "${chapter.title}".`
      }));
      loadManga();
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

  async function handleMoveChapter(chapterIndex, direction) {
    const chapters = state.manga.chapters;
    const nextIndex = chapterIndex + direction;
    if (nextIndex < 0 || nextIndex >= chapters.length) {
      return;
    }

    const orderedChapterIds = chapters.map((chapter) => chapter.id);
    [orderedChapterIds[chapterIndex], orderedChapterIds[nextIndex]] = [
      orderedChapterIds[nextIndex],
      orderedChapterIds[chapterIndex]
    ];

    setMovingChapterId(chapters[chapterIndex].id);
    try {
      const manga = await reorderChapters(mangaId, orderedChapterIds);
      setState((current) => ({
        ...current,
        error: "",
        message: "Orden de capítulos actualizado.",
        manga
      }));
      setChapterTitleDrafts(
        Object.fromEntries(manga.chapters.map((chapter) => [chapter.id, chapter.title]))
      );
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setMovingChapterId("");
    }
  }

  if (state.loading) {
    return <p className="status-card">Cargando manga...</p>;
  }

  if (state.error) {
    return <p className="status-card error">{state.error}</p>;
  }

  const chapters = state.manga.chapters;
  const firstChapter = chapters[0];

  return (
    <section className="page-section">
      <button className="text-button" onClick={() => onNavigate("/")}>
        Volver
      </button>
      <div className="manga-detail-hero">
        <div className="detail-cover">
          <MangaThumbnail
            className="detail-cover-image"
            placeholderClassName="detail-cover-placeholder"
            title={state.manga.title}
            url={state.manga.thumbnailUrl ? imageUrl(state.manga.thumbnailUrl) : ""}
          />
        </div>
        <div>
          <p className="eyebrow">Manga</p>
          <h1>{state.manga.title}</h1>
          <p className="hero-copy">
            {state.manga.chapters.length} capítulo
            {state.manga.chapters.length === 1 ? "" : "s"} disponible
            {state.manga.chapters.length === 1 ? "" : "s"}.
          </p>
          <dl className="detail-stats">
            <div>
              <dt>Páginas</dt>
              <dd>{state.manga.totalPageCount}</dd>
            </div>
            <div>
              <dt>Progreso</dt>
              <dd>{state.manga.progressPercent}%</dd>
            </div>
            <div>
              <dt>Última lectura</dt>
              <dd>{formatDate(state.manga.lastReadAt)}</dd>
            </div>
          </dl>
          <details className="edit-panel">
            <summary>Editar título</summary>
            <form className="inline-edit-form" onSubmit={handleSaveMangaTitle}>
              <label>
                Título del manga
                <input
                  value={mangaTitleDraft}
                  onChange={(event) => setMangaTitleDraft(event.target.value)}
                />
              </label>
              <button type="submit">Guardar</button>
            </form>
          </details>
          <div className="detail-actions">
            {firstChapter ? (
              <button
                className="accent-button"
                onClick={() => onNavigate(`/chapter/${firstChapter.id}?start=1`)}
              >
                Leer desde inicio
              </button>
            ) : null}
            <button
              className="primary-button"
              onClick={() => onNavigate(`/upload?mangaId=${state.manga.id}`)}
            >
              Subir continuación
            </button>
            <button className="danger-button" onClick={handleDeleteManga}>
              Borrar manga
            </button>
          </div>
        </div>
      </div>

      {state.message ? <p className="success">{state.message}</p> : null}

      <div className="chapter-list">
        {chapters.map((chapter, index) => (
          <article className="chapter-row" key={chapter.id}>
            <div>
              <h2>{chapter.title}</h2>
              <p>
                {chapter.pageCount} página{chapter.pageCount === 1 ? "" : "s"}
                {chapter.progress
                  ? ` · ${chapterProgressPercent(chapter)}% leído · página ${chapter.progress.currentPageIndex + 1}`
                  : ""}
              </p>
              <div className="mini-progress" aria-label={`Progreso ${chapterProgressPercent(chapter)}%`}>
                <span style={{ width: `${chapterProgressPercent(chapter)}%` }} />
              </div>
              <details className="edit-panel compact">
                <summary>Editar título</summary>
                <form
                  className="inline-edit-form compact"
                  onSubmit={(event) => handleSaveChapterTitle(event, chapter)}
                >
                  <label>
                    Título
                    <input
                      value={chapterTitleDrafts[chapter.id] ?? chapter.title}
                      onChange={(event) => {
                        setChapterTitleDrafts((current) => ({
                          ...current,
                          [chapter.id]: event.target.value
                        }));
                      }}
                    />
                  </label>
                  <button type="submit">Guardar</button>
                </form>
              </details>
            </div>
            <div className="chapter-actions">
              <button
                disabled={index === 0 || movingChapterId === chapter.id}
                onClick={() => handleMoveChapter(index, -1)}
                type="button"
              >
                Subir
              </button>
              <button
                disabled={index === chapters.length - 1 || movingChapterId === chapter.id}
                onClick={() => handleMoveChapter(index, 1)}
                type="button"
              >
                Bajar
              </button>
              {chapter.progress ? (
                <button
                  className="accent-button"
                  onClick={() => onNavigate(`/chapter/${chapter.id}`)}
                >
                  Continuar
                </button>
              ) : null}
              <button
                className="primary-button"
                onClick={() => onNavigate(`/chapter/${chapter.id}?start=1`)}
              >
                Leer desde inicio
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
