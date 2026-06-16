import { useEffect, useRef, useState } from "react";
import { getChapter, imageUrl, saveProgress } from "../api.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.jsx";
import {
  readJsonPreference,
  readPreference,
  writeJsonPreference,
  writePreference
} from "../utils/preferences.js";

const READER_MODE_KEY = "manga-reader.reader-mode";
const READER_IMMERSIVE_KEY = "manga-reader.reader-immersive";
const READER_IMMERSIVE_MENU_KEY = "manga-reader.reader-immersive-menu-open";
const READER_DIRECTION_KEY = "manga-reader.reader-direction";
const READER_ZOOM_KEY = "manga-reader.reader-zoom";
const READER_SPREAD_KEY = "manga-reader.reader-spread";
const MANGA_SETTINGS_KEY_PREFIX = "manga-reader.manga-settings";
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
const WEBTOON_MAX_ACTIVE_LOADS = 3;
const WEBTOON_IMAGE_TIMEOUT_MS = 9000;
const DESKTOP_DOUBLE_PAGE_QUERY = "(min-width: 900px)";

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

function loadPreferredDirection() {
  return readPreference(READER_DIRECTION_KEY) === "rtl" ? "rtl" : "ltr";
}

function loadPreferredSpread() {
  return readPreference(READER_SPREAD_KEY) === "double" ? "double" : "single";
}

function mangaSettingsKey(mangaId) {
  return `${MANGA_SETTINGS_KEY_PREFIX}.${mangaId}`;
}

