import { Component, type ReactNode } from 'react'

type State = { error: Error | null }

/** Keeps a crash from leaving an invisible, empty window at the screen edge. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error(error)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash" data-app>
        <strong>Something broke</strong>
        <p>{error.message}</p>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
