import type { KeyboardEvent } from 'react';

export function onCmdEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
}
