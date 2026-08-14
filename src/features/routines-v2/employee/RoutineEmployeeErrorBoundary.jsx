import { Component } from "react";

export default class RoutineEmployeeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="employee-workspace employee-loading">
        <section className="employee-panel" role="alert">
          <p className="eyebrow">Your current work is safe</p>
          <h1>Shift Mode stopped safely</h1>
          <p>Your local draft was not submitted or discarded.</p>
          <p>After returning, ask a shift lead or manager to create this run if the routine you need is still missing.</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onBack?.();
            }}
          >
            Back to app home
          </button>
        </section>
      </main>
    );
  }
}
