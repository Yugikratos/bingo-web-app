import React, { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Bingo App Encountered an Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#090A0F',
            color: '#F8FAFC',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif'
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🌹</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px', color: '#FB7185' }}>
            Oops! Quick Refresh Needed 💕
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '20px', maxWidth: '320px' }}>
            {this.state.error?.message || 'A minor error occurred while rendering the app.'}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                backgroundColor: '#E11D48',
                color: 'white',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('bingo_date_night_wager');
                localStorage.removeItem('bingo_wager_history_v1');
                window.location.reload();
              }}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                backgroundColor: '#1E293B',
                color: '#CBD5E1',
                border: '1px solid #334155',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Reset Storage & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
