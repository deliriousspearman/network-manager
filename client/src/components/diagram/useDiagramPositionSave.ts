import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node } from '@xyflow/react';
import { updatePositions, updateAnnotation } from '../../api/diagram';
import { updateDiagramImage } from '../../api/diagramIcons';
import { useToast } from '../ui/Toast';

type PendingPositions = {
  devices: { id: number; x: number; y: number }[];
  subnets: { id: number; x: number; y: number; width: number; height: number }[];
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Params {
  projectId: number;
  currentViewId: number | undefined;
}

export function useDiagramPositionSave({ projectId, currentViewId }: Params) {
  const toast = useToast();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPositionsRef = useRef<PendingPositions | null>(null);
  const viewIdRef = useRef<number | undefined>(currentViewId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { viewIdRef.current = currentViewId; }, [currentViewId]);

  const flushPositions = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingPositionsRef.current;
    if (!pending) return;
    pendingPositionsRef.current = null;
    updatePositions(projectId, pending, viewIdRef.current).then(() => {
      setSaveStatus('saved');
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }).catch(() => {
      setSaveStatus('idle');
      toast('Failed to save diagram positions — changes may be lost', 'error');
    });
  }, [projectId, toast]);

  const savePositions = useCallback((updatedNodes: Node[]) => {
    const devices = updatedNodes
      .filter(n => n.id.startsWith('device-'))
      .map(n => ({ id: parseInt(n.id.replace('device-', '')), x: n.position.x, y: n.position.y }));
    const subnets = updatedNodes
      .filter(n => n.id.startsWith('subnet-'))
      .map(n => ({
        id: parseInt(n.id.replace('subnet-', '')),
        x: n.position.x, y: n.position.y,
        width: (n.style?.width as number) || 400,
        height: (n.style?.height as number) || 300,
      }));
    const annotations = updatedNodes
      .filter(n => n.id.startsWith('annotation-'))
      .map(n => ({ id: parseInt(n.id.replace('annotation-', '')), x: n.position.x, y: n.position.y }));
    for (const a of annotations) {
      updateAnnotation(projectId, a.id, { x: a.x, y: a.y }).catch(() => {
        toast('Failed to save annotation position', 'error');
      });
    }
    const images = updatedNodes
      .filter(n => n.id.startsWith('image-'))
      .map(n => ({
        id: parseInt(n.id.replace('image-', '')),
        x: n.position.x,
        y: n.position.y,
        width: parseFloat(String(n.width ?? n.style?.width ?? n.measured?.width ?? 0)) || undefined,
        height: parseFloat(String(n.height ?? n.style?.height ?? n.measured?.height ?? 0)) || undefined,
      }));
    for (const img of images) {
      updateDiagramImage(projectId, img.id, { x: img.x, y: img.y, width: img.width, height: img.height }).catch(() => {
        toast('Failed to save image position', 'error');
      });
    }
    setSaveStatus('saving');
    pendingPositionsRef.current = { devices, subnets };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushPositions(), 500);
  }, [flushPositions, projectId, toast]);

  // Cancel any pending debounced save without sending it. Used by operations
  // that are about to overwrite positions (e.g. auto-layout).
  const cancelPending = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingPositionsRef.current = null;
  }, []);

  // Flush pending position saves on unmount.
  useEffect(() => {
    return () => flushPositions();
  }, [flushPositions]);

  // Flush pending position saves on tab close + warn about unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingPositionsRef.current) {
        e.preventDefault();
      }
      flushPositions();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushPositions]);

  return { savePositions, flushPositions, cancelPending, saveStatus };
}
