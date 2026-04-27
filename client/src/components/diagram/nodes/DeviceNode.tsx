import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { truncateLabel } from './truncateLabel';
import { FavouriteStar } from './FavouriteStar';
import { CredentialKey } from './CredentialKey';
import IconRenderer from '../../ui/IconRenderer';

import iotIcon from '../../../assets/device-icons/iot.svg?url';
import { libraryIconUrl } from '../../../iconLibraries/manifest';

// Default icon per device type. Most types map to the bundled "Networking
// (legacy)" drawio library at /icon-libraries/network2018/*.svg. iot has no
// clean network2018 match so it keeps the bundled SVG.
const DEFAULT_DEVICE_ICONS: Record<string, string> = {
  server:       libraryIconUrl('network2018', 'server'),
  workstation:  libraryIconUrl('network2018', 'pc'),
  router:       libraryIconUrl('network2018', 'router'),
  switch:       libraryIconUrl('network2018', 'switch'),
  nas:          libraryIconUrl('network2018', 'storage'),
  firewall:     libraryIconUrl('network2018', 'firewall'),
  access_point: libraryIconUrl('network2018', 'wireless_modem'),
  camera:       libraryIconUrl('network2018', 'camera'),
  phone:        libraryIconUrl('network2018', 'mobile'),
  iot:          iotIcon,
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
    ips?: { ip_address: string; label?: string | null; is_primary?: number | boolean; dhcp?: number | boolean }[];
    primaryIpOnly?: boolean;
    deviceType: string;
    os?: string;
    hostingType?: string;
    borderColor?: string | null;
    bgColor?: string | null;
    labelColor?: string | null;
    customIcon?: string | null;
    iconOverrideUrl?: string | null;
    typeDefaultIconUrl?: string | null;
    iconColor?: string | null;
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
  const defaultIcon = d.hostingType === 'hypervisor'
    ? libraryIconUrl('network2018', 'mainframe')
    : DEFAULT_DEVICE_ICONS[d.deviceType];
  const iconSrc = d.iconOverrideUrl || d.typeDefaultIconUrl || defaultIcon;

  const style: React.CSSProperties = {};
  if (d.borderColor) style.borderColor = d.borderColor;
  if (d.bgColor) style.backgroundColor = d.bgColor;
  const labelStyle: React.CSSProperties = d.labelColor ? { color: d.labelColor } : {};

  // IPs to render. Default: all IPs (primary first), each on its own line.
  // primaryIpOnly: just d.ip (the server-resolved primary). When the device
  // has no IPs at all, show the "No IP" placeholder.
  const ipsToShow: string[] = (() => {
    if (d.primaryIpOnly) return d.ip ? [d.ip] : [];
    if (d.ips && d.ips.length > 0) {
      const sorted = [...d.ips].sort((a, b) => Number(b.is_primary ?? 0) - Number(a.is_primary ?? 0));
      return sorted.map(ip => ip.ip_address);
    }
    return d.ip ? [d.ip] : [];
  })();

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
          : <IconRenderer src={iconSrc} color={d.iconColor ?? null} size={64} alt={d.deviceType} />
        }
      </div>
      <div className="node-label" style={labelStyle} title={d.label}>{truncateLabel(d.label)}</div>
      {ipsToShow.length === 0 ? (
        <div className="node-ip" style={labelStyle}>No IP</div>
      ) : ipsToShow.length === 1 ? (
        <div className="node-ip" style={labelStyle}>{ipsToShow[0]}</div>
      ) : (
        <div className="node-ips" style={labelStyle}>
          {ipsToShow.map((ip, i) => (
            <div key={i} className="node-ip">{ip}</div>
          ))}
        </div>
      )}
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
