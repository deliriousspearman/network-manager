import type { AgentDiagramData, AgentDiagramView, AgentDiagramAnnotation, AgentDiagramImage, LegendItem, LabelPlacementV, LabelPlacementH } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

function base(projectId: number): string {
  return projectBase(projectId, 'agent-diagram');
}

export async function fetchAgentDiagram(projectId: number, viewId?: number): Promise<AgentDiagramData> {
  const url = viewId ? `${base(projectId)}?view_id=${viewId}` : base(projectId);
  const res = await fetch(url);
  if (!res.ok) await throwApiError(res, 'Failed to fetch agent diagram');
  return res.json();
}

export async function updateAgentPositions(
  projectId: number,
  agents: { id: number; x: number; y: number }[],
  viewId?: number,
): Promise<void> {
  const res = await fetch(`${base(projectId)}/positions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agents, view_id: viewId }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update agent positions');
}

export async function addAgentToDiagram(
  projectId: number,
  agentId: number,
  x: number,
  y: number,
  viewId?: number,
): Promise<void> {
  const res = await fetch(`${base(projectId)}/agents/${agentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, view_id: viewId }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to add agent to diagram');
}

export async function removeAgentFromDiagram(
  projectId: number,
  agentId: number,
  viewId?: number,
): Promise<void> {
  const url = viewId
    ? `${base(projectId)}/agents/${agentId}?view_id=${viewId}`
    : `${base(projectId)}/agents/${agentId}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to remove agent from diagram');
}

// View CRUD
export async function createAgentView(projectId: number, name: string): Promise<AgentDiagramView> {
  const res = await fetch(`${base(projectId)}/views`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create view');
  return res.json();
}

export async function updateAgentView(projectId: number, viewId: number, name: string): Promise<AgentDiagramView> {
  const res = await fetch(`${base(projectId)}/views/${viewId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update view');
  return res.json();
}

export async function deleteAgentView(projectId: number, viewId: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/views/${viewId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete view');
}

// Annotations
export async function createAgentAnnotation(
  projectId: number,
  data: { x: number; y: number; text?: string; font_size?: number; color?: string | null; view_id?: number },
): Promise<AgentDiagramAnnotation> {
  const res = await fetch(`${base(projectId)}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create annotation');
  return res.json();
}

export async function updateAgentAnnotation(
  projectId: number,
  id: number,
  data: Partial<{ x: number; y: number; text: string; font_size: number; color: string | null }>,
): Promise<AgentDiagramAnnotation> {
  const res = await fetch(`${base(projectId)}/annotations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update annotation');
  return res.json();
}

export async function deleteAgentAnnotation(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/annotations/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete annotation');
}

// Diagram images
export function agentDiagramImageUrl(projectId: number, imageId: number): string {
  return `${base(projectId)}/images/${imageId}/image`;
}

export async function createAgentDiagramImage(
  projectId: number,
  payload: {
    x: number; y: number; width?: number; height?: number;
    filename: string; mime_type: string; data: string;
    label?: string | null; view_id?: number;
  },
): Promise<AgentDiagramImage> {
  const res = await fetch(`${base(projectId)}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create diagram image');
  return res.json();
}

export async function updateAgentDiagramImage(
  projectId: number,
  imageId: number,
  patch: Partial<{ x: number; y: number; width: number; height: number; label: string | null; label_placement_v: LabelPlacementV; label_placement_h: LabelPlacementH }>,
): Promise<AgentDiagramImage> {
  const res = await fetch(`${base(projectId)}/images/${imageId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update diagram image');
  return res.json();
}

export async function deleteAgentDiagramImage(projectId: number, imageId: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/images/${imageId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete diagram image');
}

export async function updateAgentDiagramLegendItems(projectId: number, items: LegendItem[]): Promise<void> {
  const res = await fetch(`${base(projectId)}/legend`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update legend');
}
