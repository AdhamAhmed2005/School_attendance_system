import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white shadow rounded p-6 text-center">
            <h2 className="text-xl font-bold mb-2">Unexpected Application Error</h2>
            <p className="text-sm text-gray-600 mb-4">Something went wrong. Please try refreshing the page.</p>
            <details className="text-xs text-left text-red-600 overflow-auto max-h-48">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="whitespace-pre-wrap">{String(this.state.error)}</pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
