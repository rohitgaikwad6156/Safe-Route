import React from 'react';

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SafeRoute UI recovered from a rendering error.', error, info);
  }

  private reload = () => window.location.reload();

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 p-6 text-slate-900">
        <section className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-xl" role="alert">
          <h1 className="text-xl font-extrabold">SafeRoute needs to reload</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Navigation hit a browser rendering problem. Your route request was not changed.
          </p>
          {import.meta.env.DEV ? (
            <p className="mt-3 rounded-lg bg-slate-100 p-3 font-mono text-xs text-slate-700">
              {this.state.error.message}
            </p>
          ) : null}
          <button
            type="button"
            onClick={this.reload}
            className="mt-5 min-h-11 w-full rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
          >
            Reload SafeRoute
          </button>
        </section>
      </main>
    );
  }
}
