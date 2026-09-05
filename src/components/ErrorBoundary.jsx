import { Component } from 'react'

// React only supports error boundaries as class components — no hook
// equivalent exists. Catches render/lifecycle errors anywhere below it so a
// bug shows a plain message instead of a blank white page.
export class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-paper p-6">
          <div className="max-w-sm rounded-lg border border-line bg-mist p-6 text-center">
            <h1 className="font-display mb-2 text-lg font-semibold text-ink">Something went wrong</h1>
            <p className="mb-4 text-sm text-muted">
              This screen hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
