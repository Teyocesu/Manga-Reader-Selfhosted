export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${size.toFixed(0)} ${units[unitIndex]}`;
  }

  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unitIndex]}`;
}

function warningLabel(level) {
  if (level === "critical") {
    return "Crítico";
  }

  if (level === "near") {
    return "Cerca del límite";
  }

  return "OK";
}

export function StorageOverview({ storage }) {
  if (!storage) {
    return null;
  }

  const percent = Math.round(storage.percentUsed || 0);
  const level = storage.warning?.level || "ok";

  return (
    <section className={`storage-overview ${level}`} aria-label="Estado de almacenamiento">
      <div className="storage-overview-heading">
        <div>
          <p className="eyebrow">Almacenamiento</p>
          <h2>{formatBytes(storage.usedBytes)} usados</h2>
        </div>
        <span className={`storage-badge ${level}`}>{warningLabel(level)}</span>
      </div>
      <div className="storage-meter" aria-label={`${percent}% usado`}>
        <span style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <div className="storage-stats">
        <span>{percent}% de {formatBytes(storage.quotaBytes)}</span>
        <span>{formatBytes(storage.freeQuotaBytes)} libres de cuota</span>
        {storage.diskFreeBytes == null ? null : (
          <span>{formatBytes(storage.diskFreeBytes)} libres en disco</span>
        )}
      </div>
      {storage.warning?.level && storage.warning.level !== "ok" ? (
        <p className="storage-warning">{storage.warning.message}</p>
      ) : null}
      {storage.heavyMangas?.length > 0 ? (
        <div className="storage-heavy-list">
          <strong>Mangas más pesados</strong>
          {storage.heavyMangas.slice(0, 3).map((manga) => (
            <span key={manga.id}>
              {manga.title}: {formatBytes(manga.bytes)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
