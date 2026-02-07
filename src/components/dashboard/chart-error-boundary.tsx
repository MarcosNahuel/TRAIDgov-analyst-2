"use client";

import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ChartErrorBoundaryProps {
  children: React.ReactNode;
  chartTitle: string;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
}

export class ChartErrorBoundary extends React.Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ChartErrorBoundaryState {
    return { hasError: true };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-zinc-900 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400/70" />
            <p className="text-sm text-zinc-400">
              Error al renderizar:{" "}
              <span className="font-medium text-zinc-300">
                {this.props.chartTitle}
              </span>
            </p>
            <button
              onClick={this.handleRetry}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
