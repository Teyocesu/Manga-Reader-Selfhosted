import { Component } from "react";

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error(error);
    }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.route !== this.props.route && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="app-shell">
        <section className="page-section">
          <div className="status-card error">
            <p className="eyebrow">Error de pantalla</p>
            <h2>No se pudo mostrar esta vista</h2>
            <p>Volvé a la biblioteca y probá abrir el manga o capítulo otra vez.</p>
            <button className="primary-button" onClick={this.props.onReset} type="button">
              Volver a biblioteca
            </button>
          </div>
        </section>
      </main>
    );
  }
}
