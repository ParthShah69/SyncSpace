import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', borderRadius: '8px', margin: '20px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Something went wrong.</h2>
                    <p style={{ marginTop: '10px', fontFamily: 'monospace' }}>{this.state.error && this.state.error.toString()}</p>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px', fontSize: '12px' }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