function loadMangaSettings(mangaId) {
  if (!mangaId) {
    return {};
  }

  const value = readJsonPreference(mangaSettingsKey(mangaId), {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function writeMangaSetting(mangaId, key, value) {
  if (!mangaId) {
    return;
  }

  writeJsonPreference(mangaSettingsKey(mangaId), {
    ...loadMangaSettings(mangaId),
    [key]: value
  });
}

function preferredModeForManga(mangaId, fallbackMode = loadPreferredMode()) {
  const settings = loadMangaSettings(mangaId);
  return settings.mode === "webtoon"
    ? "webtoon"
    : settings.mode === "page"
      ? "page"
      : fallbackMode;
}

function preferredZoomForManga(mangaId) {
  const zoom = loadMangaSettings(mangaId).zoom;
  return ZOOM_OPTIONS.includes(zoom) ? zoom : loadPreferredZoom();
}

function preferredDirectionForManga(mangaId) {
  return loadMangaSettings(mangaId).direction === "rtl" ? "rtl" : loadPreferredDirection();
}

function preferredSpreadForManga(mangaId) {
  return loadMangaSettings(mangaId).spread === "double" ? "double" : loadPreferredSpread();
}

function zoomLabel(value) {
  return ZOOM_LABELS[value] || `${value}%`;
}

function nextZoom(value, direction) {
  const index = ZOOM_OPTIONS.indexOf(value);
  const safeIndex = index === -1 ? ZOOM_OPTIONS.indexOf("100") : index;
  return ZOOM_OPTIONS[Math.min(Math.max(safeIndex + direction, 0), ZOOM_OPTIONS.length - 1)];
}

function pageImageZoomStyle(value) {
  if (value === "fit-width") {
    return {
      width: "100%",
      height: "auto",
      maxHeight: "none"
    };
  }

  if (value === "fit-height" || value === "fit-page") {
    return {
      width: "auto",
      height: "auto",
      maxWidth: "100%",
      maxHeight: "calc(var(--reader-frame-height) - 20px)"
    };
  }

  return {
    width: "100%",
    height: "auto",
    maxHeight: "none"
  };
}

function pageSpreadZoomStyle(value) {
  if (value === "fit-width") {
    return {
      width: "100%",
      height: "auto"
    };
  }

  if (value === "fit-height" || value === "fit-page") {
    return {
      height: "auto",
      width: "fit-content",
      maxWidth: "100%"
    };
  }

  return {
    width: `${value}%`,
    height: "auto"
  };
}

function isFitZoom(value) {
  return value.startsWith("fit-");
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
  return index <= 3 || (index >= currentPageIndex - 3 && index <= currentPageIndex + 8);
}

function isPriorityWebtoonPage(index, currentPageIndex) {
  return index >= currentPageIndex - 1 && index <= currentPageIndex + 3;
}

function webtoonLoadRank(index, currentPageIndex) {
  if (index === currentPageIndex) {
    return 0;
  }

  const distance = Math.abs(index - currentPageIndex);
  const directionBias = index > currentPageIndex ? 0.2 : 0.45;
  return distance + directionBias;
}

function visiblePageIndexes(currentPageIndex, pageCount, isDoublePageVisible, readingDirection) {
  if (pageCount === 0) {
    return [];
  }

  const indexes = [currentPageIndex];
  if (isDoublePageVisible && currentPageIndex + 1 < pageCount) {
    indexes.push(currentPageIndex + 1);
  }

  return readingDirection === "rtl" ? indexes.reverse() : indexes;
}

function preloadPageIndexes(currentPageIndex, pageCount, isDoublePageVisible, isDesktopReader) {
  if (pageCount === 0) {
    return [];
  }

  const step = isDoublePageVisible ? 2 : 1;
  const offsets = isDesktopReader
    ? [-step * 2, -step, 0, step, step * 2]
    : [-step, 0, step];
  const indexes = new Set();

  for (const offset of offsets) {
    const baseIndex = currentPageIndex + offset;
    if (baseIndex >= 0 && baseIndex < pageCount) {
      indexes.add(baseIndex);
    }

    if (isDoublePageVisible && baseIndex + 1 >= 0 && baseIndex + 1 < pageCount) {
      indexes.add(baseIndex + 1);
    }
  }

  return [...indexes].sort((a, b) => Math.abs(a - currentPageIndex) - Math.abs(b - currentPageIndex));
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
  const [readingDirection, setReadingDirection] = useState(loadPreferredDirection);
  const [spreadMode, setSpreadMode] = useState(loadPreferredSpread);
  const [isDesktopReader, setIsDesktopReader] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }

    return window.matchMedia(DESKTOP_DOUBLE_PAGE_QUERY).matches;
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [failedPageIds, setFailedPageIds] = useState(() => new Set());
  const [loadedPageIds, setLoadedPageIds] = useState(() => new Set());
  const [activeWebtoonPageIds, setActiveWebtoonPageIds] = useState(() => new Set());
  const imageRefs = useRef([]);
  const readerRef = useRef(null);
  const readyRef = useRef(false);
  const pointerStartRef = useRef(null);
  const skipInitialSaveRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("reader-active");

    return () => {
      document.body.classList.remove("reader-active");
    };
  }, []);

  useEffect(() => {
    if (!window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(DESKTOP_DOUBLE_PAGE_QUERY);
    const handleChange = () => setIsDesktopReader(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    let alive = true;
    readyRef.current = false;
    setFailedPageIds(new Set());
    setLoadedPageIds(new Set());
    setActiveWebtoonPageIds(new Set());
    skipInitialSaveRef.current = startFromBeginning;

    getChapter(chapterId)
      .then((data) => {
        if (!alive) {
          return;
        }

        const pageCount = data.pages.length;
        const savedIndex = startFromBeginning ? 0 : data.progress?.currentPageIndex ?? 0;
        const safeIndex = Math.min(Math.max(savedIndex, 0), Math.max(pageCount - 1, 0));
        const mangaId = data.manga?.id;
        const fallbackMode = data.progress?.mode === "webtoon" ? "webtoon" : loadPreferredMode();
        setState({ loading: false, error: "", data });
        setMode(startFromBeginning ? preferredModeForManga(mangaId) : preferredModeForManga(mangaId, fallbackMode));
        setReaderZoom(preferredZoomForManga(mangaId));
        setReadingDirection(preferredDirectionForManga(mangaId));
        setSpreadMode(preferredSpreadForManga(mangaId));
        setCurrentPageIndex(safeIndex);
        setJumpValue(String(safeIndex + 1));
        setSaveState("");
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
    if (!startFromBeginning || !state.data) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (mode === "webtoon") {
        imageRefs.current[0]?.scrollIntoView({
          block: "start",
          behavior: "auto"
        });
        return;
      }

      window.scrollTo({ top: 0, behavior: "auto" });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [mode, startFromBeginning, state.data]);

  useEffect(() => {
    writePreference(READER_MODE_KEY, mode);
    writeMangaSetting(state.data?.manga?.id, "mode", mode);
  }, [mode, state.data?.manga?.id]);

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
    writeMangaSetting(state.data?.manga?.id, "zoom", readerZoom);
  }, [readerZoom, state.data?.manga?.id]);

  useEffect(() => {
    writePreference(READER_DIRECTION_KEY, readingDirection);
    writeMangaSetting(state.data?.manga?.id, "direction", readingDirection);
  }, [readingDirection, state.data?.manga?.id]);

  useEffect(() => {
    writePreference(READER_SPREAD_KEY, spreadMode);
    writeMangaSetting(state.data?.manga?.id, "spread", spreadMode);
  }, [spreadMode, state.data?.manga?.id]);

  useEffect(() => {
    if (!readyRef.current || !state.data) {
      return;
    }

    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
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
    if (mode !== "webtoon" || !state.data) {
      setActiveWebtoonPageIds((current) => current.size > 0 ? new Set() : current);
      return;
    }

    const nextIds = state.data.pages
      .map((page, index) => ({ id: page.id, index }))
      .filter(({ id, index }) =>
        !loadedPageIds.has(id) &&
        !failedPageIds.has(id) &&
        shouldLoadWebtoonPage(index, currentPageIndex)
      )
      .sort((a, b) =>
        webtoonLoadRank(a.index, currentPageIndex) - webtoonLoadRank(b.index, currentPageIndex)
      )
      .slice(0, WEBTOON_MAX_ACTIVE_LOADS)
      .map(({ id }) => id);

    setActiveWebtoonPageIds((current) => {
      if (
        current.size === nextIds.length &&
        nextIds.every((id) => current.has(id))
      ) {
        return current;
      }

      return new Set(nextIds);
    });
  }, [currentPageIndex, failedPageIds, loadedPageIds, mode, state.data]);

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

      if (event.key === "Home") {
        event.preventDefault();
        goToBoundary("start");
      }

      if (event.key === "End") {
        event.preventDefault();
        goToBoundary("end");
      }

      if (mode === "page" && event.key === "ArrowLeft") {
        event.preventDefault();
        goByReadingSide("left");
      }

      if (mode === "page" && event.key === "ArrowRight") {
        event.preventDefault();
        goByReadingSide("right");
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
  const hasNextPage = currentPageIndex + 1 < pageCount;
  const isDoublePageVisible = mode === "page" && spreadMode === "double" && isDesktopReader && hasNextPage;
  const pageImageStyle = pageImageZoomStyle(readerZoom);
  const pageSpreadStyle = pageSpreadZoomStyle(readerZoom);
  const webtoonStyle = webtoonZoomStyle(readerZoom);
  const canFullscreen = Boolean(document.fullscreenEnabled);
  const chapters = state.data.manga?.chapters || [];
  const currentChapterIndex = chapters.findIndex((mangaChapter) => mangaChapter.id === chapter.id);
  const nextChapter = currentChapterIndex >= 0 ? chapters[currentChapterIndex + 1] : null;
  const isLastPage = pageCount > 0 && currentPageIndex >= pageCount - 1;
  const pageStep = isDoublePageVisible ? 2 : 1;
  const visibleIndexes = visiblePageIndexes(currentPageIndex, pageCount, isDoublePageVisible, readingDirection);
  const preloadedIndexes = mode === "page"
    ? preloadPageIndexes(currentPageIndex, pageCount, isDoublePageVisible, isDesktopReader)
    : [];

  function previousPage() {
    if (pageCount === 0) {
      return;
    }

    setCurrentPageIndex((value) => Math.max(0, value - pageStep));
  }

  function nextPage() {
    if (pageCount === 0) {
      return;
    }

    setCurrentPageIndex((value) => Math.min(pageCount - 1, value + pageStep));
  }

  function goByReadingSide(side) {
    const shouldAdvance =
      readingDirection === "rtl" ? side === "left" : side === "right";

    if (shouldAdvance) {
      nextPage();
      return;
    }

    previousPage();
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

    goByReadingSide(deltaX < 0 ? "left" : "right");
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

  function goToBoundary(boundary) {
    if (pageCount === 0) {
      return;
    }

    const nextIndex = boundary === "end" ? pageCount - 1 : 0;
    setCurrentPageIndex(nextIndex);
    setJumpValue(String(nextIndex + 1));

    if (mode === "webtoon") {
      const scrollTargetIntoView = () => {
        const target = imageRefs.current[nextIndex];
        if (!target) {
          return;
        }

        const rect = target.getBoundingClientRect();
        const targetTop = rect.top + window.scrollY;
        const targetBottom = targetTop + rect.height;
        window.scrollTo({
          top: boundary === "end" ? Math.max(0, targetBottom - window.innerHeight) : targetTop,
          behavior: "auto"
        });
      };

      window.setTimeout(scrollTargetIntoView, 0);
      window.setTimeout(scrollTargetIntoView, 180);
      window.setTimeout(scrollTargetIntoView, 620);
    }
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

  function rereadChapter() {
    goToPage(1);
    if (mode === "webtoon") {
      window.setTimeout(() => {
        imageRefs.current[0]?.scrollIntoView({
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
        <div className="reader-title-block">
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
        <div className="direction-toggle" aria-label="Dirección de lectura">
          <button
            className={readingDirection === "ltr" ? "active" : ""}
            onClick={() => setReadingDirection("ltr")}
            type="button"
          >
            L→R
          </button>
          <button
            className={readingDirection === "rtl" ? "active" : ""}
            onClick={() => setReadingDirection("rtl")}
            type="button"
          >
            R→L
          </button>
        </div>
        <div className="spread-toggle" aria-label="Vista de páginas">
          <button
            className={spreadMode === "single" || !isDesktopReader ? "active" : ""}
            onClick={() => setSpreadMode("single")}
            type="button"
          >
            1 pág.
          </button>
          <button
            className={spreadMode === "double" && isDesktopReader ? "active" : ""}
            disabled={!isDesktopReader}
            onClick={() => setSpreadMode("double")}
            type="button"
          >
            2 págs.
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
        <button onClick={() => goToBoundary("start")} type="button">
          Inicio
        </button>
        <button onClick={() => goToBoundary("end")} type="button">
          Final
        </button>
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
              <button onClick={() => goToBoundary("start")} type="button">
                Inicio
              </button>
              <button onClick={() => goToBoundary("end")} type="button">
                Final
              </button>
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
        <>
          <div className="page-reader">
            <button className="reader-nav-button" onClick={previousPage} disabled={currentPageIndex === 0}>
              Anterior
            </button>
            <div
              className={`page-frame ${isDoublePageVisible ? "double-page-frame" : "single-page-frame"}`}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              {visibleIndexes.length > 0 ? (
                <div
                  className={`reader-page-spread ${isFitZoom(readerZoom) ? "fit-zoom" : "percent-zoom"}`}
                  aria-label={isDoublePageVisible ? "Doble página" : "Una página"}
                  style={pageSpreadStyle}
                >
                  {visibleIndexes.map((pageIndex) => {
                    const page = pages[pageIndex];
                    const pageFailed = failedPageIds.has(page.id);

                    return (
                      <div className="reader-page-slot" key={page.id}>
                        {!pageFailed ? (
                          <AuthenticatedImage
                            src={imageUrl(page.imageUrl)}
                            alt={`Página ${pageIndex + 1}`}
                            autoRetry={1}
                            className="reader-page-image"
                            decoding="async"
                            fetchPriority={pageIndex === currentPageIndex ? "high" : "auto"}
                            fallback={<p className="missing-page loading-page">Cargando página...</p>}
                            loading="eager"
                            onError={() => markPageFailed(page.id)}
                            style={pageImageStyle}
                          />
                        ) : (
                          <p className="missing-page">
                            No se pudo cargar el archivo de esta página desde storage.
                            <button onClick={() => retryPage(page.id)} type="button">
                              Reintentar
                            </button>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="missing-page">Este capítulo no tiene páginas registradas.</p>
              )}
              <PagePreloader
                currentPageIndex={currentPageIndex}
                indexes={preloadedIndexes}
                pages={pages}
                visibleIndexes={visibleIndexes}
              />
              <div className="tap-zones" aria-label="Controles táctiles">
                <button
                  aria-label={readingDirection === "rtl" ? "Página siguiente" : "Página anterior"}
                  className="tap-zone left"
                  disabled={readingDirection === "rtl" ? currentPageIndex >= pageCount - 1 : currentPageIndex === 0}
                  onClick={() => goByReadingSide("left")}
                  type="button"
                />
                <button
                  aria-label={readingDirection === "rtl" ? "Página anterior" : "Página siguiente"}
                  className="tap-zone right"
                  disabled={readingDirection === "rtl" ? currentPageIndex === 0 : currentPageIndex >= pageCount - 1}
                  onClick={() => goByReadingSide("right")}
                  type="button"
                />
              </div>
            </div>
            <button className="reader-nav-button" onClick={nextPage} disabled={currentPageIndex >= pageCount - 1}>
              Siguiente
            </button>
          </div>
          {isLastPage ? (
            <ChapterEndActions
              mangaId={manga.id}
              nextChapter={nextChapter}
              onNavigate={onNavigate}
              onReread={rereadChapter}
            />
          ) : null}
        </>
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
              ) : !loadedPageIds.has(page.id) && !activeWebtoonPageIds.has(page.id) ? (
                <p className="missing-page deferred-page">Página {index + 1}</p>
              ) : (
                <AuthenticatedImage
                  alt={`Página ${index + 1}`}
                  autoRetry={2}
                  className="reader-webtoon-image"
                  decoding="async"
                  fetchPriority={isPriorityWebtoonPage(index, currentPageIndex) ? "high" : "auto"}
                  fallback={<p className="missing-page loading-page">Cargando página {index + 1}...</p>}
                  loading="eager"
                  onError={() => markPageFailed(page.id)}
                  onLoad={() => markPageLoaded(page.id)}
                  src={imageUrl(page.imageUrl)}
                  timeoutMs={WEBTOON_IMAGE_TIMEOUT_MS}
                />
              )}
            </div>
          ))}
          <ChapterEndActions
            mangaId={manga.id}
            nextChapter={nextChapter}
            onNavigate={onNavigate}
            onReread={rereadChapter}
          />
        </div>
      )}
    </section>
  );
}

function ChapterEndActions({ mangaId, nextChapter, onNavigate, onReread }) {
  return (
    <section className="chapter-end-panel">
      <p className="eyebrow">Fin del capítulo</p>
      <h2>{nextChapter ? "Seguir leyendo" : "Fin del manga"}</h2>
      <p>
        {nextChapter
          ? `Siguiente: ${nextChapter.title}`
          : "No hay siguiente capítulo en este manga."}
      </p>
      <div className="chapter-end-actions">
        {nextChapter ? (
          <button
            className="accent-button"
            onClick={() => onNavigate(`/chapter/${nextChapter.id}?start=1`)}
            type="button"
          >
            Siguiente capítulo
          </button>
        ) : null}
        <button onClick={() => onNavigate(`/manga/${mangaId}`)} type="button">
          Volver al manga
        </button>
        <button onClick={onReread} type="button">
          Releer desde inicio
        </button>
      </div>
    </section>
  );
}

function PagePreloader({ currentPageIndex, indexes, pages, visibleIndexes }) {
  const visible = new Set(visibleIndexes);
  const preloadIndexes = indexes.filter((index) => index !== currentPageIndex && !visible.has(index));

  if (preloadIndexes.length === 0) {
    return null;
  }

  return (
    <div className="reader-preload" aria-hidden="true">
      {preloadIndexes.map((index) => {
        const page = pages[index];
        if (!page) {
          return null;
        }

        return (
          <img
            alt=""
            crossOrigin="use-credentials"
            decoding="async"
            fetchPriority="low"
            key={page.id}
            loading="eager"
            src={imageUrl(page.imageUrl)}
          />
        );
      })}
    </div>
  );
}
