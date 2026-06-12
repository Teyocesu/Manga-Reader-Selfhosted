import { useEffect, useRef, useState } from "react";
import { getChapter, imageUrl, saveProgress } from "../api.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.jsx";
import { readPreference, writePreference } from "../utils/preferences.js";

const READER_MODE_KEY = "manga-reader.reader-mode";
const READER_IMMERSIVE_KEY = "manga-reader.reader-immersive";
const READER_IMMERSIVE_MENU_KEY = "manga-reader.reader-immersive-menu-open";
const READER_ZOOM_KEY = "manga-reader.reader-zoom";
const ZOOM_OPTIONS = [
  "50",
  "60",
  "70",
  "80",
  "90",
  "100",
  "110",
  "fit-page",
  "fit-height",
  "fit-width"
];
const ZOOM_LABELS = {
  "fit-height": "Fit height",
  "fit-page": "Fit page",
  "fit-width": "Fit width"
};

function loadPreferredMode() {
  return readPreference(READER_MODE_KEY) === "webtoon" ? "webtoon" : "page";
}

function loadPreferredImmersive() {
  return readPreference(READER_IMMERSIVE_KEY) === "1";
}

function loadPreferredImmersiveMenu() {
  return readPreference(READER_IMMERSIVE_MENU_KEY) === "1";
}

function loadPreferredZoom() {
  const stored = readPreference(READER_ZOOM_KEY, "100");
  return ZOOM_OPTIONS.includes(stored) ? stored : "100";
}

function zoomLabel(value) {
  return ZOOM_LABELS[value] || `${value}%`;
}

function nextZoom(value, direction) {
  const index = ZOOM_OPTIONS.indexOf(value);
  const safeIndex = index === -1 ? ZOOM_OPTIONS.indexOf("100") : index;
  return ZOOM_OPTIONS[Math.min(Math.max(safeIndex + direction, 0), ZOOM_OPTIONS.length - 1)];
}

function pageZoomStyle(value) {
  if (value === "fit-width") {
    return {
      width: "100%",
      maxHeight: "var(--reader-page-max-height)"
    };
  }

  if (value === "fit-height" || value === "fit-page") {
    return {
      width: "auto",
      maxWidth: "100%",
      maxHeight: "var(--reader-page-max-height)"
    };
  }

  return { width: `${value}%` };
}

function webtoonZoomStyle(value) {
  if (value === "fit-width") {
    return undefined;
  }

  if (value === "fit-height" || value === "fit-page") {
    return { width: "min(70%, 760px)" };
  }

  return { width: `min(${value}%, 1180px)` };
}

function shouldLoadWebtoonPage(index, currentPageIndex) {
  return index <= 2 || Math.abs(index - currentPageIndex) <= 4;
}

