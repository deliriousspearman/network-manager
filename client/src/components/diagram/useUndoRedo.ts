import { useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

export function useUndoRedo(maxHistory = 50) {
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);

  const takeSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
    undoStack.current.push({
      nodes: nodes.map(n => ({ ...n, position: { ...n.position }, data: { ...n.data }, style: n.style ? { ...n.style } : undefined })),
      edges: edges.map(e => ({ ...e })),
    });
    if (undoStack.current.length > maxHistory) undoStack.current.shift();
    redoStack.current = [];
  }, [maxHistory]);

  const undo = useCallback((): Snapshot | null => {
    if (undoStack.current.length === 0) return null;
    const snapshot = undoStack.current.pop()!;
    return snapshot;
  }, []);

  const redo = useCallback((): Snapshot | null => {
    if (redoStack.current.length === 0) return null;
    const snapshot = redoStack.current.pop()!;
    return snapshot;
  }, []);

  const pushRedo = useCallback((nodes: Node[], edges: Edge[]) => {
    redoStack.current.push({
      nodes: nodes.map(n => ({ ...n, position: { ...n.position }, data: { ...n.data }, style: n.style ? { ...n.style } : undefined })),
      edges: edges.map(e => ({ ...e })),
    });
  }, []);

  const canUndo = useCallback(() => undoStack.current.length > 0, []);
  const canRedo = useCallback(() => redoStack.current.length > 0, []);

  return { takeSnapshot, undo, redo, pushRedo, canUndo, canRedo };
}
