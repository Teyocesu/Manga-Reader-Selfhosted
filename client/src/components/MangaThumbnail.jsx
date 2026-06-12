import { useEffect, useState } from "react";

function initials(title) {
  return String(title || "MR").trim().slice(0, 2).toUpperCase() || "MR";
}

export function MangaThumbnail({
  className,
  loading,
  placeholderClassName,
  title,
  url
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return <span className={placeholderClassName}>{initials(title)}</span>;
  }

  return (
    <img
      alt=""
      aria-label={`Portada de ${title}`}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
      src={url}
    />
  );
}
