import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng, toSvg } from 'html-to-image';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  MarkerType,
  type Node,
  type Edge,
  type Connection as RFConnection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUndoRedo } from './useUndoRedo';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../ui/Toast';
import { agentTypeIconUrl } from '../../api/agentTypes';
import { DEFAULT_AGENT_ICONS } from '../../assets/agent-icons';
import {
  fetchAgentDiagram, updateAgentPositions, addAgentToDiagram, removeAgentFromDiagram,
  agentDiagramImageUrl, createAgentDiagramImage, updateAgentDiagramImage, deleteAgentDiagramImage,
  updateAgentDiagramLegendItems,
} from '../../api/agentDiagram';
import {
  createAgentConnection, updateAgentConnection, deleteAgentConnection,
} from '../../api/agentConnections';
import { updateAgent } from '../../api/agents';
import { queryKeys } from '../../api/queryKeys';
import type { AgentDiagramData, AgentDiagramImage, AgentConnection, AgentWithDevice, AgentStatus, LegendItem } from 'shared/types';
import AgentNode from './nodes/AgentNode';
import ImageNode from './nodes/ImageNode';
import ImageLibraryModal from './ImageLibraryModal';
import AgentPropertiesPanel, { type AgentSelected, type AgentEdgePatch, type AgentImagePatch } from '../agents/AgentPropertiesPanel';
import AgentMapToolbar from './AgentMapToolbar';
import DiagramLegend from './DiagramLegend';
import { useAgentMapPrefs } from './hooks/useAgentMapPrefs';
import { toAgentMapDrawioXml } from './helpers/toAgentMapDrawioXml';
import { triggerDrawioDownload } from './helpers/drawioXml';

const nodeTypes = { agent: AgentNode, agentDiagramImage: ImageNode };

const EDGE_DASH_PATTERNS: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '6 4',
  dotted: '2 3',
};

interface IconResolver {
  (agentTypeKey: string): string;
}

function buildIconResolver(projectId: number, agentTypes: AgentDiagramData['agent_types']): IconResolver {
  const cache = new Map<string, string>();
  for (const t of agentTypes) {
    if (t.icon_source === 'upload' && t.has_upload) {
      cache.set(t.key, agentTypeIconUrl(projectId, t.id));
    } else if (t.icon_builtin_key && DEFAULT_AGENT_ICONS[t.icon_builtin_key]) {
      cache.set(t.key, DEFAULT_AGENT_ICONS[t.icon_builtin_key]);
    } else {
      cache.set(t.key, DEFAULT_AGENT_ICONS.custom);
    }
  }
  return (key: string) => cache.get(key) || DEFAULT_AGENT_ICONS.custom;
}

function toDiagramNodes(
  agents: (AgentWithDevice & { x: number; y: number })[],
  resolver: IconResolver,
  locked: boolean,
): Node[] {
  return agents.map(a => ({
    id: `agent-${a.id}`,
    type: 'agent',
    position: { x: a.x, y: a.y },
    data: {
      label: a.name,
      agentType: a.agent_type,
      iconUrl: resolver(a.agent_type),
      deviceName: a.device_name,
      status: a.status,
      hideHandles: locked,
    },
    draggable: !locked,
    selectable: true,
  }));
}

function toImageNodes(
  projectId: number,
  images: AgentDiagramImage[],
  locked: boolean,
): Node[] {
  return images.map(img => ({
    id: `agent-image-${img.id}`,
    type: 'agentDiagramImage',
    position: { x: img.x, y: img.y },
    style: { width: img.width, height: img.height },
    data: {
      imageUrl: agentDiagramImageUrl(projectId, img.id),
      label: img.label,
      labelPlacementV: img.label_placement_v,
      labelPlacementH: img.label_placement_h,
      connectable: !locked,
    },
    draggable: !locked,
    selectable: true,
  }));
}

function endpointId(agentId: number | null, imageId: number | null): string | null {
  if (agentId) return `agent-${agentId}`;
  if (imageId) return `agent-image-${imageId}`;
  return null;
}

