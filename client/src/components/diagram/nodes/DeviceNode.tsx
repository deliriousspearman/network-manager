import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Server, Monitor, Router, Network, HardDrive, Shield, Wifi, Cpu, Camera, Smartphone } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

type IconComponent = React.ComponentType<LucideProps>;

const DEVICE_ICONS: Record<string, IconComponent> = {
  server:       Server,
  workstation:  Monitor,
  router:       Router,
  switch:       Network,
  nas:          HardDrive,
  firewall:     Shield,
  access_point: Wifi,
  iot:          Cpu,
  camera:       Camera,
  phone:        Smartphone,
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

export default function DeviceNode({ data }: NodeProps) {
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
    favourite?: boolean;
    hideHandles?: boolean;
    hasCredentials?: boolean;
    showCredentials?: boolean;
  };
  const vmClass = d.hostingType === 'vm' ? ' node-vm' : '';
  const IconComponent = DEVICE_ICONS[d.deviceType];

  const style: React.CSSProperties = {};
  if (d.borderColor) style.borderColor = d.borderColor;
  if (d.bgColor) style.backgroundColor = d.bgColor;
  const labelStyle: React.CSSProperties = d.labelColor ? { color: d.labelColor } : {};

  return (
    <div className={`device-node ${CLASS_MAP[d.deviceType] || ''}${vmClass}${d.hideHandles ? ' hide-handles' : ''}`} style={style}>
      {d.favourite && <div className="node-favourite">⭐</div>}
      {!!d.hasCredentials && d.showCredentials !== false && <div className="node-credentials">🔑</div>}
      <div className="node-icon">
        {d.customIcon
          ? d.customIcon
          : IconComponent
            ? <IconComponent size={22} />
            : <span>?</span>
        }
      </div>
      <div className="node-label" style={labelStyle}>{d.label}</div>
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
