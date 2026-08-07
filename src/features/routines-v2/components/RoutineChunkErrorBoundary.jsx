import { Component } from "react";

export default class RoutineChunkErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const chunkFailure = /chunk|dynamic(?:ally)? import(?:ed)?|module script/i.test(String(this.state.error?.message || this.state.error));
    return <main className="routine-shell-centered"><section className="routine-state-card" role="alert"><h1>{chunkFailure ? "A newer Routine Engine version is available" : "This Routine Engine view could not load"}</h1><p>{chunkFailure ? "Reload once to fetch the current application chunks. No operation was sent." : "Return to the preview shell and try again."}</p><button type="button" className="primary-button routine-chunk-retry" onClick={() => globalThis.location?.reload()}>{chunkFailure ? "Reload current version" : "Try again"}</button>{this.props.onBack && <button type="button" className="ghost-button routine-chunk-retry" onClick={this.props.onBack}>Back</button>}</section></main>;
  }
}
