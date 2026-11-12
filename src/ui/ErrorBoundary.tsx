import React from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Changing this clears a caught error, e.g. when the route changes. */
  resetKey?: string;
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps a render failure or a failed lazy chunk from leaving a blank window.
 * Local data is untouched, so reloading is always safe.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Render error', error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="view" role="alert">
        <EmptyState
          title={this.props.title ?? 'Something went wrong'}
          description="This screen could not be shown. Reloading usually fixes it — your data is saved on this device."
          action={
            <Button variant="primary" onClick={this.reload}>
              Reload
            </Button>
          }
        />
      </div>
    );
  }
}
