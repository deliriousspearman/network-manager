import type { AgentDiagramData } from 'shared/types';
import { agentDiagramImageUrl } from '../../../api/agentDiagram';
import { buildMxfile, fetchAsDataUrl, type DrawioCell } from './drawioXml';

const AGENT_WIDTH = 160;
const AGENT_HEIGHT = 60;

function agentStyle(): string {
  return [
    'rounded=1',
    'whiteSpace=wrap',
    'html=1',
    'fillColor=#eef6ff',
    'strokeColor=#3b82f6',
    'align=center',
    'verticalAlign=middle',
    'fontSize=12',
  ].join(';');
}

function annotationStyle(color: string | null, fontSize: number): string {
  return [
    'text',
    'html=1',
    'strokeColor=none',
    'fillColor=none',
    'align=left',
    'verticalAlign=top',
    'whiteSpace=wrap',
    'rounded=0',
    `fontSize=${fontSize}`,
    color ? `fontColor=${color}` : '',
  ].filter(Boolean).join(';');
}

function connectionStyle(connectionType: string, color: string | null, width: number | null): string {
  const parts = ['endArrow=classic', 'html=1', 'rounded=0'];
  const dashKey = (connectionType || 'link').split(':')[1] || 'solid';
  if (dashKey === 'dashed') parts.push('dashed=1', 'dashPattern=6 4');
  else if (dashKey === 'dotted') parts.push('dashed=1', 'dashPattern=2 3');
  if (color) parts.push(`strokeColor=${color}`);
  if (width) parts.push(`strokeWidth=${width}`);
  return parts.join(';');
}

export async function toAgentMapDrawioXml(
  data: AgentDiagramData,
  projectId: number,
): Promise<string> {
  const cells: DrawioCell[] = [];

  for (const a of data.agents) {
    const deviceName = a.device_name ? `on ${a.device_name}` : '';
    const label = [a.name, a.agent_type, deviceName].filter(Boolean).join('\n');
    cells.push({
      kind: 'vertex',
      id: `agent-${a.id}`,
      value: label,
      style: agentStyle(),
      x: a.x,
      y: a.y,
      width: AGENT_WIDTH,
      height: AGENT_HEIGHT,
    });
  }

  for (const ann of (data.annotations || [])) {
    const size = ann.font_size || 14;
    cells.push({
      kind: 'vertex',
      id: `agent-ann-${ann.id}`,
      value: ann.text,
      style: annotationStyle(ann.color, size),
      x: ann.x,
      y: ann.y,
      width: Math.max(80, ann.text.length * size * 0.6),
      height: Math.max(24, size * 1.8),
    });
  }

  const imageDataUrls = await Promise.all(
    (data.images || []).map(img => fetchAsDataUrl(agentDiagramImageUrl(projectId, img.id))),
  );
  (data.images || []).forEach((img, i) => {
    const dataUrl = imageDataUrls[i];
    const style = dataUrl
      ? `shape=image;image=${dataUrl};verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;imageAspect=0`
      : 'rounded=0;whiteSpace=wrap;html=1;fillColor=#eeeeee;strokeColor=#999999';
    cells.push({
      kind: 'vertex',
      id: `agent-img-${img.id}`,
      value: img.label || '',
      style,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
    });
  });

  const agentIds = new Set(data.agents.map(a => a.id));
  const imageIds = new Set((data.images || []).map(i => i.id));

  for (const c of data.connections) {
    let source: string | null = null;
    let target: string | null = null;
    if (c.source_agent_id && agentIds.has(c.source_agent_id)) source = `agent-${c.source_agent_id}`;
    else if (c.source_image_id && imageIds.has(c.source_image_id)) source = `agent-img-${c.source_image_id}`;
    if (c.target_agent_id && agentIds.has(c.target_agent_id)) target = `agent-${c.target_agent_id}`;
    else if (c.target_image_id && imageIds.has(c.target_image_id)) target = `agent-img-${c.target_image_id}`;
    if (!source || !target) continue;
    cells.push({
      kind: 'edge',
      id: `agent-conn-${c.id}`,
      source,
      target,
      value: c.label || '',
      style: connectionStyle(c.connection_type || 'link', c.edge_color, c.edge_width),
    });
  }

  return buildMxfile(cells, 'Agent Map');
}
