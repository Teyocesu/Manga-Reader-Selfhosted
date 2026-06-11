import { useState } from "react";
import { login } from "../api.js";

export function AccessPage({ onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ loading: false, error: "" });

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ loading: true, error: "" });

    try {
      await login(password);
      onAuthenticated();
    } catch (error) {
      setStatus({ loading: false, error: error.message });
    }
  }

  return (
    <main className="app-shell access-shell">
      <section className="access-panel">
        <p className="eyebrow">Lector privado</p>
        <h1>Acceso</h1>
        <p className="hero-copy">
          Ingresá la contraseña de la app para abrir tu biblioteca.
        </p>
        <form className="upload-form" onSubmit={handleSubmit}>
          <label>
            Contraseña
            <input
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          {status.error ? <p className="error">{status.error}</p> : null}
          <button className="primary-button" disabled={status.loading}>
            {status.loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
