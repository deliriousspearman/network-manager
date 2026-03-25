import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fetchDevices } from '../../api/devices';
import { useProject } from '../../contexts/ProjectContext';
import type { DeviceWithIps } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';

type SortCol = 'name' | 'type' | 'hosting_type' | 'primary_ip' | 'os' | 'subnet_name';

export default function DeviceList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const { data: devices, isLoading } = useQuery({ queryKey: ['devices', projectId], queryFn: () => fetchDevices(projectId) });
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  const sorted = useMemo(() => {
    if (!devices || !sortCol) return devices ?? [];
    return [...devices].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'primary_ip') {
        const aIp = a.primary_ip, bIp = b.primary_ip;
        if (!aIp && bIp) return 1;
        if (aIp && !bIp) return -1;
        const toOctets = (ip: string) => ip.split('.').map(n => parseInt(n, 10) || 0);
        const [aOcts, bOcts] = [toOctets(aIp!), toOctets(bIp!)];
        for (let i = 0; i < 4; i++) {
          if (aOcts[i] !== bOcts[i]) { cmp = aOcts[i] - bOcts[i]; break; }
        }
      } else {
        const av = (a[sortCol] ?? '') as string;
        const bv = (b[sortCol] ?? '') as string;
        if (!av && bv) return 1;
        if (av && !bv) return -1;
        cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [devices, sortCol, sortDir]);

  if (isLoading) return <div className="loading">Loading...</div>;

  const base = `/p/${project.slug}`;
  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

  return (
    <div>
      <div className="page-header">
        <h2>Devices</h2>
        <Link to={`${base}/devices/new`} className="btn btn-primary">+ Add Device</Link>
      </div>

      {!devices?.length ? (
        <div className="empty-state">No devices yet. Add your first device to get started.</div>
      ) : (
        <div className="card table-container">
          <table>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                <th style={thStyle} onClick={() => handleSort('type')}>Type <SortIcon col="type" /></th>
                <th style={thStyle} onClick={() => handleSort('hosting_type')}>Hosting <SortIcon col="hosting_type" /></th>
                <th style={thStyle} onClick={() => handleSort('primary_ip')}>IP Address <SortIcon col="primary_ip" /></th>
                <th style={thStyle} onClick={() => handleSort('os')}>OS <SortIcon col="os" /></th>
                <th style={thStyle} onClick={() => handleSort('subnet_name')}>Subnet <SortIcon col="subnet_name" /></th>
                <th>Tags</th>
                <th style={{ textAlign: 'center' }}>AV</th>
                <th style={{ textAlign: 'center' }}>Creds</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d: DeviceWithIps) => (
                <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/devices/${d.id}`)}>
                  <td>{d.name}</td>
                  <td><span className={`badge badge-${d.type}`}>{DEVICE_TYPE_LABELS[d.type] || d.type}</span></td>
                  <td>{d.hosting_type ? <span className={`badge badge-hosting-${d.hosting_type}`}>{d.hosting_type}</span> : '—'}</td>
                  <td>{d.primary_ip || '—'}</td>
                  <td>{d.os || '—'}</td>
                  <td>{d.subnet_name || '—'}</td>
                  <td>
                    {d.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {d.tags.map(tag => <span key={tag} className="tag-pill">{tag}</span>)}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>{d.av ? '🛡️' : ''}</td>
                  <td style={{ textAlign: 'center' }}>{d.credential_count ? '🔑' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
