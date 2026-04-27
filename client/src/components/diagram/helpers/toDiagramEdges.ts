import { MarkerType, type Edge } from '@xyflow/react';
import type { DiagramData } from 'shared/types';

export const EDGE_BASE_WIDTHS: Record<string, number> = {
  solid: 2, dashed: 2, dotted: 2, thick: 4, animated: 2,
};

export const EDGE_DASH_PATTERNS: Record<string, string | undefined> = {
  dashed: '8 4', dotted: '2 4', animated: '8 4',
};

export function toDiagramEdges(data: DiagramData): Edge[] {
  const connectionEdges: Edge[] = data.connections.map(c => {
    const isSubnetConn = !!(c.source_subnet_id || c.target_subnet_id);
    const stroke = c.edge_color || (isSubnetConn ? '#8b5cf6' : '#64748b');
    const baseWidth = isSubnetConn ? 3 : (EDGE_BASE_WIDTHS[c.connection_type || 'solid'] ?? 2);
    const strokeWidth = c.edge_width ?? baseWidth;
    const strokeDasharray = EDGE_DASH_PATTERNS[c.connection_type || 'solid'];
    const style: React.CSSProperties = { stroke, strokeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) };

    const labelStyle = c.label_color ? { fill: c.label_color } : undefined;
    const labelBgStyle = c.label_bg_color ? { fill: c.label_bg_color } : { fill: 'transparent' };

    const source = c.source_device_id ? `device-${c.source_device_id}` : `subnet-${c.source_subnet_id}`;
    const target = c.target_device_id ? `device-${c.target_device_id}` : `subnet-${c.target_subnet_id}`;

    return {
      id: `edge-${c.id}`,
      source,
      target,
      sourceHandle: c.source_handle || null,
      targetHandle: c.target_handle || null,
      label: (() => {
        const parts: string[] = [];
        if (c.source_port || c.target_port) {
          parts.push([c.source_port, c.target_port].filter(Boolean).join(' → '));
        }
        if (c.label) parts.push(c.label);
        return parts.length > 0 ? parts.join(' | ') : undefined;
      })(),
      type: c.edge_type || 'default',
      animated: c.connection_type === 'animated',
      style,
      labelStyle,
      labelBgStyle,
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    };
  });

  const containedPairs = new Set(
    data.devices.filter(d => d.subnet_id != null).map(d => `${d.id}-${d.subnet_id}`)
  );
  const membershipEdges: Edge[] = data.subnet_memberships
    .filter(m => !containedPairs.has(`${m.device_id}-${m.subnet_id}`))
    .map(m => ({
      id: `membership-${m.device_id}-${m.subnet_id}`,
      source: `device-${m.device_id}`,
      target: `subnet-${m.subnet_id}`,
      type: 'straight',
      style: { strokeDasharray: '5 5', stroke: '#94a3b8', strokeWidth: 1.5 },
      selectable: false,
      deletable: false,
    }));
  return [...connectionEdges, ...membershipEdges];
}
