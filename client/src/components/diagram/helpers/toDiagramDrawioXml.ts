import type { DiagramData, DeviceType, NodePrefs } from 'shared/types';
import { diagramImageUrl } from '../../../api/diagramIcons';
import { buildMxfile, fetchAsDataUrl, type DrawioCell } from './drawioXml';

const CISCO_SHAPE: Record<DeviceType, string> = {
  router: 'mxgraph.cisco.routers.router',
  switch: 'mxgraph.cisco.switches.workgroup_switch',
  firewall: 'mxgraph.cisco.security.firewall',
  server: 'mxgraph.cisco.servers.standard_host',
  workstation: 'mxgraph.cisco.computers_and_peripherals.pc',
  nas: 'mxgraph.cisco.servers.storage_server',
  access_point: 'mxgraph.cisco.wireless.wireless_transport',
  phone: 'mxgraph.cisco.modems_and_phones.ip_phone',
  camera: 'mxgraph.cisco.computers_and_peripherals.video_camera',
  iot: 'mxgraph.cisco.computers_and_peripherals.terminal',
};

const DEVICE_WIDTH = 80;
const DEVICE_HEIGHT = 80;

function connectionStyle(type: string, color: string | null, width: number | null): string {
  const parts = ['endArrow=classic', 'html=1', 'rounded=0'];
  if (type === 'wifi') parts.push('dashed=1', 'dashPattern=1 3');
  else if (type === 'vpn') parts.push('dashed=1', 'dashPattern=6 6');
  else if (type === 'fiber') parts.push(`strokeWidth=${Math.max(2, width ?? 3)}`);
  else if (type === 'serial') parts.push('dashed=1', 'dashPattern=3 3');
  if (color) parts.push(`strokeColor=${color}`);
  if (width && type !== 'fiber') parts.push(`strokeWidth=${width}`);
  return parts.join(';');
}

function subnetStyle(p: NodePrefs | undefined): string {
  const fill = p?.bgColor || '#f5f5f5';
  const stroke = p?.borderColor || '#666666';
  return [
    'rounded=1',
    'whiteSpace=wrap',
    'html=1',
    'container=1',
    'collapsible=0',
    'verticalAlign=top',
    `fillColor=${fill}`,
    `strokeColor=${stroke}`,
  ].join(';');
}

function deviceStyle(type: DeviceType): string {
  const shape = CISCO_SHAPE[type];
  return [
    `shape=${shape}`,
    'html=1',
    'pointerEvents=1',
    'dashed=0',
    'fillColor=#036897',
    'strokeColor=#ffffff',
    'labelPosition=center',
    'verticalLabelPosition=bottom',
    'align=center',
    'verticalAlign=top',
    'outlineConnect=0',
  ].join(';');
}

function annotationStyle(color: string | null): string {
  return [
    'text',
    'html=1',
    'strokeColor=none',
    'fillColor=none',
    'align=left',
    'verticalAlign=top',
    'whiteSpace=wrap',
    'rounded=0',
    color ? `fontColor=${color}` : '',
  ].filter(Boolean).join(';');
}

export async function toDiagramDrawioXml(
  data: DiagramData,
  projectId: number,
): Promise<string> {
  const cells: DrawioCell[] = [];

  for (const s of data.subnets) {
    const prefs = data.node_preferences[`subnet-${s.id}`];
    const label = [s.name, s.cidr, s.vlan_id != null ? `VLAN ${s.vlan_id}` : null]
      .filter(Boolean)
      .join('\n');
    cells.push({
      kind: 'vertex',
      id: `sub-${s.id}`,
      value: label,
      style: subnetStyle(prefs),
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
    });
  }

  for (const d of data.devices) {
    const label = [d.name, d.primary_ip || ''].filter(Boolean).join('\n');
    const hasParent = d.subnet_id != null && data.subnets.some(s => s.id === d.subnet_id);
    cells.push({
      kind: 'vertex',
      id: `dev-${d.id}`,
      parent: hasParent ? `sub-${d.subnet_id}` : undefined,
      value: label,
      style: deviceStyle(d.type),
      x: d.x,
      y: d.y,
      width: DEVICE_WIDTH,
      height: DEVICE_HEIGHT,
    });
  }

  for (const a of (data.annotations || [])) {
    const size = a.font_size || 14;
    cells.push({
      kind: 'vertex',
      id: `ann-${a.id}`,
      value: a.text,
      style: annotationStyle(a.color) + `;fontSize=${size}`,
      x: a.x,
      y: a.y,
      width: Math.max(80, a.text.length * size * 0.6),
      height: Math.max(24, size * 1.8),
    });
  }

  const imageDataUrls = await Promise.all(
    (data.diagram_images || []).map(img => fetchAsDataUrl(diagramImageUrl(projectId, img.id))),
  );
  (data.diagram_images || []).forEach((img, i) => {
    const dataUrl = imageDataUrls[i];
    const style = dataUrl
      ? `shape=image;image=${dataUrl};verticalLabelPosition=bottom;labelBackgroundColor=#ffffff;verticalAlign=top;imageAspect=0`
      : 'rounded=0;whiteSpace=wrap;html=1;fillColor=#eeeeee;strokeColor=#999999';
    cells.push({
      kind: 'vertex',
      id: `img-${img.id}`,
      value: img.label || '',
      style,
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
    });
  });

  const subnetIds = new Set(data.subnets.map(s => s.id));
  const deviceIds = new Set(data.devices.map(d => d.id));

  for (const c of data.connections) {
    let source: string | null = null;
    let target: string | null = null;
    if (c.source_device_id && deviceIds.has(c.source_device_id)) source = `dev-${c.source_device_id}`;
    else if (c.source_subnet_id && subnetIds.has(c.source_subnet_id)) source = `sub-${c.source_subnet_id}`;
    if (c.target_device_id && deviceIds.has(c.target_device_id)) target = `dev-${c.target_device_id}`;
    else if (c.target_subnet_id && subnetIds.has(c.target_subnet_id)) target = `sub-${c.target_subnet_id}`;
    if (!source || !target) continue;
    const portParts = [c.source_port, c.target_port].filter(Boolean);
    const labelParts = [c.label, portParts.length ? `(${portParts.join(' → ')})` : null].filter(Boolean);
    cells.push({
      kind: 'edge',
      id: `conn-${c.id}`,
      source,
      target,
      value: labelParts.join(' '),
      style: connectionStyle(c.connection_type, c.edge_color, c.edge_width),
    });
  }

  return buildMxfile(cells, 'Network Diagram');
}
