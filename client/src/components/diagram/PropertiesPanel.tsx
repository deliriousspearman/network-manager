import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Star } from 'lucide-react';
import type { NodePrefs } from 'shared/types';
import { ColourPicker } from '../ui/ColourPicker';
import { usePopupClose } from '../../hooks/usePopupClose';

export interface SelectedElement {
  type: 'device' | 'subnet' | 'edge';
  id: string;
  data: any;
}

interface Props {
  selected: SelectedElement;
  onClose: () => void;
  nodePrefs: NodePrefs;
  onPrefChange: (key: keyof NodePrefs, value: any) => void;
  onConnectionUpdate?: (connId: number, data: { label?: string | null; connection_type?: string; edge_type?: string; edge_color?: string | null; edge_width?: number | null; label_color?: string | null; label_bg_color?: string | null; source_handle?: string | null; target_handle?: string | null; source_port?: string | null; target_port?: string | null }) => void;
  projectBase?: string;
  locked?: boolean;
}


const BORDER_STYLE_OPTIONS = [
  { value: 'dashed', label: 'Dashed' },
  { value: 'solid', label: 'Solid' },
  { value: 'dotted', label: 'Dotted' },
];

const BORDER_RADIUS_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'small', label: 'Slightly Rounded' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' },
];

const BORDER_WIDTH_OPTIONS = [
  { value: 'thin', label: 'Thin' },
  { value: 'normal', label: 'Normal' },
  { value: 'thick', label: 'Thick' },
];

const DEVICE_ICONS = [
  '🖥', '💻', '🔀', '🔌', '🌐', '🔒', '📦', '☁️',
  '🖨', '📡', '💾', '🔧', '🏠', '🔑', '⚡', '🎯',
];

