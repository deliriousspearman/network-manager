import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSubnet, deleteSubnet } from '../../api/subnets';
import { useProject } from '../../contexts/ProjectContext';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import LoadingSpinner from '../ui/LoadingSpinner';

export default function SubnetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;
  const subnetId = Number(id);

  const { data: subnet, isLoading } = useQuery({
    queryKey: ['subnet', projectId, subnetId],
    queryFn: () => fetchSubnet(projectId, subnetId),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSubnet(projectId, subnetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subnets', projectId] });
      navigate(`${base}/subnets`);
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (!subnet) return <div className="empty-state">Subnet not found</div>;

  const deviceCount = subnet.devices?.length ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{subnet.name}</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
          </span>
        </div>
        <div className="actions">
          <Link to={`${base}/subnets/${subnet.id}/edit`} className="btn btn-secondary">Edit</Link>
          <button
            className="btn btn-danger"
            onClick={async () => { if (await confirm('Delete this subnet?')) deleteMut.mutate(); }}
          >Delete</button>
        </div>
      </div>

      <div className="card">
        <div className="detail-grid">
          <div className="detail-item">
            <label>CIDR</label>
            <p style={{ fontFamily: 'monospace' }}>{subnet.cidr}</p>
          </div>
          <div className="detail-item">
            <label>VLAN ID</label>
            <p>{subnet.vlan_id ?? '—'}</p>
          </div>
          {subnet.description && (
            <div className="detail-item">
              <label>Description</label>
              <p>{subnet.description}</p>
            </div>
          )}
          <div className="detail-item">
            <label>Created</label>
            <p>{new Date(subnet.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Devices</h3>
        {deviceCount === 0 ? (
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>No devices in this subnet.</p>
        ) : (
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
              {subnet.devices.map((d: any) => (
                <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/devices/${d.id}`)}>
                  <td>{d.name}</td>
                  <td><span className={`badge badge-${d.type}`}>{DEVICE_TYPE_LABELS[d.type as keyof typeof DEVICE_TYPE_LABELS] || d.type}</span></td>
                  <td>{d.primary_ip || '—'}</td>
                  <td>{d.os || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
