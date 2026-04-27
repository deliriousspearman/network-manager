import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type ProjectEventAction = 'created' | 'updated' | 'deleted';
interface ProjectEvent { type: string; action: ProjectEventAction; resourceId?: number | string }

// Maps a server event type to the TanStack query-key prefixes that should be
// invalidated on the client. Prefix matching is on by default in v5 so
// ['devices', projectId] also invalidates ['devices', projectId, 'paged', ...].
const INVALIDATION_MAP: Record<string, string[]> = {
  device: ['devices', 'device', 'diagram', 'activity-logs', 'project-stats'],
  subnet: ['subnets', 'subnet', 'diagram', 'activity-logs', 'project-stats'],
  connection: ['connections', 'diagram', 'activity-logs'],
  credential: ['credentials', 'activity-logs'],
  agent: ['agents', 'agent-activity', 'agent-diagram', 'activity-logs', 'project-stats'],
  agent_connection: ['agent-diagram', 'activity-logs'],
  diagram: ['diagram'],
  agent_diagram: ['agent-diagram'],
};

export function useProjectEvents(projectId: number | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;
    const url = `/api/projects/${projectId}/events`;
    const source = new EventSource(url);

    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as ProjectEvent;
        const keys = INVALIDATION_MAP[event.type];
        if (!keys) return;
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: [key, projectId] });
        }
      } catch { /* ignore malformed frames */ }
    };

    // EventSource auto-reconnects on transient errors; just log and let it
    // recover. Closing here would prevent recovery.
    source.onerror = () => { /* browser will retry */ };

    return () => { source.close(); };
  }, [projectId, queryClient]);
}
