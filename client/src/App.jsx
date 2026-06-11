import { useEffect, useState } from "react";
import { AppHeader } from "./components/AppHeader.jsx";
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

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const mangaMatch = route.match(/^\/manga\/([^/]+)$/);
  const chapterMatch = route.match(/^\/chapter\/([^/]+)$/);
  const uploadMatch = route.match(/^\/upload(?:\?(.*))?$/);

  let page = <LibraryPage onNavigate={navigate} />;
  if (uploadMatch) {
    const params = new URLSearchParams(uploadMatch[1] || "");
    page = <UploadPage initialMangaId={params.get("mangaId") || ""} onNavigate={navigate} />;
  } else if (mangaMatch) {
    page = <MangaDetailPage mangaId={mangaMatch[1]} onNavigate={navigate} />;
  } else if (chapterMatch) {
    page = <ReaderPage chapterId={chapterMatch[1]} onNavigate={navigate} />;
  }

  return (
    <>
      <AppHeader onNavigate={navigate} />
      <main className="app-shell">{page}</main>
    </>
  );
}
