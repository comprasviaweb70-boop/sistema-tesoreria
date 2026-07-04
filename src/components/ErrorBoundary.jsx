import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#111', color: '#ff4444', fontFamily: 'monospace', minHeight: '100vh' }}>
          <h1>⚠️ Error en la aplicación</h1>
          <p style={{ color: '#fff' }}>La app falló al cargar. Por favor copia el error y compártelo:</p>
          <pre style={{ background: '#222', padding: '1rem', borderRadius: '8px', overflow: 'auto', marginTop: '1rem' }}>
            {this.state.error?.toString()}
            {'\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
