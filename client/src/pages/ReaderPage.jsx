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
  const [jumpValue, setJumpValue] = useState("1");
  const [isImmersive, setIsImmersive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveState, setSaveState] = useState("");
  const imageRefs = useRef([]);
  const readerRef = useRef(null);
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
        setJumpValue(String(safeIndex + 1));
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
    setJumpValue(String(currentPageIndex + 1));
  }, [currentPageIndex]);

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

  useEffect(() => {
    document.body.classList.toggle("reader-immersive-active", isImmersive);

    return () => {
      document.body.classList.remove("reader-immersive-active");
    };
  }, [isImmersive]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!state.data) {
        return;
      }

      const tagName = event.target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return;
      }

      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        setIsImmersive((value) => !value);
      }

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFullscreen();
      }

      if (mode === "page" && event.key === "ArrowLeft") {
        event.preventDefault();
        previousPage();
      }

      if (mode === "page" && event.key === "ArrowRight") {
        event.preventDefault();
        nextPage();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (state.loading) {
    return <p className="status-card">Cargando capitulo...</p>;
  }

  if (state.error) {
    return <p className="status-card error">{state.error}</p>;
  }

  const { manga, chapter, pages } = state.data;
  const currentPage = pages[currentPageIndex];
  const pageCount = pages.length;
  const progressPercent = Math.round(((currentPageIndex + 1) / pageCount) * 100);
  const remainingPages = Math.max(0, pageCount - currentPageIndex - 1);

  function previousPage() {
    setCurrentPageIndex((value) => Math.max(0, value - 1));
  }

  function nextPage() {
    setCurrentPageIndex((value) => Math.min(pageCount - 1, value + 1));
  }

  function goToPage(pageNumber) {
    const targetPage = Number.parseInt(pageNumber, 10);
    if (!Number.isInteger(targetPage)) {
      setJumpValue(String(currentPageIndex + 1));
      return;
    }

    const nextIndex = Math.min(Math.max(targetPage - 1, 0), pageCount - 1);
    setCurrentPageIndex(nextIndex);
    setJumpValue(String(nextIndex + 1));

    if (mode === "webtoon") {
      imageRefs.current[nextIndex]?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    }
  }

  function handleJumpSubmit(event) {
    event.preventDefault();
    goToPage(jumpValue);
  }

  function setReaderMode(nextMode) {
    setMode(nextMode);
    if (nextMode === "webtoon") {
      window.setTimeout(() => {
        imageRefs.current[currentPageIndex]?.scrollIntoView({
          block: "start",
          behavior: "smooth"
        });
      }, 0);
    }
  }

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await (readerRef.current || document.documentElement).requestFullscreen();
  }

  return (
    <section
      className={`reader-page ${mode === "webtoon" ? "webtoon-mode" : "page-mode"} ${isImmersive ? "immersive" : ""}`}
      ref={readerRef}
    >
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
            onClick={() => setReaderMode("page")}
          >
            Pagina
          </button>
          <button
            className={mode === "webtoon" ? "active" : ""}
            onClick={() => setReaderMode("webtoon")}
          >
            Webtoon
          </button>
        </div>
        <div className="reader-actions">
          <button onClick={() => setIsImmersive((value) => !value)}>
            {isImmersive ? "Mostrar UI" : "Modo inmersivo"}
          </button>
          <button onClick={toggleFullscreen} disabled={!document.fullscreenEnabled}>
            {isFullscreen ? "Salir pantalla completa" : "Pantalla completa"}
          </button>
        </div>
      </div>

      <div className="reader-status">
        <div className="progress-track" aria-label={`Progreso ${progressPercent}%`}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <p>
          Pagina {currentPageIndex + 1} de {pageCount} · {progressPercent}% · Quedan{" "}
          {remainingPages} pagina{remainingPages === 1 ? "" : "s"}
          {saveState ? ` · ${saveState}` : ""}
        </p>
      </div>

      <form className="reader-jump-panel" onSubmit={handleJumpSubmit}>
        <label>
          Ir a página
          <input
            inputMode="numeric"
            max={pageCount}
            min="1"
            onChange={(event) => setJumpValue(event.target.value)}
            type="number"
            value={jumpValue}
          />
        </label>
        <button type="submit">Ir</button>
      </form>

      {isImmersive ? (
        <div className="reader-floating-controls">
          <button onClick={() => setIsImmersive(false)}>Mostrar UI</button>
          <button onClick={toggleFullscreen} disabled={!document.fullscreenEnabled}>
            {isFullscreen ? "Salir" : "Pantalla completa"}
          </button>
          <span>
            {currentPageIndex + 1}/{pageCount} · {progressPercent}%
          </span>
        </div>
      ) : null}

      {mode === "page" ? (
        <div className="page-reader">
          <button className="reader-nav-button" onClick={previousPage} disabled={currentPageIndex === 0}>
            Anterior
          </button>
          <div className="page-frame">
            <img src={imageUrl(currentPage.imageUrl)} alt={`Pagina ${currentPageIndex + 1}`} />
          </div>
          <button className="reader-nav-button" onClick={nextPage} disabled={currentPageIndex >= pageCount - 1}>
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
