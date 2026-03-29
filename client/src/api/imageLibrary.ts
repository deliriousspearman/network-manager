import type { ImageLibraryItem } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

function base(projectId: number) {
  return projectBase(projectId, 'image-library');
}

export async function fetchImageLibrary(projectId: number): Promise<ImageLibraryItem[]> {
  const res = await fetch(base(projectId));
  if (!res.ok) await throwApiError(res, 'Failed to fetch image library');
  return res.json();
}

export function imageLibraryImageUrl(projectId: number, imageId: number): string {
  return `${base(projectId)}/${imageId}/image`;
}

export async function fetchImageLibraryData(projectId: number, imageId: number): Promise<{ filename: string; mime_type: string; data: string }> {
  const res = await fetch(`${base(projectId)}/${imageId}/data`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch image data');
  return res.json();
}

export async function uploadImageToLibrary(
  projectId: number,
  payload: { filename: string; mime_type: string; data: string }
): Promise<ImageLibraryItem> {
  const res = await fetch(base(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to upload image');
  return res.json();
}

export async function deleteImageFromLibrary(projectId: number, imageId: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/${imageId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete image');
}
