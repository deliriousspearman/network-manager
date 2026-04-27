import { useState, useEffect, useReducer, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GripVertical } from 'lucide-react';
import { fetchDevice, createDevice, updateDevice, fetchHypervisors } from '../../api/devices';
import { fetchSubnets } from '../../api/subnets';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { onCmdEnterSubmit } from '../../hooks/useCmdEnterSubmit';
import type { DeviceType, HostingType, DeviceWithIps } from 'shared/types';
import { isValidIp } from '../../utils/validation';
import { formErrorMessage } from '../../utils/formError';

const DEFAULT_SECTION_ORDER = ['overview', 'credentials', 'ports', 'notes', 'gallery', 'attachments', 'command_outputs', 'router_config'];

const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  credentials: 'Credentials',
  ports: 'Ports',
  notes: 'Notes',
  gallery: 'Image Gallery',
  attachments: 'Attachments',
  command_outputs: 'Command Outputs',
  router_config: 'Router Config',
};

interface IpEntry {
  ip_address: string;
  label: string;
  is_primary: boolean;
  dhcp: boolean;
}

interface SectionConfig {
  overview: boolean;
  credentials: boolean;
  command_outputs: boolean;
  router_config: boolean;
  gallery: boolean;
  attachments: boolean;
  ports: boolean;
  notes: boolean;
  order: string[];
}

interface FormState {
  name: string;
  type: DeviceType;
  macAddress: string;
  os: string;
  hostname: string;
  domain: string;
  location: string;
  notes: string;
  av: string;
  status: string;
  subnetId: number | null;
  hostingType: HostingType | null;
  hypervisorId: number | null;
  ips: IpEntry[];
  tags: string[];
  sectionConfig: SectionConfig;
}

type Action =
  | { type: 'set'; patch: Partial<FormState> }
  | { type: 'load'; device: DeviceWithIps }
  | { type: 'addIp' }
  | { type: 'removeIp'; idx: number }
  | { type: 'updateIp'; idx: number; field: keyof IpEntry; value: string | boolean }
  | { type: 'addTag'; value: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'popTag' }
  | { type: 'toggleSection'; key: keyof SectionConfig; value: boolean }
  | { type: 'reorderSections'; src: string; target: string };

const initialState: FormState = {
  name: '',
  type: 'server',
  macAddress: '',
  os: '',
  hostname: '',
  domain: '',
  location: '',
  notes: '',
  av: '',
  status: '',
  subnetId: null,
  hostingType: null,
  hypervisorId: null,
  ips: [{ ip_address: '', label: '', is_primary: true, dhcp: false }],
  tags: [],
  sectionConfig: {
    overview: true,
    credentials: true,
    command_outputs: false,
    router_config: false,
    gallery: false,
    attachments: false,
    ports: false,
    notes: false,
    order: DEFAULT_SECTION_ORDER,
  },
};

