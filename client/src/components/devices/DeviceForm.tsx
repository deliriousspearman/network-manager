import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDevice, createDevice, updateDevice, fetchHypervisors } from '../../api/devices';
import { fetchSubnets } from '../../api/subnets';
import { useProject } from '../../contexts/ProjectContext';
import type { DeviceType, HostingType } from 'shared/types';

interface IpEntry {
  ip_address: string;
  label: string;
  is_primary: boolean;
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
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [subnetId, setSubnetId] = useState<number | null>(null);
  const [hostingType, setHostingType] = useState<HostingType | null>(null);
  const [hypervisorId, setHypervisorId] = useState<number | null>(null);
  const [ips, setIps] = useState<IpEntry[]>([{ ip_address: '', label: '', is_primary: true }]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

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
      setLocation(device.location || '');
      setNotes(device.notes || '');
      setSubnetId(device.subnet_id);
      setHostingType(device.hosting_type);
      setHypervisorId(device.hypervisor_id);
      if (device.ips?.length) {
        setIps(device.ips.map(ip => ({
          ip_address: ip.ip_address,
          label: ip.label || '',
          is_primary: !!ip.is_primary,
        })));
      }
      if (device.tags?.length) {
        setTags(device.tags);
      }
    }
  }, [device]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? updateDevice(projectId, Number(id), data) : createDevice(projectId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['devices', projectId] });
      navigate(`${base}/devices/${result.id}`);
    },
  });

  const addIp = () => setIps([...ips, { ip_address: '', label: '', is_primary: false }]);
  const removeIp = (idx: number) => setIps(ips.filter((_, i) => i !== idx));
  const updateIp = (idx: number, field: keyof IpEntry, value: string | boolean) => {
    const updated = [...ips];
    if (field === 'is_primary' && value === true) {
      updated.forEach(ip => ip.is_primary = false);
    }
    (updated[idx] as any)[field] = value;
    setIps(updated);
  };

  const addTag = (value: string) => {
    const trimmed = value.trim().replace(/,+$/, '').trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name, type,
      mac_address: macAddress || undefined,
      os: os || undefined,
      location: location || undefined,
      notes: notes || undefined,
      subnet_id: subnetId,
      hosting_type: type === 'server' ? hostingType : null,
      hypervisor_id: type === 'server' && hostingType === 'vm' ? hypervisorId : null,
      ips: ips.filter(ip => ip.ip_address),
      tags,
    });
  };

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Device' : 'New Device'}</h2>
      </div>

      <form className="card" onSubmit={handleSubmit}>
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
              <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <input
                  type="radio"
                  checked={ip.is_primary}
                  onChange={() => updateIp(idx, 'is_primary', true)}
                  style={{ width: 'auto' }}
                /> Primary
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