function parseEndpoint(nodeId: string): { agentId?: number; imageId?: number } | null {
  if (nodeId.startsWith('agent-image-')) {
    const id = parseInt(nodeId.replace('agent-image-', ''));
    return Number.isFinite(id) ? { imageId: id } : null;
  }
  if (nodeId.startsWith('agent-')) {
    const id = parseInt(nodeId.replace('agent-', ''));
    return Number.isFinite(id) ? { agentId: id } : null;
  }
  return null;
}

function toDiagramEdges(connections: AgentConnection[]): Edge[] {
  return connections.flatMap(c => {
    const source = endpointId(c.source_agent_id, c.source_image_id);
    const target = endpointId(c.target_agent_id, c.target_image_id);
    if (!source || !target) return [];
    const style: React.CSSProperties = {};
    if (c.edge_color) style.stroke = c.edge_color;
    if (c.edge_width) style.strokeWidth = c.edge_width;
    // Dash pattern encoded in connection_type suffix like "link:dashed"
    const parts = (c.connection_type || 'link').split(':');
    const dashKey = parts[1] || 'solid';
    if (EDGE_DASH_PATTERNS[dashKey]) style.strokeDasharray = EDGE_DASH_PATTERNS[dashKey];
    return [{
      id: `agent-conn-${c.id}`,
      source,
      target,
      sourceHandle: c.source_handle || undefined,
      targetHandle: c.target_handle || undefined,
      label: c.label || undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: c.edge_color || undefined },
      style,
      data: { connectionId: c.id, connectionType: parts[0] || 'link', dashKey },
      labelStyle: c.label_color ? { fill: c.label_color, fontWeight: 500 } : undefined,
      labelBgStyle: c.label_bg_color ? { fill: c.label_bg_color } : undefined,
    } as Edge];
  });
}

type ContextMenuState =
  | { x: number; y: number; kind: 'node'; agentId: number }
  | { x: number; y: number; kind: 'edge'; edgeId: string; connectionId: number }
  | { x: number; y: number; kind: 'image'; imageId: number }
  | null;

