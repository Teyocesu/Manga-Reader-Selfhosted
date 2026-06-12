import { useEffect, useState } from "react";
import { AppHeader } from "./components/AppHeader.jsx";
import { getAuthStatus } from "./api.js";
import { AccessPage } from "./pages/AccessPage.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { MangaDetailPage } from "./pages/MangaDetailPage.jsx";
import { ReaderPage } from "./pages/ReaderPage.jsx";
import { UploadPage } from "./pages/UploadPage.jsx";

function getRoute() {
  return window.location.hash.replace(/^#/, "") || "/";
}

function navigate(path) {
  window.location.hash = path;
}

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [authState, setAuthState] = useState({
    loading: true,
    requiresPassword: false,
    authenticated: false
  });

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    getAuthStatus()
      .then((status) => setAuthState({ loading: false, ...status }))
      .catch(() => {
        setAuthState({
          loading: false,
          requiresPassword: true,
          authenticated: false
        });
      });
  }, []);

  if (authState.loading) {
    return <p className="status-card">Cargando acceso...</p>;
  }

  if (authState.requiresPassword && !authState.authenticated) {
    return (
      <AccessPage
        onAuthenticated={() => {
          setAuthState({
            loading: false,
            requiresPassword: true,
            authenticated: true
          });
        }}
      />
    );
  }

  const mangaMatch = route.match(/^\/manga\/([^/]+)$/);
  const chapterMatch = route.match(/^\/chapter\/([^/?]+)(?:\?(.*))?$/);
  const uploadMatch = route.match(/^\/upload(?:\?(.*))?$/);

  let page = <LibraryPage onNavigate={navigate} />;
  if (uploadMatch) {
    const params = new URLSearchParams(uploadMatch[1] || "");
    page = <UploadPage initialMangaId={params.get("mangaId") || ""} onNavigate={navigate} />;
  } else if (mangaMatch) {
    page = <MangaDetailPage mangaId={mangaMatch[1]} onNavigate={navigate} />;
  } else if (chapterMatch) {
    const params = new URLSearchParams(chapterMatch[2] || "");
    page = (
      <ReaderPage
        chapterId={chapterMatch[1]}
        onNavigate={navigate}
        startFromBeginning={params.get("start") === "1"}
      />
    );
  }

  return (
    <>
      <AppHeader onNavigate={navigate} />
      <main className="app-shell">{page}</main>
    </>
  );
}
