import { Component } from "react";

export default class RoutineEngineErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) { return { error }; }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) return null;
    return (
      <main className="routine-shell routine-shell-centered">
        <section className="routine-state-card" role="alert">
          <p className="eyebrow">Routine Engine v2</p>
          <h1>Preview could not be opened</h1>
          <p>The legacy shift log is still available and has not been changed.</p>
          <button type="button" className="primary-button" onClick={this.props.onBack}>Back to shift log</button>
        </section>
      </main>
    );
  }
}