function parseSectionConfig(raw: string | null): SectionConfig {
  if (!raw) return initialState.sectionConfig;
  try {
    const cfg = JSON.parse(raw);
    const stored: string[] = cfg.order?.length ? cfg.order : DEFAULT_SECTION_ORDER;
    return {
      overview: cfg.overview !== false,
      credentials: cfg.credentials !== false,
      command_outputs: cfg.command_outputs === true,
      router_config: cfg.router_config === true,
      gallery: cfg.gallery === true,
      attachments: cfg.attachments === true,
      ports: cfg.ports === true,
      notes: cfg.notes === true,
      order: [...DEFAULT_SECTION_ORDER.filter(k => !stored.includes(k)), ...stored],
    };
  } catch {
    return initialState.sectionConfig;
  }
}

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case 'set':
      return { ...state, ...action.patch };
    case 'load': {
      const d = action.device;
      return {
        ...state,
        name: d.name,
        type: d.type,
        macAddress: d.mac_address || '',
        os: d.os || '',
        hostname: d.hostname || '',
        domain: d.domain || '',
        location: d.location || '',
        notes: d.notes || '',
        av: d.av || '',
        status: d.status || '',
        subnetId: d.subnet_id,
        hostingType: d.hosting_type,
        hypervisorId: d.hypervisor_id,
        ips: d.ips?.length
          ? d.ips.map(ip => ({
              ip_address: ip.ip_address,
              label: ip.label || '',
              is_primary: !!ip.is_primary,
              dhcp: !!ip.dhcp,
            }))
          : state.ips,
        tags: d.tags?.length ? d.tags : state.tags,
        sectionConfig: parseSectionConfig(d.section_config),
      };
    }
    case 'addIp':
      return { ...state, ips: [...state.ips, { ip_address: '', label: '', is_primary: false, dhcp: false }] };
    case 'removeIp':
      return { ...state, ips: state.ips.filter((_, i) => i !== action.idx) };
    case 'updateIp': {
      const ips = state.ips.map((ip, i) => {
        if (i !== action.idx) {
          // Clear is_primary on other rows when we're promoting this row.
          return action.field === 'is_primary' && action.value === true ? { ...ip, is_primary: false } : ip;
        }
        return { ...ip, [action.field]: action.value };
      });
      return { ...state, ips };
    }
    case 'addTag': {
      const trimmed = action.value.trim().replace(/,+$/, '').trim();
      if (!trimmed || state.tags.includes(trimmed)) return state;
      return { ...state, tags: [...state.tags, trimmed] };
    }
    case 'removeTag':
      return { ...state, tags: state.tags.filter(t => t !== action.tag) };
    case 'popTag':
      return state.tags.length === 0 ? state : { ...state, tags: state.tags.slice(0, -1) };
    case 'toggleSection':
      return { ...state, sectionConfig: { ...state.sectionConfig, [action.key]: action.value } };
    case 'reorderSections': {
      const order = [...state.sectionConfig.order];
      const srcIdx = order.indexOf(action.src);
      const tgtIdx = order.indexOf(action.target);
      if (srcIdx === -1 || tgtIdx === -1) return state;
      order.splice(srcIdx, 1);
      order.splice(tgtIdx, 0, action.src);
      return { ...state, sectionConfig: { ...state.sectionConfig, order } };
    }
  }
}

