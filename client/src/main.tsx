import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { InputDialogProvider } from './components/ui/InputDialog';
import { ToastProvider } from './components/ui/Toast';
import ErrorBoundary from './components/ui/ErrorBoundary';
import KeyboardShortcutsModal from './components/ui/KeyboardShortcutsModal';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <ConfirmDialogProvider>
            <InputDialogProvider>
            <ToastProvider>
              <App />
              <KeyboardShortcutsModal />
            </ToastProvider>
            </InputDialogProvider>
          </ConfirmDialogProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
