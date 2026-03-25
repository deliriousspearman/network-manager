import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { HostingType } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDevice, deleteDevice } from '../../api/devices';
import { fetchCredentialsByDevice } from '../../api/credentials';
import { useProject } from '../../contexts/ProjectContext';
import CommandSection from '../commands/CommandSection';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import ImageGallerySection from './ImageGallerySection';
import DeviceNotesSection from './DeviceNotesSection';
import DevicePortsSection from './DevicePortsSection';
import DeviceAttachmentsSection from './DeviceAttachmentsSection';

const DEFAULT_SECTION_ORDER = ['overview', 'credentials', 'ports', 'notes', 'gallery', 'attachments', 'command_outputs'];

export default function DeviceDetail() {
  const confirm = useConfirmDialog();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;
  const deviceId = Number(id);

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', projectId, deviceId],
    queryFn: () => fetchDevice(projectId, deviceId),
  });

  const { data: credentials } = useQuery({
    queryKey: ['credentials', projectId, 'device', deviceId],
    queryFn: () => fetchCredentialsByDevice(projectId, deviceId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDevice(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', projectId] });
      navigate(`${base}/devices`);
    },
  });

  if (isLoading) return <div className="loading">Loading...</div>;
  if (!device) return <div className="empty-state">Device not found</div>;

  const sectionCfg = (() => {
    try { return device.section_config ? JSON.parse(device.section_config) : {}; }
    catch { return {}; }
  })();
  const show = (key: string) => sectionCfg[key] !== false;
  const storedOrder: string[] = sectionCfg.order?.length ? sectionCfg.order : DEFAULT_SECTION_ORDER;
  const order: string[] = [
    ...DEFAULT_SECTION_ORDER.filter(k => !storedOrder.includes(k)),
    ...storedOrder,
  ];

  const credentialsSection = show('credentials') && (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>Credentials</h3>
        <Link to={`${base}/credentials/new`} className="btn btn-secondary btn-sm">+ Add Credential</Link>
      </div>
      {!credentials?.length ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>No credentials linked to this device.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>Username</th>
              <th>Password</th>
              <th>Type</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map(c => (
              <tr key={c.id}>
                <td>{c.host || '—'}</td>
                <td>{c.username}</td>
                <td>{c.password || '—'}</td>
                <td>{c.type || '—'}</td>
                <td>{c.source || '—'}</td>
                <td className="actions">
                  <Link to={`${base}/credentials/${c.id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const overviewSection = show('overview') && (
    <div className="card">
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Overview</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <label>Type</label>
          <p><span className={`badge badge-${device.type}`}>{DEVICE_TYPE_LABELS[device.type] || device.type}</span></p>
        </div>
        <div className="detail-item">
          <label>OS</label>
          <p>{device.os || '—'}</p>
        </div>
        <div className="detail-item">
          <label>MAC Address</label>
          <p>{device.mac_address || '—'}</p>
        </div>
        <div className="detail-item">
          <label>Location</label>
          <p>{device.location || '—'}</p>
        </div>
        <div className="detail-item">
          <label>Subnet</label>
          <p>{device.subnet_name || '—'}</p>
        </div>
        {device.type === 'server' && device.hosting_type && (
          <div className="detail-item">
            <label>Hosting</label>
            <p><span className={`badge badge-hosting-${device.hosting_type}`}>{formatHostingType(device.hosting_type)}</span></p>
          </div>
        )}
        {device.hosting_type === 'vm' && device.hypervisor_name && (
          <div className="detail-item">
            <label>Hypervisor</label>
            <p><Link to={`${base}/devices/${device.hypervisor_id}`}>{device.hypervisor_name}</Link></p>
          </div>
        )}
        <div className="detail-item">
          <label>AV</label>
          <p>{device.av ? `🛡️ ${device.av}` : '—'}</p>
        </div>
      </div>

      {device.notes && (
        <div style={{ marginTop: '1rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Notes</label>
          <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{device.notes}</p>
        </div>
      )}

      {device.tags?.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
            {device.tags.map(tag => (
              <span key={tag} className="tag-pill">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {device.ips?.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>IP Addresses</label>
          <ul className="ip-list">
            {device.ips.map(ip => (
              <li key={ip.id} className={ip.is_primary ? 'ip-primary' : ''}>
                {ip.ip_address} {ip.label ? `(${ip.label})` : ''} {ip.is_primary ? '★' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const sectionMap: Record<string, React.ReactNode> = {
    overview: overviewSection,
    credentials: credentialsSection,
    gallery: show('gallery') && <ImageGallerySection deviceId={deviceId} />,
    attachments: show('attachments') && <DeviceAttachmentsSection deviceId={deviceId} />,
    ports: show('ports') && <DevicePortsSection deviceId={deviceId} />,
    notes: show('notes') && <DeviceNotesSection deviceId={deviceId} initialHtml={device.rich_notes ?? null} />,
    command_outputs: device.type === 'server' && show('command_outputs') && <CommandSection deviceId={device.id} />,
  };

  return (
    <div>
      <div className="page-header">
        <h2>{device.name}</h2>
        <div className="actions">
          <Link to={`${base}/devices/${device.id}/edit`} className="btn btn-secondary">Edit</Link>
          <button
            className="btn btn-danger"
            onClick={async () => { if (await confirm('Delete this device?')) deleteMut.mutate(device.id); }}
          >Delete</button>
        </div>
      </div>

      {device.hosting_type === 'hypervisor' && device.vms && device.vms.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Virtual Machines</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>IP Address</th>
                <th>OS</th>
              </tr>
            </thead>
            <tbody>
              {device.vms.map(vm => (
                <tr key={vm.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/devices/${vm.id}`)}>
                  <td>{vm.name}</td>
                  <td><span className={`badge badge-${vm.type}`}>{DEVICE_TYPE_LABELS[vm.type as keyof typeof DEVICE_TYPE_LABELS] || vm.type}</span></td>
                  <td>{vm.primary_ip || '—'}</td>
                  <td>{vm.os || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {order.map(key => (
        <React.Fragment key={key}>{sectionMap[key]}</React.Fragment>
      ))}
    </div>
  );
}

const HOSTING_LABELS: Record<HostingType, string> = {
  baremetal: 'Baremetal',
  vm: 'Virtual Machine',
  hypervisor: 'Hypervisor',
};

function formatHostingType(ht: HostingType): string {
  return HOSTING_LABELS[ht] || ht;
}
