import type { Project, ProjectStats, CreateProjectRequest, UpdateProjectRequest } from 'shared/types';

const BASE = '/api/projects';

export async function fetchProjectStats(projectId: number): Promise<ProjectStats> {
  const res = await fetch(`${BASE}/${projectId}/stats`);
  if (!res.ok) throw new Error('Failed to fetch project stats');
  return res.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error('Project not found');
  return res.json();
}

export async function fetchProjectBySlug(slug: string): Promise<Project> {
  const res = await fetch(`${BASE}/by-slug/${slug}`);
  if (!res.ok) throw new Error('Project not found');
  return res.json();
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create project');
  }
  return res.json();
}

export async function updateProject(id: number, data: UpdateProjectRequest): Promise<Project> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update project');
  }
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete project');
  }
}
