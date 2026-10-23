import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-700.css';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/opendyslexic/latin-400.css';
import '@fontsource/opendyslexic/latin-700.css';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';

// Shared modules read this. They cannot use import.meta: the Android bundle
// compiles those files, and Hermes rejects that syntax.
(globalThis as { __WORD_BASE_URL__?: string }).__WORD_BASE_URL__ = import.meta.env.BASE_URL;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>,
);
