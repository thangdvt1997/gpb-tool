import React from 'react';
import ReactDOM from 'react-dom/client';
import './ui/ui-system.css';
import App from './App';
import './styles.css';
import './theme/theme.css';
import { ThemeProvider } from './theme/ThemeProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider override={null}>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
