import { useEffect, useState } from "react";

const IMAGE_TIMEOUT_MS = 20000;

export function AuthenticatedImage({
  alt = "",
  className,
  fallback = null,
  loading,
  onError,
  onLoad,
  src,
  style,
  ...imageProps
}) {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  useEffect(() => {
    if (!src || status !== "loading") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setStatus("error");
      onError?.();
    }, IMAGE_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [src, status]);

  function handleLoad(event) {
    setStatus("loaded");
    onLoad?.(event);
  }

  function handleError(event) {
    setStatus("error");
    onError?.(event);
  }

  if (!src || status === "error") {
    return typeof fallback === "function"
      ? fallback({ retry: () => setStatus("loading"), status })
      : fallback;
  }

  return (
    <>
      {status === "loading" && (
        typeof fallback === "function"
          ? fallback({ retry: () => setStatus("loading"), status })
          : fallback
      )}
      <img
        alt={alt}
        className={className}
        loading={loading}
        onError={handleError}
        onLoad={handleLoad}
        src={src}
        style={status === "loaded" ? style : { ...style, opacity: 0 }}
        {...imageProps}
      />
    </>
  );
}