export default function AgentNetworkDiagram() {
  const { projectId, project } = useProject();
  const projectBase = `/p/${project.slug}`;
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    showGrid, setShowGrid,
    showMinimap, setShowMinimap,
    showLegend, setShowLegend,
    selectMode, setSelectMode,
  } = useAgentMapPrefs(project.slug);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [locked, setLocked] = useState(true);
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { takeSnapshot, undo, redo, pushRedo, canUndo, canRedo } = useUndoRedo();
  // Forces the toolbar to re-evaluate canUndo/canRedo (refs don't trigger renders).
  const [, bumpHistory] = useState(0);
  const bump = useCallback(() => bumpHistory(v => v + 1), []);

  const { data, isLoading } = useQuery<AgentDiagramData>({
    queryKey: ['agent-diagram', projectId],
    queryFn: () => fetchAgentDiagram(projectId),
  });

  const iconResolver = useMemo(
    () => buildIconResolver(projectId, data?.agent_types ?? []),
    [projectId, data?.agent_types],
  );

  // Sync server data -> local React Flow state.
  // When a search query is set, filter out non-matching agent nodes (image nodes
  // always remain visible). Edges referencing any filtered endpoint are dropped.
  useEffect(() => {
    if (!data) return;
    const q = searchQuery.trim().toLowerCase();
    const agentNodes = toDiagramNodes(data.agents, iconResolver, locked).filter(n => {
      if (!q) return true;
      const d = n.data as { label?: string; agentType?: string; deviceName?: string };
      return (d.label || '').toLowerCase().includes(q)
        || (d.agentType || '').toLowerCase().includes(q)
        || (d.deviceName || '').toLowerCase().includes(q);
    });
    const imageNodes = toImageNodes(projectId, data.images, locked);
    const allNodes = [...agentNodes, ...imageNodes];
    const nodeIds = new Set(allNodes.map(n => n.id));
    setNodes(allNodes);
    setEdges(toDiagramEdges(data.connections).filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)));
  }, [data, iconResolver, locked, projectId, searchQuery]);

  // Debounced position save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPositions = useRef<Map<number, { x: number; y: number }>>(new Map());

  const flushPositions = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = Array.from(pendingPositions.current.entries()).map(([id, p]) => ({ id, x: p.x, y: p.y }));
    pendingPositions.current.clear();
    if (pending.length === 0) return;
    updateAgentPositions(projectId, pending).catch(() => {
      toast('Failed to save agent positions', 'error');
    });
  }, [projectId, toast]);

  useEffect(() => () => flushPositions(), [flushPositions]);

  const handleLegendUpdate = useCallback(async (items: LegendItem[]) => {
    try {
      await updateAgentDiagramLegendItems(projectId, items);
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to update legend', 'error');
    }
  }, [projectId, queryClient, toast]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(ns => {
      const hasDragStart = changes.some(c => c.type === 'position' && 'dragging' in c && c.dragging);
      if (hasDragStart) { takeSnapshot(ns, edges); bump(); }
      const updated = applyNodeChanges(changes, ns);
      const dragEnded = changes.some(c => c.type === 'position' && c.dragging === false);
      const resizeEnded = changes.some(c => c.type === 'dimensions' && 'resizing' in c && c.resizing === false);
      for (const c of changes) {
        if (c.type === 'position' && c.position && c.id.startsWith('agent-') && !c.id.startsWith('agent-image-')) {
          const id = parseInt(c.id.replace('agent-', ''));
          pendingPositions.current.set(id, { x: c.position.x, y: c.position.y });
        }
      }
      if (dragEnded) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flushPositions, 500);
      }
      if (dragEnded || resizeEnded) {
        // Persist any image node whose position/size changed in this batch.
        const touchedImageIds = new Set<number>();
        for (const c of changes) {
          if ((c.type === 'position' || c.type === 'dimensions') && 'id' in c && c.id.startsWith('agent-image-')) {
            touchedImageIds.add(parseInt(c.id.replace('agent-image-', '')));
          }
        }
        for (const imageId of touchedImageIds) {
          const node = updated.find(n => n.id === `agent-image-${imageId}`) as Node | undefined;
          if (!node) continue;
          const styleW = (node.style as React.CSSProperties | undefined)?.width;
          const styleH = (node.style as React.CSSProperties | undefined)?.height;
          const width = parseFloat(String(node.width ?? styleW ?? node.measured?.width ?? 0)) || undefined;
          const height = parseFloat(String(node.height ?? styleH ?? node.measured?.height ?? 0)) || undefined;
          updateAgentDiagramImage(projectId, imageId, {
            x: node.position.x,
            y: node.position.y,
            width,
            height,
          }).catch(() => toast('Failed to save image position', 'error'));
        }
      }
      return updated;
    });
  }, [flushPositions, projectId, toast, takeSnapshot, edges, bump]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(es => applyEdgeChanges(changes, es));
  }, []);

  const onConnect = useCallback(async (conn: RFConnection) => {
    if (!conn.source || !conn.target) return;
    takeSnapshot(nodes, edges); bump();
    const src = parseEndpoint(conn.source);
    const tgt = parseEndpoint(conn.target);
    if (!src || !tgt) return;
    try {
      const created = await createAgentConnection(projectId, {
        source_agent_id: src.agentId ?? null,
        target_agent_id: tgt.agentId ?? null,
        source_image_id: src.imageId ?? null,
        target_image_id: tgt.imageId ?? null,
        source_handle: conn.sourceHandle ?? null,
        target_handle: conn.targetHandle ?? null,
      });
      // Optimistic local add; next refetch will canonicalize
      setEdges(es => addEdge({
        id: `agent-conn-${created.id}`,
        source: conn.source!,
        target: conn.target!,
        sourceHandle: conn.sourceHandle ?? undefined,
        targetHandle: conn.targetHandle ?? undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { connectionId: created.id, connectionType: 'link', dashKey: 'solid' },
      }, es));
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to create connection', 'error');
    }
  }, [projectId, queryClient, toast, takeSnapshot, nodes, edges, bump]);

  const edgeReconnectSuccessful = useRef(true);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
    setIsConnecting(true);
    takeSnapshot(nodes, edges); bump();
  }, [takeSnapshot, nodes, edges, bump]);

  const onReconnect = useCallback(async (oldEdge: Edge, newConnection: RFConnection) => {
    edgeReconnectSuccessful.current = true;
    if (!newConnection.source || !newConnection.target) return;
    const src = parseEndpoint(newConnection.source);
    const tgt = parseEndpoint(newConnection.target);
    if (!src || !tgt) return;
    const connectionId = (oldEdge.data as { connectionId?: number } | undefined)?.connectionId;
    if (!connectionId) return;
    setEdges(eds => reconnectEdge(oldEdge, newConnection, eds));
    try {
      await updateAgentConnection(projectId, connectionId, {
        source_agent_id: src.agentId ?? null,
        target_agent_id: tgt.agentId ?? null,
        source_image_id: src.imageId ?? null,
        target_image_id: tgt.imageId ?? null,
        source_handle: newConnection.sourceHandle ?? null,
        target_handle: newConnection.targetHandle ?? null,
      });
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to update connection', 'error');
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    }
  }, [projectId, queryClient, toast]);

  const onReconnectEnd = useCallback(async (_e: MouseEvent | TouchEvent, edge: Edge) => {
    setIsConnecting(false);
    if (edgeReconnectSuccessful.current) return;
    const connectionId = (edge.data as { connectionId?: number } | undefined)?.connectionId;
    if (!connectionId) return;
    try {
      await deleteAgentConnection(projectId, connectionId);
      setEdges(es => es.filter(e => e.id !== edge.id));
      if (selectedEdgeId === edge.id) setSelectedEdgeId(null);
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to delete connection', 'error');
    }
  }, [projectId, queryClient, toast, selectedEdgeId]);

  const handleAddAgent = useCallback(async (agentId: number) => {
    takeSnapshot(nodes, edges); bump();
    // Drop roughly in the visible middle of the canvas; user can drag from there.
    const x = 100 + Math.random() * 200;
    const y = 100 + Math.random() * 200;
    try {
      await addAgentToDiagram(projectId, agentId, x, y);
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to add agent', 'error');
    }
  }, [projectId, queryClient, toast, takeSnapshot, nodes, edges, bump]);

  const handlePlaceLibraryImage = useCallback(async (payload: { filename: string; mime_type: string; data: string }) => {
    takeSnapshot(nodes, edges); bump();
    const center = rfInstanceRef.current
      ? rfInstanceRef.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 0, y: 0 };
    try {
      await createAgentDiagramImage(projectId, {
        x: center.x, y: center.y, width: 200, height: 150,
        filename: payload.filename, mime_type: payload.mime_type, data: payload.data,
      });
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
      setImageLibraryOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to place image', 'error');
    }
  }, [projectId, queryClient, toast, takeSnapshot, nodes, edges, bump]);

  const handleDeleteImage = useCallback(async (imageId: number) => {
    takeSnapshot(nodes, edges); bump();
    try {
      await deleteAgentDiagramImage(projectId, imageId);
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to delete image', 'error');
    }
  }, [projectId, queryClient, toast, takeSnapshot, nodes, edges, bump]);

  const handleRemoveAgent = useCallback(async (agentId: number) => {
    takeSnapshot(nodes, edges); bump();
    try {
      await removeAgentFromDiagram(projectId, agentId);
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to remove agent', 'error');
    }
  }, [projectId, queryClient, toast, takeSnapshot, nodes, edges, bump]);

  const handleDeleteEdge = useCallback(async (connectionId: number) => {
    takeSnapshot(nodes, edges); bump();
    try {
      await deleteAgentConnection(projectId, connectionId);
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
      setSelectedEdgeId(null);
    } catch {
      toast('Failed to delete connection', 'error');
    }
  }, [projectId, queryClient, toast, takeSnapshot, nodes, edges, bump]);

  const persistAgentPositions = useCallback((snapNodes: Node[]) => {
    const pending = snapNodes
      .filter(n => n.id.startsWith('agent-') && !n.id.startsWith('agent-image-'))
      .map(n => ({ id: parseInt(n.id.replace('agent-', '')), x: n.position.x, y: n.position.y }));
    if (pending.length === 0) return;
    updateAgentPositions(projectId, pending).catch(() => toast('Failed to save positions', 'error'));
  }, [projectId, toast]);

  const handleUndo = useCallback(() => {
    const snap = undo();
    if (!snap) return;
    pushRedo(nodes, edges);
    setNodes(snap.nodes);
    setEdges(snap.edges);
    persistAgentPositions(snap.nodes);
    bump();
  }, [undo, pushRedo, nodes, edges, persistAgentPositions, bump]);

  const handleRedo = useCallback(() => {
    const snap = redo();
    if (!snap) return;
    takeSnapshot(nodes, edges);
    setNodes(snap.nodes);
    setEdges(snap.edges);
    persistAgentPositions(snap.nodes);
    bump();
  }, [redo, takeSnapshot, nodes, edges, persistAgentPositions, bump]);

  const handleExportPng = useCallback(async () => {
    try {
      const container = containerRef.current;
      if (!container) return;
      const dataUrl = await toPng(container, {
        backgroundColor: 'var(--color-surface)',
        pixelRatio: 2,
        filter: (node: Element) => !node.classList?.contains('react-flow__controls'),
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'agent-map.png';
      a.click();
    } catch { toast('Failed to export PNG', 'error'); }
  }, [toast]);

  const handleExportSvg = useCallback(async () => {
    try {
      const container = containerRef.current;
      if (!container) return;
      const svgData = await toSvg(container, {
        filter: (node: Element) => !node.classList?.contains('react-flow__controls'),
      });
      const a = document.createElement('a');
      a.href = svgData;
      a.download = 'agent-map.svg';
      a.click();
    } catch { toast('Failed to export SVG', 'error'); }
  }, [toast]);

  const handleExportDrawio = useCallback(async () => {
    if (!data) return;
    try {
      const xml = await toAgentMapDrawioXml(data, projectId);
      triggerDrawioDownload(xml, 'agent-map.drawio');
    } catch { toast('Failed to export draw.io', 'error'); }
  }, [data, projectId, toast]);

  // Keyboard: delete selected edge with Delete/Backspace
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      );
      if (inEditable) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId && !locked) {
        const edge = edges.find(ed => ed.id === selectedEdgeId);
        const cid = edge?.data?.connectionId as number | undefined;
        if (cid) handleDeleteEdge(cid);
      }
      if (e.key === 'Escape') {
        setContextMenu(null);
        setSelectedEdgeId(null);
        setSelectedAgentId(null);
        setSelectedImageId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEdgeId, locked, edges, handleDeleteEdge, handleUndo, handleRedo]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    if (node.id.startsWith('agent-image-')) {
      const imageId = parseInt(node.id.replace('agent-image-', ''));
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'image', imageId });
      return;
    }
    if (!node.id.startsWith('agent-')) return;
    const agentId = parseInt(node.id.replace('agent-', ''));
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'node', agentId });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    const cid = edge.data?.connectionId as number | undefined;
    if (!cid) return;
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'edge', edgeId: edge.id, connectionId: cid });
  }, []);

  const onEdgeClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedAgentId(null);
    setSelectedImageId(null);
  }, []);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.id.startsWith('agent-image-')) {
      const imageId = parseInt(node.id.replace('agent-image-', ''));
      setSelectedImageId(imageId);
      setSelectedAgentId(null);
      setSelectedEdgeId(null);
      return;
    }
    if (!node.id.startsWith('agent-')) return;
    const id = parseInt(node.id.replace('agent-', ''));
    setSelectedAgentId(id);
    setSelectedEdgeId(null);
    setSelectedImageId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedEdgeId(null);
    setSelectedAgentId(null);
    setSelectedImageId(null);
  }, []);

  // Agents available to add (not already on the map)
  const availableAgents = useMemo(() => {
    if (!data) return [] as AgentWithDevice[];
    const onMap = new Set(data.agents.map(a => a.id));
    return data.all_agents.filter(a => !onMap.has(a.id));
  }, [data]);

  const selectedEdge = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) : undefined;
  const selectedConn: AgentConnection | undefined = selectedEdge && data
    ? data.connections.find(c => c.id === (selectedEdge.data?.connectionId as number | undefined))
    : undefined;

  const selectedAgent: AgentWithDevice | undefined = selectedAgentId != null && data
    ? data.agents.find(a => a.id === selectedAgentId) ?? data.all_agents.find(a => a.id === selectedAgentId)
    : undefined;

  const selectedImage: AgentDiagramImage | undefined = selectedImageId != null && data
    ? data.images.find(i => i.id === selectedImageId)
    : undefined;

  const handleImageUpdate = useCallback(async (imageId: number, patch: AgentImagePatch) => {
    const nodeDataPatch: Record<string, unknown> = {};
    const imagePatch: Record<string, unknown> = {};
    if (patch.label !== undefined) {
      nodeDataPatch.label = patch.label || null;
      imagePatch.label = patch.label || null;
    }
    if (patch.label_placement_v !== undefined) {
      nodeDataPatch.labelPlacementV = patch.label_placement_v;
      imagePatch.label_placement_v = patch.label_placement_v;
    }
    if (patch.label_placement_h !== undefined) {
      nodeDataPatch.labelPlacementH = patch.label_placement_h;
      imagePatch.label_placement_h = patch.label_placement_h;
    }
    setNodes(ns => ns.map(n => n.id === `agent-image-${imageId}`
      ? { ...n, data: { ...n.data, ...nodeDataPatch } }
      : n,
    ));
    queryClient.setQueryData(['agent-diagram', projectId], (old: AgentDiagramData | undefined) => {
      if (!old) return old;
      return {
        ...old,
        images: old.images.map(img => img.id === imageId ? { ...img, ...imagePatch } : img),
      };
    });
    try {
      await updateAgentDiagramImage(projectId, imageId, patch);
    } catch {
      toast('Failed to update image caption', 'error');
    }
  }, [projectId, queryClient, toast]);

  const applyEdgeUpdate = useCallback(async (updates: AgentEdgePatch) => {
    if (!selectedConn) return;
    const payload: Record<string, unknown> = {};
    if (updates.dashKey !== undefined) {
      const base = (selectedConn.connection_type || 'link').split(':')[0] || 'link';
      payload.connection_type = updates.dashKey === 'solid' ? base : `${base}:${updates.dashKey}`;
    }
    if (updates.label !== undefined) payload.label = updates.label;
    if (updates.edge_color !== undefined) payload.edge_color = updates.edge_color;
    if (updates.edge_width !== undefined) payload.edge_width = updates.edge_width;
    if (updates.label_color !== undefined) payload.label_color = updates.label_color;
    if (updates.label_bg_color !== undefined) payload.label_bg_color = updates.label_bg_color;
    if (updates.source_port !== undefined) payload.source_port = updates.source_port;
    if (updates.target_port !== undefined) payload.target_port = updates.target_port;
    try {
      await updateAgentConnection(projectId, selectedConn.id, payload);
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
    } catch {
      toast('Failed to update connection', 'error');
    }
  }, [projectId, selectedConn, queryClient, toast]);

  const handleAgentStatusChange = useCallback(async (agentId: number, status: AgentStatus) => {
    const existing = data?.agents.find(a => a.id === agentId) ?? data?.all_agents.find(a => a.id === agentId);
    if (!existing) { toast('Agent not found', 'error'); return; }
    try {
      // Server PUT is a full-replace, so send all editable fields with status overridden.
      await updateAgent(projectId, agentId, {
        name: existing.name,
        agent_type: existing.agent_type,
        device_id: existing.device_id ?? null,
        checkin_schedule: existing.checkin_schedule ?? '',
        config: existing.config ?? '',
        disk_path: existing.disk_path ?? '',
        version: existing.version ?? '',
        notes: existing.notes ?? '',
        status,
      });
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) });
    } catch {
      toast('Failed to update agent status', 'error');
    }
  }, [projectId, data, queryClient, toast]);

  const panelSelected: AgentSelected | undefined = selectedConn && data
    ? (() => {
        const resolveName = (agentId: number | null, imageId: number | null): string => {
          if (agentId) {
            return data.agents.find(a => a.id === agentId)?.name ?? `Agent #${agentId}`;
          }
          if (imageId) {
            const img = data.images.find(i => i.id === imageId);
            return img?.label || img?.filename || `Image #${imageId}`;
          }
          return '?';
        };
        return {
          type: 'edge',
          data: {
            connection: selectedConn,
            sourceName: resolveName(selectedConn.source_agent_id, selectedConn.source_image_id),
            targetName: resolveName(selectedConn.target_agent_id, selectedConn.target_image_id),
          },
        };
      })()
    : selectedAgent
    ? { type: 'agent', agent: selectedAgent }
    : selectedImage
    ? {
        type: 'image',
        imageId: selectedImage.id,
        label: selectedImage.label,
        labelPlacementV: selectedImage.label_placement_v,
        labelPlacementH: selectedImage.label_placement_h,
      }
    : undefined;

  if (isLoading && !data) {
    return <div className="diagram-loading">Loading agent map…</div>;
  }

  return (
    <div className="agent-map-wrap">
      <AgentMapToolbar
        projectSlug={project.slug}
        locked={locked}
        setLocked={setLocked}
        availableAgents={availableAgents}
        onAddAgent={handleAddAgent}
        onOpenImageLibrary={() => setImageLibraryOpen(true)}
        onFitView={() => rfInstanceRef.current?.fitView({ duration: 300 })}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onExportDrawio={handleExportDrawio}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo()}
        canRedo={canRedo()}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        showMinimap={showMinimap}
        setShowMinimap={setShowMinimap}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        selectMode={selectMode}
        setSelectMode={setSelectMode}
      />

      <div className="agent-map-canvas-card card card-flush">
      <div
        className="agent-map-canvas"
        ref={containerRef}
        data-connecting={isConnecting ? 'true' : undefined}
        data-locked={locked ? 'true' : undefined}
      >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        elementsSelectable
        selectionOnDrag={!locked && selectMode}
        panOnDrag={locked ? [0, 1] : selectMode ? [1] : [0, 1]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={() => setIsConnecting(true)}
        onConnectEnd={() => setIsConnecting(false)}
        onReconnectStart={locked ? undefined : onReconnectStart}
        onReconnect={locked ? undefined : onReconnect}
        onReconnectEnd={locked ? undefined : onReconnectEnd}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        onInit={inst => { rfInstanceRef.current = inst; }}
      >
        {showGrid && <Background variant={BackgroundVariant.Dots} gap={16} size={1} />}
        <Controls showInteractive={false} />
        {showMinimap && <MiniMap pannable zoomable />}
      </ReactFlow>
      {showLegend && (
        <DiagramLegend items={data?.legend_items ?? []} onUpdate={handleLegendUpdate} />
      )}

      {contextMenu && createPortal(
        <div
          className="context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
          onClick={() => setContextMenu(null)}
        >
          <div className="context-menu-items">
            {contextMenu.kind === 'node' && (
              <button
                className="context-menu-item"
                onClick={() => handleRemoveAgent(contextMenu.agentId)}
                disabled={locked}
              >
                Remove from map
              </button>
            )}
            {contextMenu.kind === 'edge' && (
              <button
                className="context-menu-item"
                onClick={() => handleDeleteEdge(contextMenu.connectionId)}
                disabled={locked}
              >
                Delete connection
              </button>
            )}
            {contextMenu.kind === 'image' && (
              <button
                className="context-menu-item"
                onClick={() => handleDeleteImage(contextMenu.imageId)}
                disabled={locked}
              >
                Delete image
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}

      <ImageLibraryModal
        projectId={projectId}
        open={imageLibraryOpen}
        onClose={() => setImageLibraryOpen(false)}
        onPlaceImage={handlePlaceLibraryImage}
      />

      {panelSelected && (
        <AgentPropertiesPanel
          selected={panelSelected}
          onClose={() => { setSelectedEdgeId(null); setSelectedAgentId(null); setSelectedImageId(null); }}
          projectBase={projectBase}
          locked={locked}
          onEdgeUpdate={applyEdgeUpdate}
          onDeleteEdge={handleDeleteEdge}
          onAgentStatusChange={handleAgentStatusChange}
          onImageUpdate={handleImageUpdate}
        />
      )}
      </div>
      </div>
    </div>
  );
}
