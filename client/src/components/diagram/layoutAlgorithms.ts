import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 150;
const NODE_HEIGHT = 80;
const SUBNET_WIDTH = 400;
const SUBNET_HEIGHT = 300;

// Rank priority: higher-tier devices get lower rank (appear at top)
const RANK_PRIORITY: Record<string, number> = {
  firewall: 0,
  router: 1,
  switch: 2,
  access_point: 3,
  server: 4,
  nas: 4,
  workstation: 5,
  iot: 6,
  camera: 6,
  phone: 6,
};

/**
 * Given final node positions and edges, compute optimal source/target handles
 * based on relative position of connected nodes so edges route cleanly.
 */
export function assignOptimalHandles(
  nodes: Node[],
  edges: Edge[]
): Map<string, { sourceHandle: string; targetHandle: string }> {
  const nodeMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of nodes) {
    const w = (n.measured?.width as number) || (n.id.startsWith('subnet-') ? SUBNET_WIDTH : NODE_WIDTH);
    const h = (n.measured?.height as number) || (n.id.startsWith('subnet-') ? SUBNET_HEIGHT : NODE_HEIGHT);
    nodeMap.set(n.id, { x: n.position.x, y: n.position.y, w, h });
  }

  const result = new Map<string, { sourceHandle: string; targetHandle: string }>();

  for (const e of edges) {
    if (e.id.startsWith('membership-')) continue;
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    const srcCx = src.x + src.w / 2;
    const srcCy = src.y + src.h / 2;
    const tgtCx = tgt.x + tgt.w / 2;
    const tgtCy = tgt.y + tgt.h / 2;
    const dx = tgtCx - srcCx;
    const dy = tgtCy - srcCy;

    let srcSide: string;
    let tgtSide: string;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal dominant
      srcSide = dx > 0 ? 'rgt' : 'lft';
      tgtSide = dx > 0 ? 'lft' : 'rgt';
    } else {
      // Vertical dominant
      srcSide = dy > 0 ? 'bot' : 'top';
      tgtSide = dy > 0 ? 'top' : 'bot';
    }

    const isSourceSubnet = e.source.startsWith('subnet-');
    const isTargetSubnet = e.target.startsWith('subnet-');

    // Device handles: {side}-c-s / {side}-c-t (center position)
    // Subnet handles: subnet-{side}-s / subnet-{side}-t
    const sourceHandle = isSourceSubnet ? `subnet-${srcSide}-s` : `${srcSide}-c-s`;
    const targetHandle = isTargetSubnet ? `subnet-${tgtSide}-t` : `${tgtSide}-c-t`;

    result.set(e.id, { sourceHandle, targetHandle });
  }

  return result;
}

export function hierarchicalLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 120, nodesep: 80, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  // Only layout device nodes (not subnets) and non-membership edges
  const deviceNodes = nodes.filter(n => n.id.startsWith('device-'));
  const subnetNodes = nodes.filter(n => n.id.startsWith('subnet-'));
  const layoutEdges = edges.filter(e => !e.id.startsWith('membership-'));

  deviceNodes.forEach(n => {
    const rank = RANK_PRIORITY[n.data?.deviceType as string] ?? 5;
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT, rank });
  });

  layoutEdges.forEach(e => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  });

  dagre.layout(g);

  const positioned = new Map<string, { x: number; y: number }>();
  deviceNodes.forEach(n => {
    const pos = g.node(n.id);
    if (pos) {
      positioned.set(n.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
    }
  });

  // Position subnets below the device layout
  const maxY = Math.max(0, ...Array.from(positioned.values()).map(p => p.y + NODE_HEIGHT));
  let subnetX = 40;
  const subnetY = maxY + 60;
  const subnetPositioned = new Map<string, { x: number; y: number }>();
  subnetNodes.forEach((n, i) => {
    subnetPositioned.set(n.id, { x: subnetX, y: subnetY + Math.floor(i / 2) * (SUBNET_HEIGHT + 40) });
    if (i % 2 === 0) {
      subnetX = 40;
    } else {
      subnetX = 40 + SUBNET_WIDTH + 60;
    }
    // Reset for next row
    if (i % 2 === 1) subnetX = 40;
  });

  return nodes.map(n => {
    const devicePos = positioned.get(n.id);
    if (devicePos) {
      // Remove parentId for hierarchical layout (don't nest inside subnets)
      const { parentId, extent, ...rest } = n as any;
      return { ...rest, position: devicePos };
    }
    const subnetPos = subnetPositioned.get(n.id);
    if (subnetPos) {
      return { ...n, position: subnetPos };
    }
    return n;
  });
}
