import { useEffect, useRef, useState } from "react";
import { getChapter, imageUrl, saveProgress } from "../api.js";

export function ReaderPage({ chapterId, onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null
  });
  const [mode, setMode] = useState("page");
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [saveState, setSaveState] = useState("");
  const imageRefs = useRef([]);
  const readyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    readyRef.current = false;

    getChapter(chapterId)
      .then((data) => {
        if (!alive) {
          return;
        }

        const pageCount = data.pages.length;
        const savedIndex = data.progress?.currentPageIndex ?? 0;
        const safeIndex = Math.min(Math.max(savedIndex, 0), Math.max(pageCount - 1, 0));
        setState({ loading: false, error: "", data });
        setMode(data.progress?.mode || "page");
        setCurrentPageIndex(safeIndex);
        window.setTimeout(() => {
          readyRef.current = true;
        }, 0);
      })
      .catch((error) => {
        if (alive) {
          setState({ loading: false, error: error.message, data: null });
        }
      });

    return () => {
      alive = false;
    };
  }, [chapterId]);

  useEffect(() => {
    if (!readyRef.current || !state.data) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveProgress(chapterId, { currentPageIndex, mode })
        .then(() => setSaveState("Guardado"))
        .catch(() => setSaveState("No se pudo guardar"));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [chapterId, currentPageIndex, mode, state.data]);

  useEffect(() => {
    if (mode !== "webtoon" || !state.data) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible) {
          const pageIndex = Number(visible.target.dataset.pageIndex);
          if (Number.isInteger(pageIndex)) {
            setCurrentPageIndex(pageIndex);
          }
        }
      },
      { threshold: [0.55, 0.75] }
    );

    for (const element of imageRefs.current) {
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [mode, state.data]);

  if (state.loading) {
    return <p className="muted">Cargando capitulo...</p>;
  }

  if (state.error) {
    return <p className="error">{state.error}</p>;
  }

  const { manga, chapter, pages } = state.data;
  const currentPage = pages[currentPageIndex];
  const pageCount = pages.length;

  function previousPage() {
    setCurrentPageIndex((value) => Math.max(0, value - 1));
  }

  function nextPage() {
    setCurrentPageIndex((value) => Math.min(pageCount - 1, value + 1));
  }

  return (
    <section className="reader-page">
      <div className="reader-topbar">
        <button className="text-button" onClick={() => onNavigate(`/manga/${manga.id}`)}>
          Volver
        </button>
        <div>
          <p className="eyebrow">{manga.title}</p>
          <h1>{chapter.title}</h1>
        </div>
        <div className="mode-toggle" aria-label="Modo de lectura">
          <button
            className={mode === "page" ? "active" : ""}
            onClick={() => setMode("page")}
          >
            Pagina
          </button>
          <button
            className={mode === "webtoon" ? "active" : ""}
            onClick={() => setMode("webtoon")}
          >
            Webtoon
          </button>
        </div>
      </div>

      <p className="reader-status">
        Pagina {currentPageIndex + 1} de {pageCount}
        {saveState ? ` · ${saveState}` : ""}
      </p>

      {mode === "page" ? (
        <div className="page-reader">
          <button onClick={previousPage} disabled={currentPageIndex === 0}>
            Anterior
          </button>
          <img src={imageUrl(currentPage.imageUrl)} alt={`Pagina ${currentPageIndex + 1}`} />
          <button onClick={nextPage} disabled={currentPageIndex >= pageCount - 1}>
            Siguiente
          </button>
        </div>
      ) : (
        <div className="webtoon-reader">
          {pages.map((page, index) => (
            <img
              alt={`Pagina ${index + 1}`}
              data-page-index={index}
              key={page.id}
              ref={(element) => {
                imageRefs.current[index] = element;
              }}
              src={imageUrl(page.imageUrl)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
