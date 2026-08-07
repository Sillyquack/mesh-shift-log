import { Component } from "react";

export default class RoutineEmployeeErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="employee-workspace employee-loading"><section className="employee-panel" role="alert"><p className="eyebrow">Legacy shift log is unaffected</p><h1>Operations Preview stopped safely</h1>
      <p>Your local draft was not submitted or discarded.</p><button type="button" onClick={() => { this.setState({ error: null }); this.props.onBack?.(); }}>Back to Preview Home</button></section></main>;
  }
}
