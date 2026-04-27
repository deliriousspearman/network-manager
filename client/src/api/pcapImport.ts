import type { PcapAnalyzeResult, PcapApplyAction, PcapApplyResult, NmapAnalyzeResult, NmapApplyAction, NmapApplyResult } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function analyzePcap(
  projectId: number,
  payload: { filename: string; data: string },
): Promise<PcapAnalyzeResult> {
  const res = await fetch(`${projectBase(projectId, 'import')}/pcap/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to analyze PCAP file');
  return res.json();
}

export async function analyzeArp(
  projectId: number,
  payload: { text: string },
): Promise<PcapAnalyzeResult> {
  const res = await fetch(`${projectBase(projectId, 'import')}/arp/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to analyze ARP output');
  return res.json();
}

export async function applyPcapActions(
  projectId: number,
  actions: PcapApplyAction[],
): Promise<PcapApplyResult> {
  const res = await fetch(`${projectBase(projectId, 'import')}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to apply import');
  return res.json();
}

export async function analyzeNmap(
  projectId: number,
  payload: { filename: string; text: string },
): Promise<NmapAnalyzeResult> {
  const res = await fetch(`${projectBase(projectId, 'import')}/nmap/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to analyze Nmap file');
  return res.json();
}

export async function applyNmapActions(
  projectId: number,
  actions: NmapApplyAction[],
): Promise<NmapApplyResult> {
  const res = await fetch(`${projectBase(projectId, 'import')}/nmap/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to apply Nmap import');
  return res.json();
}
