"use client";

import { Component } from "react";
import Link from "next/link";

/**
 * Without this, a single unparseable value thrown during render unmounts the
 * whole tree and the user gets a blank white page with no explanation.
 */
class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render failed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-white">
        <h1 className="text-xl font-semibold text-gray-900">
          Something in your data broke this page
        </h1>
        <p className="text-gray-600 max-w-md">
          This is a bug, not something you did wrong. The most common cause is a
          date or number in an unexpected format.
        </p>
        <pre className="text-xs text-left bg-gray-50 border border-gray-200 p-3 rounded max-w-md overflow-x-auto">
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <Link
          href="/"
          className="btn bg-[#00b5ef] text-white border-none hover:bg-[#0095c7]"
        >
          Start over
        </Link>
      </div>
    );
  }
}

export default ErrorBoundary;
