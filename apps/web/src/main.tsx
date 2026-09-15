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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>,
);
