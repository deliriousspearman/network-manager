import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '../contexts/ProjectContext';
import { useToast } from '../components/ui/Toast';
import { fetchTrash, type TrashResourceType } from '../api/trash';
import { undoLogEntry } from '../api/undo';
import { projectBase } from '../api/base';

// Routes a TrashResourceType back to the REST DELETE endpoint that originally
// produced the trash entry, so redo can re-fire the same delete.
function deleteUrlFor(projectId: number, type: TrashResourceType, resourceId: number): string {
  switch (type) {
    case 'device': return `${projectBase(projectId, 'devices')}/${resourceId}`;
    case 'subnet': return `${projectBase(projectId, 'subnets')}/${resourceId}`;
    case 'credential': return `${projectBase(projectId, 'credentials')}/${resourceId}`;
    case 'connection': return `${projectBase(projectId, 'connections')}/${resourceId}`;
    case 'agent': return `${projectBase(projectId, 'agents')}/${resourceId}`;
    case 'timeline_entry': return `${projectBase(projectId, 'timeline')}/${resourceId}`;
    case 'annotation': return `${projectBase(projectId, 'diagram')}/annotations/${resourceId}`;
    case 'agent_annotation': return `${projectBase(projectId, 'agent-diagram')}/annotations/${resourceId}`;
  }
}

// Human label for toast feedback.
function describeResource(type: TrashResourceType, name: string | null): string {
  const noun = ({
    device: 'device',
    subnet: 'subnet',
    credential: 'credential',
    connection: 'connection',
    agent: 'agent',
    timeline_entry: 'timeline entry',
    annotation: 'annotation',
    agent_annotation: 'annotation',
  } as Record<TrashResourceType, string>)[type];
  return name ? `${noun} '${name}'` : noun;
}

interface RedoEntry {
  resourceType: TrashResourceType;
  resourceId: number;
  resourceName: string | null;
}

function isFormFocus(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el === document.body) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function isDiagramFocus(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  return !!(el as HTMLElement).closest?.('.react-flow');
}

/**
 * Global Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y (redo) for
 * server-recorded destructive actions (device/subnet/credential/connection/
 * agent/timeline/annotation deletes — anything the dispatch map in
 * server/src/routes/undo.ts handles).
 *
 * Coordination:
 *  - When typing in a form field the browser owns Ctrl+Z (textarea undo).
 *  - When the diagram canvas is focused the local useUndoRedo handles node
 *    moves. We defer to it.
 *  - Otherwise we pull the most recent undoable trash entry and POST /undo.
 *
 * Redo is session-only: undo pushes onto an in-memory stack; the next redo
 * re-fires the resource's DELETE. Matches typical undo/redo semantics in
 * single-tab apps.
 */
export function useGlobalUndoRedo(): void {
  const { projectId } = useProject();
  const toast = useToast();
  const queryClient = useQueryClient();
  const redoStackRef = useRef<RedoEntry[]>([]);
  // Suppress the keypress immediately after a successful undo/redo so a held
  // key doesn't trigger a second action while React commits the result.
  const busyRef = useRef(false);

  const invalidateRelevant = useCallback(() => {
    // Conservative invalidation — these are the queries that show resources
    // we might have just resurrected or re-deleted. Cheaper than a global
    // invalidate, and good enough since trash actions are rare events.
    queryClient.invalidateQueries({ queryKey: ['devices', projectId] });
    queryClient.invalidateQueries({ queryKey: ['subnets', projectId] });
    queryClient.invalidateQueries({ queryKey: ['credentials', projectId] });
    queryClient.invalidateQueries({ queryKey: ['connections', projectId] });
    queryClient.invalidateQueries({ queryKey: ['agents', projectId] });
    queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
    queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
    queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
  }, [projectId, queryClient]);

  const undoMostRecent = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const { items } = await fetchTrash(projectId, undefined, 1);
      const top = items[0];
      if (!top) {
        toast('Nothing to undo', 'info');
        return;
      }
      await undoLogEntry(projectId, top.id);
      if (top.resource_id != null) {
        redoStackRef.current.push({
          resourceType: top.resource_type,
          resourceId: top.resource_id,
          resourceName: top.resource_name,
        });
      }
      invalidateRelevant();
      toast(`Restored ${describeResource(top.resource_type, top.resource_name)} — Ctrl+Shift+Z to redo`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Undo failed', 'error');
    } finally {
      busyRef.current = false;
    }
  }, [projectId, toast, invalidateRelevant]);

  const redoMostRecent = useCallback(async () => {
    if (busyRef.current) return;
    const entry = redoStackRef.current.pop();
    if (!entry) {
      toast('Nothing to redo', 'info');
      return;
    }
    busyRef.current = true;
    try {
      const res = await fetch(deleteUrlFor(projectId, entry.resourceType, entry.resourceId), { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed to redo (${res.status})`);
      }
      invalidateRelevant();
      toast(`Re-deleted ${describeResource(entry.resourceType, entry.resourceName)}`, 'success');
    } catch (err) {
      // If redo fails, push the entry back so a later attempt can retry.
      redoStackRef.current.push(entry);
      toast(err instanceof Error ? err.message : 'Redo failed', 'error');
    } finally {
      busyRef.current = false;
    }
  }, [projectId, toast, invalidateRelevant]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Browser-native undo wins inside form fields.
      if (isFormFocus()) return;
      // Diagram-local undo (node moves) wins on the canvas — its own listener
      // calls preventDefault first.
      if (e.defaultPrevented) return;
      if (isDiagramFocus()) return;

      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void undoMostRecent();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        void redoMostRecent();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoMostRecent, redoMostRecent]);
}
