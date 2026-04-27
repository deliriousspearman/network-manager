import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { HostingType } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDevice, deleteDevice } from '../../api/devices';
import { fetchCredentialsByDevice } from '../../api/credentials';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';
import { rowNavHandlers } from '../../utils/navigation';
import CommandSection from '../commands/CommandSection';
import RouterConfigSection from '../routerConfig/RouterConfigSection';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import CredentialForm from '../credentials/CredentialForm';
import ImageGallerySection from './ImageGallerySection';
import DeviceNotesSection from './DeviceNotesSection';
import DevicePortsSection from './DevicePortsSection';
import DeviceAttachmentsSection from './DeviceAttachmentsSection';
import LoadingSpinner from '../ui/LoadingSpinner';
import Tabs, { type TabDef } from '../ui/Tabs';
import PageHeader from '../layout/PageHeader';
import Modal from '../ui/Modal';
import { Pencil, FileText, Cable, Paperclip, Image, Terminal, Router, KeyRound, Info } from 'lucide-react';

export default function DeviceDetail() {
  const confirm = useConfirmDialog();
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;
  const deviceId = Number(id);

  const { data: device, isLoading } = useQuery({
    queryKey: queryKeys.devices.detail(projectId, deviceId),
    queryFn: () => fetchDevice(projectId, deviceId),
  });

  const { data: credentials } = useQuery({
    queryKey: queryKeys.credentials.forDevice(projectId, deviceId),
    queryFn: () => fetchCredentialsByDevice(projectId, deviceId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDevice(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) });
      navigate(`${base}/devices`);
    },
    onError: (err: Error) => toast(err.message || 'Failed to delete device', 'error'),
  });

  const [credFormModal, setCredFormModal] = useState<{ open: boolean; editId?: number }>({ open: false });

  if (isLoading) return <LoadingSpinner />;
  if (!device) return <div className="empty-state">Device not found</div>;

  const sectionCfg = (() => {
    try { return device.section_config ? JSON.parse(device.section_config) : {}; }
    catch { return {}; }
  })();
  const show = (key: string) => sectionCfg[key] !== false;

  const summaryCard = (
    <div className="card device-summary-card">
      <div className="detail-grid">
        <div className="detail-item">
          <label>Type</label>
          <p><span className={`badge badge-${device.type}`}>{DEVICE_TYPE_LABELS[device.type] || device.type}</span></p>
        </div>
        <div className="detail-item">
          <label>Status</label>
          <p>{device.status ? <span className={`badge badge-status-${device.status}`}>{device.status.charAt(0).toUpperCase() + device.status.slice(1)}</span> : '—'}</p>
        </div>
        <div className="detail-item">
          <label>OS</label>
          <p>{device.os || '—'}</p>
        </div>
        <div className="detail-item">
          <label>Hostname</label>
          <p>{device.hostname || '—'}</p>
        </div>
        <div className="detail-item">
          <label>Domain</label>
          <p>{device.domain || '—'}</p>
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
          <p>{device.subnet_id && device.subnet_name
            ? <Link to={`${base}/subnets/${device.subnet_id}`}>{device.subnet_name}</Link>
            : (device.subnet_name || '—')}</p>
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
          <p>{device.av || '—'}</p>
        </div>
      </div>

      {device.tags?.length > 0 && (
        <div className="detail-extra">
          <label>Tags</label>
          <div className="tag-row">
            {device.tags.map(tag => (
              <span key={tag} className="tag-pill">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {device.ips?.length > 0 && (
        <div className="detail-extra">
          <label>IP Addresses</label>
          <ul className="ip-list">
            {device.ips.map(ip => (
              <li key={ip.id} className={ip.is_primary ? 'ip-primary' : ''}>
                {ip.ip_address} {ip.label ? `(${ip.label})` : ''} {ip.is_primary ? '★' : ''}
                {ip.dhcp ? <span className="badge badge-dhcp" title="Address assigned by DHCP — may change">DHCP</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const credentialsPanel = (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Credentials</h3>
        <button className="btn btn-outline btn-sm" onClick={() => setCredFormModal({ open: true })}>+ Add Credential</button>
      </div>
      {!credentials?.length ? (
        <p className="muted">No credentials linked to this device.</p>
      ) : (
        <div className="table-container">
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
                    <button className="btn btn-outline btn-sm" onClick={() => setCredFormModal({ open: true, editId: c.id })} title="Edit"><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {credFormModal.open && (
        <CredentialModal editId={credFormModal.editId} deviceId={device.id} onClose={() => setCredFormModal({ open: false })} />
      )}
    </div>
  );

  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview', icon: <Info size={14} /> },
    { id: 'notes', label: 'Notes', icon: <FileText size={14} />, hidden: !show('notes') },
    { id: 'ports', label: 'Ports', icon: <Cable size={14} />, hidden: !show('ports') },
    { id: 'credentials', label: 'Credentials', icon: <KeyRound size={14} />, hidden: !show('credentials'), count: credentials?.length },
    { id: 'attachments', label: 'Attachments', icon: <Paperclip size={14} />, hidden: !show('attachments') },
    { id: 'gallery', label: 'Images', icon: <Image size={14} />, hidden: !show('gallery') },
    { id: 'router_config', label: 'Router Config', icon: <Router size={14} />, hidden: device.type !== 'router' || !show('router_config') },
    { id: 'command_outputs', label: 'Command Outputs', icon: <Terminal size={14} />, hidden: !show('command_outputs') },
  ];

  const renderTab = (id: string) => {
    switch (id) {
      case 'overview':
        return device.notes ? (
          <div className="card">
            <div className="card-header"><h3 className="card-header-title">Notes</h3></div>
            <p className="notes-plain">{device.notes}</p>
          </div>
        ) : (
          <div className="empty-state">
            <div>No additional overview information.</div>
          </div>
        );
      case 'notes': return <DeviceNotesSection deviceId={deviceId} initialHtml={device.rich_notes ?? null} />;
      case 'ports': return <DevicePortsSection deviceId={deviceId} />;
      case 'credentials': return credentialsPanel;
      case 'attachments': return <DeviceAttachmentsSection deviceId={deviceId} />;
      case 'gallery': return <ImageGallerySection deviceId={deviceId} />;
      case 'router_config': return <RouterConfigSection deviceId={device.id} />;
      case 'command_outputs': return <CommandSection deviceId={device.id} />;
      default: return null;
    }
  };

  return (
    <div>
      <PageHeader
        title={device.name}
        subtitle={DEVICE_TYPE_LABELS[device.type] || device.type}
        actions={
          <>
            <Link to={`${base}/devices/${device.id}/edit`} className="btn btn-secondary">Edit</Link>
            <button
              className="btn btn-danger"
              onClick={async () => { if (await confirm('Delete this device?')) deleteMut.mutate(device.id); }}
            >Delete</button>
          </>
        }
      />

      {summaryCard}

      {device.hosting_type === 'hypervisor' && device.vms && device.vms.length > 0 && (
        <div className="card">
          <div className="card-header"><h3 className="card-header-title">Virtual Machines</h3></div>
          <div className="table-container">
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
                  <tr key={vm.id} style={{ cursor: 'pointer' }} {...rowNavHandlers(`${base}/devices/${vm.id}`, navigate)}>
                    <td>{vm.name}</td>
                    <td><span className={`badge badge-${vm.type}`}>{DEVICE_TYPE_LABELS[vm.type as keyof typeof DEVICE_TYPE_LABELS] || vm.type}</span></td>
                    <td>{vm.primary_ip || '—'}</td>
                    <td>{vm.os || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Tabs tabs={tabs} hashPersist>
        {renderTab}
      </Tabs>
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

function CredentialModal({ editId, deviceId, onClose }: { editId?: number; deviceId: number; onClose: () => void }) {
  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 500, width: '90vw' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{editId ? 'Edit Credential' : 'New Credential'}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
      <CredentialForm editId={editId} defaultDeviceId={deviceId} onClose={onClose} />
    </Modal>
  );
}
