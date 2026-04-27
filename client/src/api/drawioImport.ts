import type {
  DrawioExtraction,
  DrawioAnalyzeResult,
  DrawioApplyAction,
  DrawioApplyResult,
} from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function matchDrawio(
  projectId: number,
  extraction: DrawioExtraction,
): Promise<DrawioAnalyzeResult> {
  const res = await fetch(`${projectBase(projectId, 'drawio-import')}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(extraction),
  });
  if (!res.ok) await throwApiError(res, 'Failed to analyze draw.io file');
  return res.json();
}

export async function applyDrawioImport(
  projectId: number,
  actions: DrawioApplyAction[],
  viewId?: number,
): Promise<DrawioApplyResult> {
  const res = await fetch(`${projectBase(projectId, 'drawio-import')}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions, view_id: viewId }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to apply draw.io import');
  return res.json();
}
