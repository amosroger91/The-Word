import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, any render-time throw in any feature (Group Study mesh, the
// breakdown panel, a corrupted bookmark entry, whatever) white-screens the
// entire reader with no way back except a manual URL edit. This is the last
// line of defense: it cannot stop the throw, but it stops it from taking down
// everything else, and it gives a way out of a reload-crash-reload loop caused
// by bad local state.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The Word crashed:', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  private resetLocalData = () => {
    const warned = window.confirm(
      'This clears bookmarks, reading progress, badges, and your account key on this device. ' +
      'If you have not backed up your account key, it cannot be recovered afterward. Continue?',
    );
    if (!warned) return;
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('word.')) window.localStorage.removeItem(key);
      }
    } catch {
      // Storage may be unavailable (private mode, quota); reloading still helps.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Something went wrong</h1>
          <p style={styles.body}>
            The Word hit an error it could not recover from. Reloading usually fixes it.
          </p>
          <div style={styles.actions}>
            <button style={styles.primaryButton} onClick={this.reload}>Reload</button>
            <button style={styles.linkButton} onClick={this.resetLocalData}>
              Still broken? Clear local data and reload
            </button>
          </div>
          <pre style={styles.detail}>{this.state.error.message}</pre>
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#f7f4ee',
    color: '#292720',
    fontFamily: 'Georgia, serif',
  },
  card: { maxWidth: 440, textAlign: 'center' },
  heading: { fontSize: 22, fontWeight: 400, margin: '0 0 12px' },
  body: { margin: '0 0 20px', lineHeight: 1.5, color: '#5a5342' },
  actions: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' },
  primaryButton: {
    padding: '10px 24px',
    fontSize: 15,
    borderRadius: 8,
    border: 'none',
    background: '#947849',
    color: '#fff',
    cursor: 'pointer',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#8e806c',
    fontSize: 13,
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 4,
  },
  detail: {
    marginTop: 24,
    fontSize: 11,
    color: '#a39a86',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    textAlign: 'left',
  },
};
