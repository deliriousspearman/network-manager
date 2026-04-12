import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { truncateLabel } from './truncateLabel';
import { FavouriteStar } from './FavouriteStar';
import { CredentialKey } from './CredentialKey';

import serverIcon from '../../../assets/device-icons/server.svg?url';
import workstationIcon from '../../../assets/device-icons/workstation.svg?url';
import routerIcon from '../../../assets/device-icons/router.svg?url';
import switchIcon from '../../../assets/device-icons/switch.svg?url';
import nasIcon from '../../../assets/device-icons/nas.svg?url';
import firewallIcon from '../../../assets/device-icons/firewall.svg?url';
import accessPointIcon from '../../../assets/device-icons/access_point.svg?url';
import iotIcon from '../../../assets/device-icons/iot.svg?url';
import cameraIcon from '../../../assets/device-icons/camera.svg?url';
import phoneIcon from '../../../assets/device-icons/phone.svg?url';
import hypervisorIcon from '../../../assets/device-icons/hypervisor.svg?url';

const DEFAULT_DEVICE_ICONS: Record<string, string> = {
  server: serverIcon,
  workstation: workstationIcon,
  router: routerIcon,
  switch: switchIcon,
  nas: nasIcon,
  firewall: firewallIcon,
  access_point: accessPointIcon,
  iot: iotIcon,
  camera: cameraIcon,
  phone: phoneIcon,
};

const CLASS_MAP: Record<string, string> = {
  server: 'node-server',
  workstation: 'node-workstation',
  router: 'node-router',
  switch: 'node-switch',
  nas: 'node-nas',
  firewall: 'node-firewall',
  access_point: 'node-access_point',
  iot: 'node-iot',
  camera: 'node-camera',
  phone: 'node-phone',
};

const HOSTING_SHORT: Record<string, string> = {
  hypervisor: 'HV',
  vm: 'VM',
  baremetal: 'BM',
};

function DeviceNode({ data }: NodeProps) {
  const d = data as {
    label: string;
    ip: string;
    deviceType: string;
    os?: string;
    hostingType?: string;
    borderColor?: string | null;
    bgColor?: string | null;
    labelColor?: string | null;
    customIcon?: string | null;
    iconOverrideUrl?: string | null;
    typeDefaultIconUrl?: string | null;
    favourite?: boolean;
    hideHandles?: boolean;
    hasCredentials?: boolean;
    anyCredentialUsed?: boolean;
    showCredentials?: boolean;
    status?: string | null;
    av?: string | null;
    showAv?: boolean;
    agents?: { id: number; name: string; agentType: string; iconUrl: string }[];
    showAgents?: boolean;
  };
  const vmClass = d.hostingType === 'vm' ? ' node-vm' : '';
  const defaultIcon = d.hostingType === 'hypervisor' ? hypervisorIcon : DEFAULT_DEVICE_ICONS[d.deviceType];
  const iconSrc = d.iconOverrideUrl || d.typeDefaultIconUrl || defaultIcon;

  const style: React.CSSProperties = {};
  if (d.borderColor) style.borderColor = d.borderColor;
  if (d.bgColor) style.backgroundColor = d.bgColor;
  const labelStyle: React.CSSProperties = d.labelColor ? { color: d.labelColor } : {};

  return (
    <div className={`device-node ${CLASS_MAP[d.deviceType] || ''}${vmClass}${d.hideHandles ? ' hide-handles' : ''}`} style={style}>
      {d.favourite && <div className="node-favourite"><FavouriteStar size="2.5rem" /></div>}
      {!!d.hasCredentials && d.showCredentials !== false && (
        <div className="node-credentials" title={d.anyCredentialUsed ? 'Credentials (used)' : 'Credentials (unused)'}>
          <CredentialKey used={!!d.anyCredentialUsed} size="2rem" />
        </div>
      )}
      {!!d.av && d.showAv !== false && <div className="node-av" title={`AV: ${d.av}`}>🛡️</div>}
      {d.agents && d.agents.length > 0 && d.showAgents !== false && (
        <div className="node-agents">
          {d.agents.slice(0, 2).map(a => (
            <img
              key={a.id}
              src={a.iconUrl}
              alt={a.agentType}
              title={`${a.name} (${a.agentType})`}
              draggable={false}
            />
          ))}
        </div>
      )}
      {d.status && <div className={`node-status node-status-${d.status}`} title={`Status: ${d.status}`} aria-label={`Status: ${d.status}`} />}
      <div className="node-icon">
        {d.customIcon
          ? d.customIcon
          : <img src={iconSrc} alt={d.deviceType} width={64} height={64} style={{ objectFit: 'contain' }} draggable={false} />
        }
      </div>
      <div className="node-label" style={labelStyle} title={d.label}>{truncateLabel(d.label)}</div>
      <div className="node-ip" style={labelStyle}>{d.ip || 'No IP'}</div>
      {d.hostingType && <div className="node-hosting-tag">{HOSTING_SHORT[d.hostingType] || ''}</div>}
      {/* Top: left, center, right */}
      <Handle id="top-l-t" type="target" position={Position.Top} style={{ left: '25%' }} />
      <Handle id="top-l-s" type="source" position={Position.Top} style={{ left: '25%' }} />
      <Handle id="top-c-t" type="target" position={Position.Top} style={{ left: '50%' }} />
      <Handle id="top-c-s" type="source" position={Position.Top} style={{ left: '50%' }} />
      <Handle id="top-r-t" type="target" position={Position.Top} style={{ left: '75%' }} />
      <Handle id="top-r-s" type="source" position={Position.Top} style={{ left: '75%' }} />
      {/* Bottom: left, center, right */}
      <Handle id="bot-l-t" type="target" position={Position.Bottom} style={{ left: '25%' }} />
      <Handle id="bot-l-s" type="source" position={Position.Bottom} style={{ left: '25%' }} />
      <Handle id="bot-c-t" type="target" position={Position.Bottom} style={{ left: '50%' }} />
      <Handle id="bot-c-s" type="source" position={Position.Bottom} style={{ left: '50%' }} />
      <Handle id="bot-r-t" type="target" position={Position.Bottom} style={{ left: '75%' }} />
      <Handle id="bot-r-s" type="source" position={Position.Bottom} style={{ left: '75%' }} />
      {/* Left: top, center, bottom */}
      <Handle id="lft-t-t" type="target" position={Position.Left} style={{ top: '25%' }} />
      <Handle id="lft-t-s" type="source" position={Position.Left} style={{ top: '25%' }} />
      <Handle id="lft-c-t" type="target" position={Position.Left} style={{ top: '50%' }} />
      <Handle id="lft-c-s" type="source" position={Position.Left} style={{ top: '50%' }} />
      <Handle id="lft-b-t" type="target" position={Position.Left} style={{ top: '75%' }} />
      <Handle id="lft-b-s" type="source" position={Position.Left} style={{ top: '75%' }} />
      {/* Right: top, center, bottom */}
      <Handle id="rgt-t-t" type="target" position={Position.Right} style={{ top: '25%' }} />
      <Handle id="rgt-t-s" type="source" position={Position.Right} style={{ top: '25%' }} />
      <Handle id="rgt-c-t" type="target" position={Position.Right} style={{ top: '50%' }} />
      <Handle id="rgt-c-s" type="source" position={Position.Right} style={{ top: '50%' }} />
      <Handle id="rgt-b-t" type="target" position={Position.Right} style={{ top: '75%' }} />
      <Handle id="rgt-b-s" type="source" position={Position.Right} style={{ top: '75%' }} />
    </div>
  );
}

export default memo(DeviceNode);
