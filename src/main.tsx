import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { initializePlatform } from './platform';

async function bootstrap(): Promise<void> {
  // A failed native-bridge import must not stop the web app from mounting.
  try {
    await initializePlatform();
  } catch (error) {
    console.error('Platform initialisation failed; continuing with web adapters.', error);
  }

  const rootElement = document.getElementById('root');
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary title="Personal OS could not start">
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  }
}

void bootstrap();

