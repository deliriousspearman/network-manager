import { EventEmitter } from 'events';

export type ProjectEventAction = 'created' | 'updated' | 'deleted';

export interface ProjectEvent {
  type: string;
  action: ProjectEventAction;
  resourceId?: number | string;
}

const emitter = new EventEmitter();
// Each open SSE connection adds a listener. Disable the default 10-listener
// warning so a handful of tabs per project doesn't spam stderr.
emitter.setMaxListeners(0);

function channel(projectId: number): string {
  return `project:${projectId}`;
}

export function subscribe(projectId: number, handler: (event: ProjectEvent) => void): () => void {
  emitter.on(channel(projectId), handler);
  return () => emitter.off(channel(projectId), handler);
}

export function publish(projectId: number, event: ProjectEvent): void {
  emitter.emit(channel(projectId), event);
}

export function publishSafe(projectId: number | undefined | null, type: string, action: ProjectEventAction, resourceId?: number | string): void {
  if (projectId == null) return;
  publish(projectId, { type, action, resourceId });
}
