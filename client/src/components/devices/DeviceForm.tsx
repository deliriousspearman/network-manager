import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GripVertical } from 'lucide-react';
import { fetchDevice, createDevice, updateDevice, fetchHypervisors } from '../../api/devices';
import { fetchSubnets } from '../../api/subnets';
import { useProject } from '../../contexts/ProjectContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import type { DeviceType, HostingType } from 'shared/types';
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

export default function DeviceForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;

  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('server');
  const [macAddress, setMacAddress] = useState('');
  const [os, setOs] = useState('');
  const [hostname, setHostname] = useState('');
  const [domain, setDomain] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [av, setAv] = useState('');
  const [status, setStatus] = useState('');
  const [subnetId, setSubnetId] = useState<number | null>(null);
  const [hostingType, setHostingType] = useState<HostingType | null>(null);
  const [hypervisorId, setHypervisorId] = useState<number | null>(null);
  const [ips, setIps] = useState<IpEntry[]>([{ ip_address: '', label: '', is_primary: true, dhcp: false }]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [sectionConfig, setSectionConfig] = useState<SectionConfig>({
    overview: true,
    credentials: true,
    command_outputs: false,
    router_config: false,
    gallery: false,
    attachments: false,
    ports: false,
    notes: false,
    order: DEFAULT_SECTION_ORDER,
  });

  useUnsavedChanges(isDirty);

  const { data: subnets } = useQuery({ queryKey: ['subnets', projectId], queryFn: () => fetchSubnets(projectId) });
  const { data: hypervisors } = useQuery({ queryKey: ['hypervisors', projectId], queryFn: () => fetchHypervisors(projectId) });
  const { data: device } = useQuery({
    queryKey: ['device', projectId, Number(id)],
    queryFn: () => fetchDevice(projectId, Number(id)),
    enabled: isEdit,
  });

  useEffect(() => {
    if (device) {
      setName(device.name);
      setType(device.type);
      setMacAddress(device.mac_address || '');
      setOs(device.os || '');
      setHostname(device.hostname || '');
      setDomain(device.domain || '');
      setLocation(device.location || '');
      setNotes(device.notes || '');
      setAv(device.av || '');
      setStatus(device.status || '');
      setSubnetId(device.subnet_id);
      setHostingType(device.hosting_type);
      setHypervisorId(device.hypervisor_id);
      if (device.ips?.length) {
        setIps(device.ips.map(ip => ({
          ip_address: ip.ip_address,
          label: ip.label || '',
          is_primary: !!ip.is_primary,
          dhcp: !!ip.dhcp,
        })));
      }
      if (device.tags?.length) {
        setTags(device.tags);
      }
      if (device.section_config) {
        try {
          const cfg = JSON.parse(device.section_config);
          setSectionConfig({
            overview: cfg.overview !== false,
            credentials: cfg.credentials !== false,
            command_outputs: cfg.command_outputs === true,
            router_config: cfg.router_config === true,
            gallery: cfg.gallery === true,
            attachments: cfg.attachments === true,
            ports: cfg.ports === true,
            notes: cfg.notes === true,
            order: (() => {
              const stored: string[] = cfg.order?.length ? cfg.order : DEFAULT_SECTION_ORDER;
              return [...DEFAULT_SECTION_ORDER.filter(k => !stored.includes(k)), ...stored];
            })(),
          });
        } catch { /* keep defaults */ }
      }
    }
  }, [device]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? updateDevice(projectId, Number(id), data) : createDevice(projectId, data),
    onSuccess: (result) => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['devices', projectId] });
      queryClient.invalidateQueries({ queryKey: ['device', projectId, result.id] });
      navigate(`${base}/devices/${result.id}`);
    },
  });

  const addIp = () => setIps([...ips, { ip_address: '', label: '', is_primary: false, dhcp: false }]);
  const removeIp = (idx: number) => setIps(ips.filter((_, i) => i !== idx));
  const updateIp = (idx: number, field: keyof IpEntry, value: string | boolean) => {
    const updated = [...ips];
    if (field === 'is_primary' && value === true) {
      updated.forEach(ip => ip.is_primary = false);
    }
    Object.assign(updated[idx], { [field]: value });
    setIps(updated);
  };

  const addTag = (value: string) => {
    const trimmed = value.trim().replace(/,+$/, '').trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput('');
  };

  const dragKey = useRef<string | null>(null);
  const [sectionDragOver, setSectionDragOver] = useState<string | null>(null);

  const handleDragStart = (key: string) => { dragKey.current = key; };
  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    setSectionDragOver(key);
  };
  const handleDrop = (targetKey: string) => {
    const srcKey = dragKey.current;
    dragKey.current = null;
    setSectionDragOver(null);
    if (!srcKey || srcKey === targetKey) return;
    setSectionConfig(prev => {
      const newOrder = [...prev.order];
      const srcIdx = newOrder.indexOf(srcKey);
      const tgtIdx = newOrder.indexOf(targetKey);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      newOrder.splice(srcIdx, 1);
      newOrder.splice(tgtIdx, 0, srcKey);
      return { ...prev, order: newOrder };
    });
  };
  const handleDragEnd = () => { dragKey.current = null; setSectionDragOver(null); };

  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    const filledIps = ips.filter(ip => ip.ip_address.trim());
    const invalidIp = filledIps.find(ip => !isValidIp(ip.ip_address.trim()));
    if (invalidIp) {
      setValidationError(`Invalid IP address: ${invalidIp.ip_address}`);
      return;
    }
    mutation.mutate({
      name, type,
      mac_address: macAddress || undefined,
      os: os || undefined,
      hostname: hostname || undefined,
      domain: domain || undefined,
      location: location || undefined,
      notes: notes || undefined,
      subnet_id: subnetId,
      hosting_type: type === 'server' ? hostingType : null,
      hypervisor_id: type === 'server' && hostingType === 'vm' ? hypervisorId : null,
      ips: ips.filter(ip => ip.ip_address),
      tags,
      av: av || undefined,
      status: status || undefined,
      section_config: JSON.stringify(sectionConfig),
      updated_at: isEdit ? device?.updated_at : undefined,
    });
  };

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Device' : 'New Device'}</h2>
      </div>

      <form className="card" onSubmit={handleSubmit} onChange={() => setIsDirty(true)}>
        <div className="form-row">
          <div className="form-group">
            <label>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Type *</label>
            <select value={type} onChange={e => setType(e.target.value as DeviceType)}>
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
            <input value={macAddress} onChange={e => setMacAddress(e.target.value)} placeholder="00:11:22:33:44:55" />
          </div>
          <div className="form-group">
            <label>OS</label>
            <input value={os} onChange={e => setOs(e.target.value)} placeholder="Ubuntu 22.04" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Hostname</label>
            <input value={hostname} onChange={e => setHostname(e.target.value)} placeholder="web-server-01" />
          </div>
          <div className="form-group">
            <label>Domain</label>
            <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Rack A, DC1" />
          </div>
          <div className="form-group">
            <label>Subnet</label>
            <select value={subnetId ?? ''} onChange={e => setSubnetId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">None</option>
              {subnets?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>AV Software</label>
            <input value={av} onChange={e => setAv(e.target.value)} placeholder="e.g. CrowdStrike Falcon" />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Not set</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="warning">Warning</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        {type === 'server' && (
          <div className="form-row">
            <div className="form-group">
              <label>Hosting Type</label>
              <select
                value={hostingType ?? ''}
                onChange={e => {
                  const val = e.target.value as HostingType | '';
                  setHostingType(val || null);
                  if (val !== 'vm') setHypervisorId(null);
                }}
              >
                <option value="">Not specified</option>
                <option value="baremetal">Baremetal</option>
                <option value="vm">Virtual Machine</option>
                <option value="hypervisor">Hypervisor</option>
              </select>
            </div>
            {hostingType === 'vm' && (
              <div className="form-group">
                <label>Hypervisor</label>
                <select value={hypervisorId ?? ''} onChange={e => setHypervisorId(e.target.value ? Number(e.target.value) : null)}>
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
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>

        <div className="form-group">
          <label>IP Addresses</label>
          {ips.map((ip, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
              <input
                value={ip.ip_address}
                onChange={e => updateIp(idx, 'ip_address', e.target.value)}
                placeholder="192.168.1.1"
                style={{ flex: 1, width: 'auto', maxWidth: 160 }}
              />
              <input
                value={ip.label}
                onChange={e => updateIp(idx, 'label', e.target.value)}
                placeholder="Label (eth0)"
                style={{ flex: 1, width: 'auto', maxWidth: 120 }}
              />
              <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="radio"
                  checked={ip.is_primary}
                  onChange={() => updateIp(idx, 'is_primary', true)}
                />
                Primary
              </label>
              <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="checkbox"
                  checked={ip.dhcp}
                  onChange={e => updateIp(idx, 'dhcp', e.target.checked)}
                />
                DHCP
              </label>
              {ips.length > 1 && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeIp(idx)}>x</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addIp} style={{ marginTop: '0.3rem' }}>
            + Add IP
          </button>
        </div>

        <div className="form-group">
          <label>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.4rem' }}>
            {tags.map(tag => (
              <span key={tag} className="tag-pill">
                {tag}
                <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} aria-label="Remove tag">×</button>
              </span>
            ))}
          </div>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
              if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1));
            }}
            onBlur={() => tagInput && addTag(tagInput)}
            placeholder="Type a tag and press Enter"
            style={{ maxWidth: 280 }}
          />
        </div>

        <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.75rem 1rem', marginTop: '0.5rem' }}>
          <legend style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.4rem' }}>Sections</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {sectionConfig.order.map((key) => {
              if (key === 'router_config' && type !== 'router') return null;
              const checked = sectionConfig[key as keyof SectionConfig] as boolean;
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
                      onChange={e => setSectionConfig(prev => ({ ...prev, [key]: e.target.checked }))}
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
