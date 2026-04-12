import type { NavigateFunction } from 'react-router-dom';
import type { MouseEvent } from 'react';

/**
 * Returns onClick and onAuxClick handlers for a table row that support:
 * - Left click → client-side navigate
 * - Middle click → open in new tab
 * - Ctrl/Cmd + click → open in new tab
 */
export function rowNavHandlers(to: string, navigate: NavigateFunction) {
  return {
    onClick: (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.button === 1) {
        window.open(to, '_blank');
      } else {
        navigate(to);
      }
    },
    onAuxClick: (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        window.open(to, '_blank');
      }
    },
  };
}
