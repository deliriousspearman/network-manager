import { useEffect } from 'react';
import type { SelectedElement } from '../PropertiesPanel';

interface Params {
  placingAnnotation: boolean;
  setPlacingAnnotation: (v: boolean) => void;
  selectedNodeIds: string[];
  selectedElement: SelectedElement | null;
  handleUndo: () => void;
  handleRedo: () => void;
  handleBulkRemove: () => void;
  handleDeleteEdge: (id: string) => Promise<void> | void;
  confirm: (msg: string) => Promise<boolean>;
}

// Global keyboard shortcuts for the diagram canvas: Ctrl/Cmd+Z undo,
// Ctrl/Cmd+Shift+Z redo, Delete/Backspace to remove the current selection,
// and Escape to cancel annotation placement. Skipped while the user is
// typing into inputs/textareas/selects to avoid eating ordinary keystrokes.
export function useDiagramKeyboard({
  placingAnnotation,
  setPlacingAnnotation,
  selectedNodeIds,
  selectedElement,
  handleUndo,
  handleRedo,
  handleBulkRemove,
  handleDeleteEdge,
  confirm,
}: Params) {
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape' && placingAnnotation) { setPlacingAnnotation(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selectedNodeIds.length > 0) {
        handleBulkRemove();
      } else if (selectedElement?.type === 'edge') {
        if (await confirm('Delete this connection?')) handleDeleteEdge(selectedElement.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    placingAnnotation, setPlacingAnnotation,
    selectedNodeIds, selectedElement,
    handleUndo, handleRedo, handleBulkRemove, handleDeleteEdge, confirm,
  ]);
}
