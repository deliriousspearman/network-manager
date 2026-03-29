import type { Project, ProjectStats, CreateProjectRequest, UpdateProjectRequest } from 'shared/types';
import { throwApiError } from '../utils/apiError';

const BASE = '/api/projects';

export async function fetchProjectStats(projectId: number): Promise<ProjectStats> {
  const res = await fetch(`${BASE}/${projectId}/stats`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch project stats');
  return res.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(BASE);
  if (!res.ok) await throwApiError(res, 'Failed to fetch projects');
  return res.json();
}

export async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) await throwApiError(res, 'Project not found');
  return res.json();
}

export async function fetchProjectBySlug(slug: string): Promise<Project> {
  const res = await fetch(`${BASE}/by-slug/${slug}`);
  if (!res.ok) await throwApiError(res, 'Project not found');
  return res.json();
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create project');
  return res.json();
}

export async function updateProject(id: number, data: UpdateProjectRequest): Promise<Project> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update project');
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete project');
}
