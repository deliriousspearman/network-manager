import type { Node } from '@xyflow/react';
import type { DiagramData, NodePrefs } from 'shared/types';
import { deviceIconOverrideUrl, typeDefaultIconUrl, diagramImageUrl } from '../../../api/diagramIcons';
import { agentTypeIconUrl } from '../../../api/agentTypes';
import { DEFAULT_AGENT_ICONS } from '../../../assets/agent-icons';
import { libraryIconUrl } from '../../../iconLibraries/manifest';

export type AllNodePrefs = Record<string, NodePrefs>;

interface IconRef {
  icon_source?: 'upload' | 'library';
  library_id?: string | null;
  library_icon_key?: string | null;
  color?: string | null;
}

function resolveLibraryUrl(ref: IconRef | undefined): string | null {
  if (!ref || ref.icon_source !== 'library') return null;
  if (!ref.library_id || !ref.library_icon_key) return null;
  return libraryIconUrl(ref.library_id, ref.library_icon_key);
}

export function toDiagramNodes(
  data: DiagramData,
  prefs: AllNodePrefs,
  hideHandles: boolean,
  showCredentials: boolean,
  showAv: boolean,
  showAgents: boolean,
  projectId: number,
  annotationCallbacks?: { onTextChange: (id: number, text: string) => void; onDelete: (id: number) => void },
  imageCallbacks?: { onDelete: (id: number) => void },
): Node[] {
  const overrideByDevice = new Map<number, IconRef>();
  for (const r of (data.device_icon_overrides || []) as Array<IconRef & { device_id: number }>) {
    overrideByDevice.set(r.device_id, r);
  }
  const typeDefaultByType = new Map<string, IconRef>();
  for (const r of (data.type_default_icons || []) as Array<IconRef & { device_type: string }>) {
    typeDefaultByType.set(r.device_type, r);
  }
  const resolveOverrideUrl = (deviceId: number): string | null => {
    const ref = overrideByDevice.get(deviceId);
    if (!ref) return null;
    const lib = resolveLibraryUrl(ref);
    return lib ?? deviceIconOverrideUrl(projectId, deviceId);
  };
  const resolveTypeDefaultUrl = (deviceType: string): string | null => {
    const ref = typeDefaultByType.get(deviceType);
    if (!ref) return null;
    const lib = resolveLibraryUrl(ref);
    return lib ?? typeDefaultIconUrl(projectId, deviceType);
  };
  // Color cascade: per-device override color wins over type-default color.
  // Color is applied to whichever icon is being rendered (override / type default / built-in).
  const resolveIconColor = (deviceId: number, deviceType: string, hostingType: string | null): string | null => {
    const o = overrideByDevice.get(deviceId);
    if (o?.color) return o.color;
    if (hostingType === 'hypervisor' && typeDefaultByType.get('hypervisor')?.color) {
      return typeDefaultByType.get('hypervisor')!.color!;
    }
    return typeDefaultByType.get(deviceType)?.color ?? null;
  };
  const agentIconResolver = new Map<string, string>();
  for (const t of data.agent_types || []) {
    if (t.icon_source === 'upload' && t.has_upload) {
      agentIconResolver.set(t.key, agentTypeIconUrl(projectId, t.id));
    } else {
      const builtin = t.icon_builtin_key && DEFAULT_AGENT_ICONS[t.icon_builtin_key];
      agentIconResolver.set(t.key, builtin || DEFAULT_AGENT_ICONS.custom);
    }
  }

  const subnetNodes: Node[] = data.subnets.map(s => {
    const p = prefs[`subnet-${s.id}`] || {};
    return {
      id: `subnet-${s.id}`,
      type: 'subnetGroup',
      position: { x: s.x, y: s.y },
      style: { width: s.width, height: s.height },
      data: {
        label: s.name,
        subnetId: s.id,
        cidr: s.cidr,
        vlanId: s.vlan_id,
        description: s.description,
        borderColor: p.borderColor || null,
        bgColor: p.bgColor || null,
        labelColor: p.labelColor || null,
        favourite: p.favourite || false,
        borderStyle: p.borderStyle || null,
        borderRadius: p.borderRadius || null,
        borderWidth: p.borderWidth || null,
      },
    };
  });

  const deviceNodes: Node[] = data.devices.map(d => {
    const p = prefs[`device-${d.id}`] || {};
    return {
      id: `device-${d.id}`,
      type: d.type,
      position: { x: d.x, y: d.y },
      data: {
        label: d.name,
        ip: d.primary_ip || '',
        deviceType: d.type,
        os: d.os,
        hostingType: d.hosting_type,
        deviceId: d.id,
        macAddress: d.mac_address,
        location: d.location,
        notes: d.notes,
        ips: d.ips,
        primaryIpOnly: p.primaryIpOnly ?? false,
        borderColor: p.borderColor || null,
        bgColor: p.bgColor || null,
        labelColor: p.labelColor || null,
        customIcon: p.icon || null,
        iconOverrideUrl: resolveOverrideUrl(d.id),
        typeDefaultIconUrl: (d.hosting_type === 'hypervisor' && typeDefaultByType.has('hypervisor'))
          ? resolveTypeDefaultUrl('hypervisor')
          : resolveTypeDefaultUrl(d.type),
        iconColor: resolveIconColor(d.id, d.type, d.hosting_type),
        favourite: p.favourite || false,
        hideHandles,
        hasCredentials: d.has_credentials,
        anyCredentialUsed: d.any_credential_used,
        showCredentials,
        status: d.status,
        av: d.av,
        showAv,
        agents: (d.agents || []).map(a => ({
          id: a.id,
          name: a.name,
          agentType: a.agent_type,
          iconUrl: agentIconResolver.get(a.agent_type) || DEFAULT_AGENT_ICONS.custom,
        })),
        showAgents,
      },
      ...(d.subnet_id ? { parentId: `subnet-${d.subnet_id}`, extent: 'parent' as const } : {}),
    };
  });

  const annotationNodes: Node[] = (data.annotations || []).map(a => ({
    id: `annotation-${a.id}`,
    type: 'annotation',
    position: { x: a.x, y: a.y },
    data: {
      text: a.text,
      fontSize: a.font_size,
      color: a.color,
      onTextChange: (text: string) => annotationCallbacks?.onTextChange(a.id, text),
      onDelete: () => annotationCallbacks?.onDelete(a.id),
    },
    dragHandle: '.annotation-node',
  }));

  const imageNodes: Node[] = (data.diagram_images || []).map(img => ({
    id: `image-${img.id}`,
    type: 'diagramImage',
    position: { x: img.x, y: img.y },
    style: { width: img.width, height: img.height },
    data: {
      imageUrl: diagramImageUrl(projectId, img.id),
      label: img.label,
      onDelete: () => imageCallbacks?.onDelete(img.id),
    },
    dragHandle: '.image-node',
  }));

  return [...subnetNodes, ...deviceNodes, ...annotationNodes, ...imageNodes];
}