export default function DeviceForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;

  const [form, dispatch] = useReducer(reducer, initialState);
  const [tagInput, setTagInput] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [sectionDragOver, setSectionDragOver] = useState<string | null>(null);
  const [validationError, setValidationError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; ips?: Set<number> }>({});

  useUnsavedChanges(isDirty);

  const { data: subnets } = useQuery({ queryKey: queryKeys.subnets.all(projectId), queryFn: () => fetchSubnets(projectId) });
  const { data: hypervisors } = useQuery({ queryKey: ['hypervisors', projectId], queryFn: () => fetchHypervisors(projectId) });
  const { data: device } = useQuery({
    queryKey: queryKeys.devices.detail(projectId, Number(id)),
    queryFn: () => fetchDevice(projectId, Number(id)),
    enabled: isEdit,
  });

  useEffect(() => {
    if (device) dispatch({ type: 'load', device });
  }, [device]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? updateDevice(projectId, Number(id), data) : createDevice(projectId, data),
    onSuccess: (result) => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.detail(projectId, result.id) });
      navigate(`${base}/devices/${result.id}`);
    },
  });

  const dragKey = useRef<string | null>(null);
  const handleDragStart = (key: string) => { dragKey.current = key; };
  const handleDragOver = (e: React.DragEvent, key: string) => { e.preventDefault(); setSectionDragOver(key); };
  const handleDrop = (targetKey: string) => {
    const srcKey = dragKey.current;
    dragKey.current = null;
    setSectionDragOver(null);
    if (!srcKey || srcKey === targetKey) return;
    dispatch({ type: 'reorderSections', src: srcKey, target: targetKey });
  };
  const handleDragEnd = () => { dragKey.current = null; setSectionDragOver(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    const errors: { name?: boolean; ips?: Set<number> } = {};
    if (!form.name.trim()) errors.name = true;
    const badIps = new Set<number>();
    form.ips.forEach((ip, idx) => {
      if (ip.ip_address.trim() && !isValidIp(ip.ip_address.trim())) badIps.add(idx);
    });
    if (badIps.size) errors.ips = badIps;
    setFieldErrors(errors);
    if (errors.name) {
      setValidationError('Please fix the highlighted fields before saving.');
      return;
    }
    if (errors.ips) {
      setValidationError('One or more IP addresses are invalid.');
      return;
    }
    mutation.mutate({
      name: form.name,
      type: form.type,
      mac_address: form.macAddress || undefined,
      os: form.os || undefined,
      hostname: form.hostname || undefined,
      domain: form.domain || undefined,
      location: form.location || undefined,
      notes: form.notes || undefined,
      subnet_id: form.subnetId,
      hosting_type: form.type === 'server' ? form.hostingType : null,
      hypervisor_id: form.type === 'server' && form.hostingType === 'vm' ? form.hypervisorId : null,
      ips: form.ips.filter(ip => ip.ip_address),
      tags: form.tags,
      av: form.av || undefined,
      status: form.status || undefined,
      section_config: JSON.stringify(form.sectionConfig),
      updated_at: isEdit ? device?.updated_at : undefined,
    });
  };

  const addTag = (value: string) => {
    dispatch({ type: 'addTag', value });
    setTagInput('');
  };

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Device' : 'New Device'}</h2>
      </div>

      <form className="card" onSubmit={handleSubmit} onKeyDown={onCmdEnterSubmit} onChange={() => setIsDirty(true)}>
        <div className="form-row">
          <div className="form-group">
            <label>Name *</label>
            <input
              className={fieldErrors.name ? 'field-error' : undefined}
              value={form.name}
              onChange={e => {
                dispatch({ type: 'set', patch: { name: e.target.value } });
                if (fieldErrors.name && e.target.value.trim()) {
                  setFieldErrors(prev => ({ ...prev, name: false }));
                }
              }}
              aria-invalid={fieldErrors.name || undefined}
              required
            />
            {fieldErrors.name && <div className="field-error-text">Name is required</div>}
          </div>
          <div className="form-group">
            <label>Type *</label>
            <select value={form.type} onChange={e => dispatch({ type: 'set', patch: { type: e.target.value as DeviceType } })}>
              <option value="server">Server</option>
              <option value="workstation">Workstation</option>
              <option value="router">Router</option>
              <option value="switch">Switch</option>
              <option value="nas">NAS</option>
              <option value="firewall">Firewall</option>
              <option value="access_point">Access Point</option>
              <option value="iot">IoT Device</option>
              <option value="camera">Camera</option>
              <option value="phone">Phone</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>MAC Address</label>
            <input value={form.macAddress} onChange={e => dispatch({ type: 'set', patch: { macAddress: e.target.value } })} placeholder="00:11:22:33:44:55" />
          </div>
          <div className="form-group">
            <label>OS</label>
            <input value={form.os} onChange={e => dispatch({ type: 'set', patch: { os: e.target.value } })} placeholder="Ubuntu 22.04" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Hostname</label>
            <input value={form.hostname} onChange={e => dispatch({ type: 'set', patch: { hostname: e.target.value } })} placeholder="web-server-01" />
          </div>
          <div className="form-group">
            <label>Domain</label>
            <input value={form.domain} onChange={e => dispatch({ type: 'set', patch: { domain: e.target.value } })} placeholder="example.com" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Location</label>
            <input value={form.location} onChange={e => dispatch({ type: 'set', patch: { location: e.target.value } })} placeholder="Rack A, DC1" />
          </div>
          <div className="form-group">
            <label>Subnet</label>
            <select value={form.subnetId ?? ''} onChange={e => dispatch({ type: 'set', patch: { subnetId: e.target.value ? Number(e.target.value) : null } })}>
              <option value="">None</option>
              {subnets?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>AV Software</label>
            <input value={form.av} onChange={e => dispatch({ type: 'set', patch: { av: e.target.value } })} placeholder="e.g. CrowdStrike Falcon" />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={e => dispatch({ type: 'set', patch: { status: e.target.value } })}>
              <option value="">Not set</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="warning">Warning</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        {form.type === 'server' && (
          <div className="form-row">
            <div className="form-group">
              <label>Hosting Type</label>
              <select
                value={form.hostingType ?? ''}
                onChange={e => {
                  const val = (e.target.value || null) as HostingType | null;
                  dispatch({ type: 'set', patch: { hostingType: val, hypervisorId: val === 'vm' ? form.hypervisorId : null } });
                }}
              >
                <option value="">Not specified</option>
                <option value="baremetal">Baremetal</option>
                <option value="vm">Virtual Machine</option>
                <option value="hypervisor">Hypervisor</option>
              </select>
            </div>
            {form.hostingType === 'vm' && (
              <div className="form-group">
                <label>Hypervisor</label>
                <select value={form.hypervisorId ?? ''} onChange={e => dispatch({ type: 'set', patch: { hypervisorId: e.target.value ? Number(e.target.value) : null } })}>
                  <option value="">None</option>
                  {hypervisors?.filter(h => h.id !== Number(id)).map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => dispatch({ type: 'set', patch: { notes: e.target.value } })} rows={3} />
        </div>

        <div className="form-group">
          <label>IP Addresses</label>
          {form.ips.map((ip, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
              <input
                className={fieldErrors.ips?.has(idx) ? 'field-error' : undefined}
                value={ip.ip_address}
                onChange={e => {
                  dispatch({ type: 'updateIp', idx, field: 'ip_address', value: e.target.value });
                  if (fieldErrors.ips?.has(idx)) {
                    setFieldErrors(prev => {
                      if (!prev.ips) return prev;
                      const next = new Set(prev.ips);
                      next.delete(idx);
                      return { ...prev, ips: next.size ? next : undefined };
                    });
                  }
                }}
                aria-invalid={fieldErrors.ips?.has(idx) || undefined}
                placeholder="192.168.1.1"
                style={{ flex: 1, width: 'auto', maxWidth: 160 }}
              />
              <input
                value={ip.label}
                onChange={e => dispatch({ type: 'updateIp', idx, field: 'label', value: e.target.value })}
                placeholder="Label (eth0)"
                style={{ flex: 1, width: 'auto', maxWidth: 120 }}
              />
              <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="radio"
                  checked={ip.is_primary}
                  onChange={() => dispatch({ type: 'updateIp', idx, field: 'is_primary', value: true })}
                />
                Primary
              </label>
              <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="checkbox"
                  checked={ip.dhcp}
                  onChange={e => dispatch({ type: 'updateIp', idx, field: 'dhcp', value: e.target.checked })}
                />
                DHCP
              </label>
              {form.ips.length > 1 && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => dispatch({ type: 'removeIp', idx })}>x</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: 'addIp' })} style={{ marginTop: '0.3rem' }}>
            + Add IP
          </button>
        </div>

        <div className="form-group">
          <label>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.4rem' }}>
            {form.tags.map(tag => (
              <span key={tag} className="tag-pill">
                {tag}
                <button type="button" onClick={() => dispatch({ type: 'removeTag', tag })} aria-label="Remove tag">×</button>
              </span>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
              if (e.key === 'Backspace' && !tagInput && form.tags.length) dispatch({ type: 'popTag' });
            }}
            onBlur={() => tagInput && addTag(tagInput)}
            placeholder="Type a tag and press Enter"
            style={{ maxWidth: 280 }}
          />
        </div>

        <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.75rem 1rem', marginTop: '0.5rem' }}>
          <legend style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.4rem' }}>Sections</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {form.sectionConfig.order.map((key) => {
              if (key === 'router_config' && form.type !== 'router') return null;
              const checked = form.sectionConfig[key as keyof SectionConfig] as boolean;
              return (
                <div
                  key={key}
                  className={`section-reorder-item${sectionDragOver === key ? ' section-reorder-item-dragover' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(key)}
                  onDragOver={e => handleDragOver(e, key)}
                  onDrop={() => handleDrop(key)}
                  onDragEnd={handleDragEnd}
                >
                  <GripVertical size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={checked}
                      onChange={e => dispatch({ type: 'toggleSection', key: key as keyof SectionConfig, value: e.target.checked })}
                    />
                    {SECTION_LABELS[key] ?? key}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        {(validationError || mutation.isError) && (
          <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {validationError || formErrorMessage(mutation.error)}
          </div>
        )}
        <div className="actions" style={{ marginTop: '1rem' }}>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Device')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
