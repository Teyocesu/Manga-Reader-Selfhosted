export function AppHeader({ onNavigate }) {
  return (
    <header className="app-header">
      <button className="brand-button" onClick={() => onNavigate("/")}>
        <span className="brand-mark">MR</span>
        <span>Manga Reader</span>
      </button>
      <nav aria-label="Principal">
        <button onClick={() => onNavigate("/")}>Biblioteca</button>
        <button onClick={() => onNavigate("/upload")}>Subir</button>
      </nav>
    </header>
  );
}
