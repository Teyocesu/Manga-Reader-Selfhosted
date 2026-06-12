import { useEffect, useState } from "react";

export function AuthenticatedImage({
  alt = "",
  className,
  loading,
  onError,
  src,
  ...imageProps
}) {
  const [objectUrl, setObjectUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let nextObjectUrl = "";

    setFailed(false);
    setObjectUrl("");

    if (!src) {
      setFailed(true);
      onError?.();
      return undefined;
    }

    fetch(src, { credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Image request failed");
        }
        return response.blob();
      })
      .then((blob) => {
        if (!alive) {
          return;
        }
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          onError?.();
        }
      });

    return () => {
      alive = false;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [src]);

  if (failed || !objectUrl) {
    return null;
  }

  return (
    <img
      alt={alt}
      className={className}
      loading={loading}
      src={objectUrl}
      {...imageProps}
    />
  );
}
