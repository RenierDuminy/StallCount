import { Component } from "react";

// In-memory log — survives re-renders, cleared on full page reload.
const errorLog = [];

export function getErrorLog() {
  return errorLog;
}

export function clearErrorLog() {
  errorLog.length = 0;
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { caught: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { caught: true, error };
  }

  componentDidCatch(error, info) {
    errorLog.push({
      name: this.props.name ?? "Unknown component",
      message: error?.message ?? String(error),
      stack: info?.componentStack ?? "",
      timestamp: new Date().toISOString(),
    });
  }

  handleReset = () => {
    this.setState({ caught: false, error: null });
  };

  render() {
    if (!this.state.caught) return this.props.children;

    const { fallback } = this.props;
    if (fallback) return fallback;

    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">Something went wrong</p>
        <p className="mt-1 text-rose-600">{this.state.error?.message}</p>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
        >
          Try again
        </button>
      </div>
    );
  }
}
