const apiBase =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? `${window.location.origin}/api`
    : `${window.location.protocol}//${window.location.hostname}:3001/api`);

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...options
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Revisá que el backend esté corriendo.");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === "object" ? body.error : body;
    if (response.status >= 500) {
      throw new Error("El servidor encontró un problema. Probá de nuevo en unos segundos.");
    }

    const error = new Error(message || "No se pudo completar la acción.");
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export function imageUrl(path) {
  return `${apiBase}${path.replace(/^\/api/, "")}`;
}

export function getLibrary() {
  return request("/library");
}

export function getAuthStatus() {
  return request("/auth/status");
}

export function login(password) {
  return request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });
}

export function getAppConfig() {
  return request("/config");
}

export function getManga(mangaId) {
  return request(`/mangas/${mangaId}`);
}

export function getChapter(chapterId) {
  return request(`/chapters/${chapterId}`);
}

export function deleteManga(mangaId) {
  return request(`/mangas/${mangaId}`, {
    method: "DELETE"
  });
}

export function deleteChapter(chapterId) {
  return request(`/chapters/${chapterId}`, {
    method: "DELETE"
  });
}

export function updateManga(mangaId, payload) {
  return request(`/mangas/${mangaId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function reorderChapters(mangaId, chapterIds) {
  return request(`/mangas/${mangaId}/chapters/reorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ chapterIds })
  });
}

export function renameChapters(mangaId, chapters) {
  return request(`/mangas/${mangaId}/chapters/rename`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ chapters })
  });
}

export function updateChapter(chapterId, payload) {
  return request(`/chapters/${chapterId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function getProgress(chapterId) {
  return request(`/progress/${chapterId}`);
}

export function saveProgress(chapterId, payload) {
  return request(`/progress/${chapterId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function uploadChapter({
  mangaId,
  mangaTitle,
  chapterTitle,
  archive,
  confirmPotentialDuplicate = false
}) {
  const formData = new FormData();
  if (mangaId) {
    formData.append("mangaId", mangaId);
  } else {
    formData.append("mangaTitle", mangaTitle);
  }
  formData.append("chapterTitle", chapterTitle);
  if (confirmPotentialDuplicate) {
    formData.append("confirmPotentialDuplicate", "1");
  }
  formData.append("archive", archive);

  return request("/upload", {
    method: "POST",
    body: formData
  });
}
