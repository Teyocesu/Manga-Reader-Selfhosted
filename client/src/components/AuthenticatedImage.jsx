import { useEffect, useState } from "react";

const IMAGE_TIMEOUT_MS = 20000;

export function AuthenticatedImage({
  alt = "",
  autoRetry = 0,
  className,
  fallback = null,
  loading,
  onError,
  onLoad,
  src,
  style,
  timeoutMs = IMAGE_TIMEOUT_MS,
  ...imageProps
}) {
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setStatus(src ? "loading" : "error");
    setAttempt(0);
  }, [src]);

  useEffect(() => {
    if (!src || status !== "loading") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => retryOrFail(), timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [attempt, autoRetry, src, status, timeoutMs]);

  function retryOrFail(event) {
    if (attempt < autoRetry) {
      setAttempt((value) => value + 1);
      setStatus("loading");
      return;
    }

    setStatus("error");
    onError?.(event);
  }

  function handleLoad(event) {
    setStatus("loaded");
    onLoad?.(event);
  }

  function handleError(event) {
    retryOrFail(event);
  }

  if (!src || status === "error") {
    return typeof fallback === "function"
      ? fallback({
          retry: () => {
            setAttempt((value) => value + 1);
            setStatus("loading");
          },
          status
        })
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
        key={`${src}:${attempt}`}
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
