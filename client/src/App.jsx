import { useEffect, useState } from "react";
import { AppHeader } from "./components/AppHeader.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { MangaDetailPage } from "./pages/MangaDetailPage.jsx";
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

  let page = <LibraryPage onNavigate={navigate} />;
  if (route === "/upload") {
    page = <UploadPage onNavigate={navigate} />;
  } else if (mangaMatch) {
    page = <MangaDetailPage mangaId={mangaMatch[1]} onNavigate={navigate} />;
  } else if (chapterMatch) {
    page = (
      <section className="page-section">
        <button className="text-button" onClick={() => navigate("/")}>
          Volver
        </button>
        <p className="eyebrow">Reader</p>
        <h1>Lector listo para el siguiente hito</h1>
      </section>
    );
  }

  return (
    <>
      <AppHeader onNavigate={navigate} />
      <main className="app-shell">{page}</main>
    </>
  );
}