function IconPicker({
  value, onChange, disabled = false,
}: { value?: string; onChange: (icon: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePopupClose(open, ref, () => setOpen(false));
  return (
    <div className="appearance-picker-row" ref={ref}>
      <span className="props-label">Icon</span>
      <button className="appearance-trigger" onClick={() => setOpen(o => !o)} disabled={disabled} title="Change icon">
        {value ? <span>{value}</span> : <span className="appearance-trigger-none">—</span>}
      </button>
      {open && (
        <div className="appearance-popup">
          {DEVICE_ICONS.map(icon => (
            <button
              key={icon}
              className={`appearance-icon-option${value === icon ? ' active' : ''}`}
              onClick={() => { onChange(value === icon ? null : icon); setOpen(false); }}
              disabled={disabled}
              title={icon}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionPicker({
  label, value, options, defaultValue, onChange, disabled = false,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  defaultValue: string;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="appearance-picker-row">
      <span className="props-label">{label}</span>
      <select
        value={value || defaultValue}
        onChange={e => {
          const val = e.target.value;
          onChange(val === defaultValue ? null : val);
        }}
        disabled={disabled}
        style={{ fontSize: '0.82rem', maxWidth: '120px' }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function AppearanceSection({
  nodeId: _nodeId, nodePrefs, onPrefChange, isDevice, disabled = false,
}: {
  nodeId: string;
  nodePrefs: NodePrefs;
  onPrefChange: (key: keyof NodePrefs, value: any) => void;
  isDevice: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="props-section">
      <div className="props-label props-section-title">Appearance</div>
      {isDevice && (
        <IconPicker value={nodePrefs.icon} onChange={v => onPrefChange('icon', v)} disabled={disabled} />
      )}
      <ColourPicker
        label="Border Colour"
        value={nodePrefs.borderColor}
        onChange={v => onPrefChange('borderColor', v)}
        disabled={disabled}
      />
      <ColourPicker
        label="Background"
        value={nodePrefs.bgColor}
        onChange={v => onPrefChange('bgColor', v)}
        disabled={disabled}
      />
      <ColourPicker
        label="Label Colour"
        value={nodePrefs.labelColor}
        onChange={v => onPrefChange('labelColor', v)}
        disabled={disabled}
      />
      {!isDevice && (
        <>
          <OptionPicker
            label="Border Style"
            value={nodePrefs.borderStyle}
            options={BORDER_STYLE_OPTIONS}
            defaultValue="dashed"
            onChange={v => onPrefChange('borderStyle', v)}
            disabled={disabled}
          />
          <OptionPicker
            label="Corner Style"
            value={nodePrefs.borderRadius}
            options={BORDER_RADIUS_OPTIONS}
            defaultValue="rounded"
            onChange={v => onPrefChange('borderRadius', v)}
            disabled={disabled}
          />
          <OptionPicker
            label="Border Width"
            value={nodePrefs.borderWidth}
            options={BORDER_WIDTH_OPTIONS}
            defaultValue="normal"
            onChange={v => onPrefChange('borderWidth', v)}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}

function DeviceProperties({ data, nodePrefs, onPrefChange, projectBase, disabled = false }: { data: any; nodePrefs: NodePrefs; onPrefChange: (key: keyof NodePrefs, value: any) => void; projectBase?: string; disabled?: boolean }) {
  return (
    <>
      <div className="props-section">
        <span className={`badge badge-${data.deviceType}`}>{data.deviceType}</span>
        {data.hostingType && (
          <span className={`badge badge-hosting-${data.hostingType}`} style={{ marginLeft: '0.4rem' }}>
            {data.hostingType}
          </span>
        )}
      </div>

      {data.ips?.length > 0 && (
        <div className="props-section">
          <div className="props-label">IP Addresses</div>
          <ul className="ip-list">
            {data.ips.map((ip: any, i: number) => (
              <li key={i} className={ip.is_primary ? 'ip-primary' : ''}>
                {ip.ip_address}
                {ip.label && <span className="props-muted"> ({ip.label})</span>}
                {ip.is_primary ? <span className="props-muted"> (primary)</span> : null}
                {ip.dhcp ? <span className="badge badge-dhcp" title="Address assigned by DHCP — may change">DHCP</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.os && (
        <div className="props-section">
          <div className="props-label">OS</div>
          <div>{data.os}</div>
        </div>
      )}

      {data.location && (
        <div className="props-section">
          <div className="props-label">Location</div>
          <div>{data.location}</div>
        </div>
      )}

      {data.macAddress && (
        <div className="props-section">
          <div className="props-label">MAC Address</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{data.macAddress}</div>
        </div>
      )}

      {data.notes && (
        <div className="props-section">
          <div className="props-label">Notes</div>
          <div className="props-notes">{data.notes}</div>
        </div>
      )}

      <AppearanceSection nodeId={data.deviceId} nodePrefs={nodePrefs} onPrefChange={onPrefChange} isDevice={true} disabled={disabled} />

      <div className="props-section">
        <Link to={`${projectBase || ''}/devices/${data.deviceId}`} className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', fontSize: '1rem', lineHeight: 1.1 }}>
          View Full Details
        </Link>
      </div>
    </>
  );
}

function SubnetProperties({ data, nodePrefs, onPrefChange, projectBase, disabled = false }: { data: any; nodePrefs: NodePrefs; onPrefChange: (key: keyof NodePrefs, value: any) => void; projectBase?: string; disabled?: boolean }) {
  return (
    <>
      <div className="props-section">
        <div className="props-label">CIDR</div>
        <div style={{ fontFamily: 'monospace' }}>{data.cidr}</div>
      </div>

      {data.vlanId != null && (
        <div className="props-section">
          <div className="props-label">VLAN ID</div>
          <div>{data.vlanId}</div>
        </div>
      )}

      {data.description && (
        <div className="props-section">
          <div className="props-label">Description</div>
          <div>{data.description}</div>
        </div>
      )}

      <AppearanceSection nodeId={data.id} nodePrefs={nodePrefs} onPrefChange={onPrefChange} isDevice={false} disabled={disabled} />

      {data.subnetId != null && (
        <div className="props-section">
          <Link to={`${projectBase || ''}/subnets/${data.subnetId}`} className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', fontSize: '1rem', lineHeight: 1.1 }}>
            View Full Details
          </Link>
        </div>
      )}
    </>
  );
}

const LINE_STYLE_TYPES: { value: string; label: string }[] = [
  { value: 'solid',    label: 'Solid' },
  { value: 'dashed',   label: 'Dashed' },
  { value: 'dotted',   label: 'Dotted' },
  { value: 'thick',    label: 'Thick' },
  { value: 'animated', label: 'Animated' },
];

const EDGE_LINE_TYPES: { value: string; label: string }[] = [
  { value: 'default',    label: 'Curved (Bezier)' },
  { value: 'straight',   label: 'Straight' },
  { value: 'step',       label: 'Step' },
  { value: 'smoothstep', label: 'Smooth Step' },
];

const EDGE_WIDTH_OPTIONS = [
  { value: '1', label: 'Hairline' },
  { value: '2', label: 'Normal' },
  { value: '3', label: 'Medium' },
  { value: '4', label: 'Thick' },
  { value: '6', label: 'Heavy' },
];

function EdgeProperties({ data, onConnectionUpdate, disabled = false }: { data: any; onConnectionUpdate?: Props['onConnectionUpdate']; disabled?: boolean }) {
  const [label, setLabel] = useState(data.label || '');
  const [sourcePort, setSourcePort] = useState(data.sourcePort || '');
  const [targetPort, setTargetPort] = useState(data.targetPort || '');
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTypeChange = (newType: string) => {
    if (data.connId && onConnectionUpdate) {
      onConnectionUpdate(data.connId, { connection_type: newType });
    }
  };

  const handleEdgeTypeChange = (newEdgeType: string) => {
    if (data.connId && onConnectionUpdate) {
      onConnectionUpdate(data.connId, { edge_type: newEdgeType });
    }
  };

  const handlePortChange = (field: 'source_port' | 'target_port', value: string) => {
    if (field === 'source_port') setSourcePort(value);
    else setTargetPort(value);
    if (portTimer.current) clearTimeout(portTimer.current);
    portTimer.current = setTimeout(() => {
      if (data.connId && onConnectionUpdate) {
        onConnectionUpdate(data.connId, { [field]: value || null });
      }
    }, 500);
  };

  const handleLabelChange = (value: string) => {
    setLabel(value);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => {
      if (data.connId && onConnectionUpdate) {
        onConnectionUpdate(data.connId, { label: value || null });
      }
    }, 500);
  };

  return (
    <>
      <div className="props-section">
        <div className="props-label">Source</div>
        <div>{data.sourceName}</div>
      </div>

      <div className="props-section">
        <div className="props-label">Target</div>
        <div>{data.targetName}</div>
      </div>

      <div className="props-section">
        <div className="props-label">Source Port</div>
        <input
          type="text"
          value={sourcePort}
          onChange={e => handlePortChange('source_port', e.target.value)}
          placeholder="e.g. eth0, ge-0/0/1"
          readOnly={disabled}
        />
      </div>

      <div className="props-section">
        <div className="props-label">Target Port</div>
        <input
          type="text"
          value={targetPort}
          onChange={e => handlePortChange('target_port', e.target.value)}
          placeholder="e.g. eth1, ge-0/0/2"
          readOnly={disabled}
        />
      </div>

      <div className="props-section">
        <div className="props-label">Line Style</div>
        <select
          value={data.connectionType || 'solid'}
          onChange={e => handleTypeChange(e.target.value)}
          disabled={disabled}
        >
          {LINE_STYLE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="props-section">
        <div className="props-label">Line Shape</div>
        <select
          value={data.edgeType || 'default'}
          onChange={e => handleEdgeTypeChange(e.target.value)}
          disabled={disabled}
        >
          {EDGE_LINE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <ColourPicker
        label="Line Colour"
        value={data.edgeColor || undefined}
        onChange={v => { if (data.connId && onConnectionUpdate) onConnectionUpdate(data.connId, { edge_color: v }); }}
        disabled={disabled}
      />

      <OptionPicker
        label="Line Width"
        value={String(data.edgeWidth ?? 2)}
        options={EDGE_WIDTH_OPTIONS}
        defaultValue="2"
        onChange={v => { if (data.connId && onConnectionUpdate) onConnectionUpdate(data.connId, { edge_width: v ? parseInt(v) : null }); }}
        disabled={disabled}
      />

      <div className="props-section">
        <div className="props-label">Label</div>
        <input
          type="text"
          value={label}
          onChange={e => handleLabelChange(e.target.value)}
          placeholder="Optional label..."
          readOnly={disabled}
        />
      </div>

      <ColourPicker
        label="Label Text Colour"
        value={data.labelColor || undefined}
        onChange={v => { if (data.connId && onConnectionUpdate) onConnectionUpdate(data.connId, { label_color: v }); }}
        disabled={disabled}
      />

      <ColourPicker
        label="Label Background"
        value={data.labelBgColor || undefined}
        onChange={v => { if (data.connId && onConnectionUpdate) onConnectionUpdate(data.connId, { label_bg_color: v }); }}
        disabled={disabled}
      />

      {data.createdAt && (
        <div className="props-section">
          <div className="props-label">Created</div>
          <div>{new Date(data.createdAt).toLocaleDateString()}</div>
        </div>
      )}
    </>
  );
}

export default function PropertiesPanel({ selected, onClose, nodePrefs, onPrefChange, onConnectionUpdate, projectBase, locked = false }: Props) {
  const title = selected.type === 'device'
    ? selected.data.label
    : selected.type === 'subnet'
    ? selected.data.label
    : 'Connection';

  const isFavourite = nodePrefs.favourite || false;
  const showFavourite = selected.type !== 'edge';

  return (
    <div className="properties-panel">
      <div className="properties-panel-header">
        <h3>{title}</h3>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          {showFavourite && (
            <button
              className={`properties-panel-icon-btn${isFavourite ? ' favourite-active' : ''}`}
              onClick={() => onPrefChange('favourite', !isFavourite)}
              disabled={locked}
              title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Star size={16} fill={isFavourite ? 'currentColor' : 'none'} />
            </button>
          )}
          <button className="properties-panel-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="properties-panel-body">
        {selected.type === 'device' && (
          <DeviceProperties
            data={selected.data}
            nodePrefs={nodePrefs}
            onPrefChange={onPrefChange}
            projectBase={projectBase}
            disabled={locked}
          />
        )}
        {selected.type === 'subnet' && (
          <SubnetProperties data={selected.data} nodePrefs={nodePrefs} onPrefChange={onPrefChange} projectBase={projectBase} disabled={locked} />
        )}
        {selected.type === 'edge' && <EdgeProperties data={selected.data} onConnectionUpdate={onConnectionUpdate} disabled={locked} />}
      </div>
    </div>
  );
}