export function ReaderPage({ chapterId, onNavigate, startFromBeginning = false }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null
  });
  const [mode, setMode] = useState(loadPreferredMode);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [jumpValue, setJumpValue] = useState("1");
  const [isImmersive, setIsImmersive] = useState(loadPreferredImmersive);
  const [isImmersiveMenuOpen, setIsImmersiveMenuOpen] = useState(loadPreferredImmersiveMenu);
  const [readerZoom, setReaderZoom] = useState(loadPreferredZoom);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [failedPageIds, setFailedPageIds] = useState(() => new Set());
  const [loadedPageIds, setLoadedPageIds] = useState(() => new Set());
  const imageRefs = useRef([]);
  const readerRef = useRef(null);
  const readyRef = useRef(false);
  const pointerStartRef = useRef(null);

  useEffect(() => {
    let alive = true;
    readyRef.current = false;
    setFailedPageIds(new Set());
    setLoadedPageIds(new Set());

    getChapter(chapterId)
      .then((data) => {
        if (!alive) {
          return;
        }

        const pageCount = data.pages.length;
        const savedIndex = startFromBeginning ? 0 : data.progress?.currentPageIndex ?? 0;
        const safeIndex = Math.min(Math.max(savedIndex, 0), Math.max(pageCount - 1, 0));
        setState({ loading: false, error: "", data });
        setMode(data.progress?.mode || loadPreferredMode());
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
  }, [chapterId, startFromBeginning]);

  useEffect(() => {
    setJumpValue(String(currentPageIndex + 1));
  }, [currentPageIndex]);

  useEffect(() => {
    writePreference(READER_MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    writePreference(READER_IMMERSIVE_KEY, isImmersive ? "1" : "0");
  }, [isImmersive]);

  useEffect(() => {
    writePreference(
      READER_IMMERSIVE_MENU_KEY,
      isImmersiveMenuOpen ? "1" : "0"
    );
  }, [isImmersiveMenuOpen]);

  useEffect(() => {
    writePreference(READER_ZOOM_KEY, readerZoom);
  }, [readerZoom]);

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
    return <p className="status-card">Cargando capítulo...</p>;
  }

  if (state.error) {
    return <p className="status-card error">{state.error}</p>;
  }

  const { manga, chapter, pages } = state.data;
  const currentPage = pages[currentPageIndex];
  const pageCount = pages.length;
  const progressPercent = pageCount > 0
    ? Math.round(((currentPageIndex + 1) / pageCount) * 100)
    : 0;
  const remainingPages = Math.max(0, pageCount - currentPageIndex - 1);
  const currentPageFailed = currentPage ? failedPageIds.has(currentPage.id) : false;
  const pageImageStyle = pageZoomStyle(readerZoom);
  const webtoonStyle = webtoonZoomStyle(readerZoom);
  const canFullscreen = Boolean(document.fullscreenEnabled);

  function previousPage() {
    if (pageCount === 0) {
      return;
    }

    setCurrentPageIndex((value) => Math.max(0, value - 1));
  }

  function nextPage() {
    if (pageCount === 0) {
      return;
    }

    setCurrentPageIndex((value) => Math.min(pageCount - 1, value + 1));
  }

  function markPageFailed(pageId) {
    setFailedPageIds((current) => {
      const next = new Set(current);
      next.add(pageId);
      return next;
    });
  }

  function markPageLoaded(pageId) {
    setLoadedPageIds((current) => {
      if (current.has(pageId)) {
        return current;
      }

      const next = new Set(current);
      next.add(pageId);
      return next;
    });
  }

  function retryPage(pageId) {
    setFailedPageIds((current) => {
      const next = new Set(current);
      next.delete(pageId);
      return next;
    });
  }

  function handlePointerDown(event) {
    if (mode !== "page") {
      return;
    }

    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY
    };
  }

  function handlePointerUp(event) {
    if (mode !== "page" || !pointerStartRef.current) {
      pointerStartRef.current = null;
      return;
    }

    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = event.clientY - pointerStartRef.current.y;
    pointerStartRef.current = null;

    if (Math.abs(deltaX) < 52 || Math.abs(deltaY) > 90) {
      return;
    }

    if (deltaX < 0) {
      nextPage();
      return;
    }

    previousPage();
  }

  function goToPage(pageNumber) {
    if (pageCount === 0) {
      setJumpValue("1");
      return;
    }

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

  function changeZoom(direction) {
    setReaderZoom((value) => nextZoom(value, direction));
  }

  async function toggleFullscreen() {
    if (!canFullscreen) {
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
            Página
          </button>
          <button
            className={mode === "webtoon" ? "active" : ""}
            onClick={() => setReaderMode("webtoon")}
          >
            Webtoon
          </button>
        </div>
        <div className="zoom-control" aria-label="Zoom de lectura">
          <button
            disabled={readerZoom === ZOOM_OPTIONS[0]}
            onClick={() => changeZoom(-1)}
            type="button"
          >
            -
          </button>
          <span>{zoomLabel(readerZoom)}</span>
          <button
            disabled={readerZoom === ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1]}
            onClick={() => changeZoom(1)}
            type="button"
          >
            +
          </button>
        </div>
        <div className="reader-actions">
          <button onClick={() => setIsImmersive((value) => !value)}>
            {isImmersive ? "Mostrar UI" : "Modo inmersivo"}
          </button>
          <button onClick={toggleFullscreen} disabled={!canFullscreen}>
            {isFullscreen ? "Salir pantalla completa" : "Pantalla completa"}
          </button>
        </div>
      </div>

      <div className="reader-status">
        <div className="progress-track" aria-label={`Progreso ${progressPercent}%`}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <p>
          Página {pageCount === 0 ? 0 : currentPageIndex + 1} de {pageCount} · {progressPercent}% · Quedan{" "}
          {remainingPages} página{remainingPages === 1 ? "" : "s"}
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
        <div className={`reader-immersive-dock ${isImmersiveMenuOpen ? "open" : "collapsed"}`}>
          {isImmersiveMenuOpen ? (
            <div className="reader-immersive-menu">
              <div className="zoom-control immersive-zoom" aria-label="Zoom de lectura">
                <button
                  disabled={readerZoom === ZOOM_OPTIONS[0]}
                  onClick={() => changeZoom(-1)}
                  type="button"
                >
                  -
                </button>
                <span>{zoomLabel(readerZoom)}</span>
                <button
                  disabled={readerZoom === ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1]}
                  onClick={() => changeZoom(1)}
                  type="button"
                >
                  +
                </button>
              </div>
              <button onClick={() => setIsImmersive(false)}>Mostrar UI</button>
              <button onClick={toggleFullscreen} disabled={!canFullscreen}>
                {isFullscreen ? "Salir pantalla completa" : "Pantalla completa"}
              </button>
              <button onClick={() => setIsImmersiveMenuOpen(false)}>Cerrar</button>
            </div>
          ) : null}
          <button
            aria-label={isImmersiveMenuOpen ? "Plegar controles" : "Desplegar controles"}
            className="reader-immersive-tab"
            onClick={() => setIsImmersiveMenuOpen((value) => !value)}
            type="button"
          >
            <span
              className="reader-immersive-progress"
              style={{ height: `${progressPercent}%` }}
            />
            <span className="reader-immersive-chevron" aria-hidden="true">
              {isImmersiveMenuOpen ? "<<" : ">>"}
            </span>
          </button>
        </div>
      ) : null}

      {mode === "page" ? (
        <div className="page-reader">
          <button className="reader-nav-button" onClick={previousPage} disabled={currentPageIndex === 0}>
            Anterior
          </button>
          <div
            className="page-frame"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            {currentPage && !currentPageFailed ? (
              <AuthenticatedImage
                src={imageUrl(currentPage.imageUrl)}
                alt={`Página ${currentPageIndex + 1}`}
                className="reader-page-image"
                decoding="async"
                fetchPriority="high"
                fallback={<p className="missing-page loading-page">Cargando página...</p>}
                loading="eager"
                onError={() => markPageFailed(currentPage.id)}
                style={pageImageStyle}
              />
            ) : currentPageFailed ? (
              <p className="missing-page">
                No se pudo cargar el archivo de esta página desde storage.
                <button onClick={() => retryPage(currentPage.id)} type="button">
                  Reintentar
                </button>
              </p>
            ) : (
              <p className="missing-page">Este capítulo no tiene páginas registradas.</p>
            )}
            <div className="tap-zones" aria-label="Controles táctiles">
              <button
                aria-label="Página anterior"
                className="tap-zone left"
                disabled={currentPageIndex === 0}
                onClick={previousPage}
                type="button"
              />
              <button
                aria-label="Página siguiente"
                className="tap-zone right"
                disabled={currentPageIndex >= pageCount - 1}
                onClick={nextPage}
                type="button"
              />
            </div>
          </div>
          <button className="reader-nav-button" onClick={nextPage} disabled={currentPageIndex >= pageCount - 1}>
            Siguiente
          </button>
        </div>
      ) : (
        <div className="webtoon-reader" style={webtoonStyle}>
          {pages.map((page, index) => (
            <div
              className="webtoon-page"
              data-page-index={index}
              key={page.id}
              ref={(element) => {
                imageRefs.current[index] = element;
              }}
            >
              {failedPageIds.has(page.id) ? (
                <p className="missing-page">
                  No se pudo cargar el archivo de la página {index + 1} desde storage.
                  <button onClick={() => retryPage(page.id)} type="button">
                    Reintentar
                  </button>
                </p>
              ) : !loadedPageIds.has(page.id) && !shouldLoadWebtoonPage(index, currentPageIndex) ? (
                <p className="missing-page deferred-page">Página {index + 1}</p>
              ) : (
                <AuthenticatedImage
                  alt={`Página ${index + 1}`}
                  className="reader-webtoon-image"
                  decoding="async"
                  fallback={<p className="missing-page loading-page">Cargando página {index + 1}...</p>}
                  loading="lazy"
                  onError={() => markPageFailed(page.id)}
                  onLoad={() => markPageLoaded(page.id)}
                  src={imageUrl(page.imageUrl)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
