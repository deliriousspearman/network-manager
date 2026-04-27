import type { Project } from 'shared/types';

export function projectImageUrl(p: Pick<Project, 'id' | 'image_mime_type' | 'updated_at'> | null | undefined): string | null {
  if (!p || !p.image_mime_type) return null;
  return `/api/projects/${p.id}/image?v=${encodeURIComponent(p.updated_at)}`;
}

export function projectInitials(p: Pick<Project, 'name' | 'short_name'> | null | undefined): string {
  if (!p) return 'P';
  return p.short_name || (p.name || 'P').substring(0, 2).toUpperCase();
}
