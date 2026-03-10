import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fetchSubnets } from '../../api/subnets';
import { useProject } from '../../contexts/ProjectContext';
import type { Subnet } from 'shared/types';

type SortCol = 'name' | 'cidr' | 'vlan_id' | 'description';

export default function SubnetList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const { data: subnets, isLoading } = useQuery({ queryKey: ['subnets', projectId], queryFn: () => fetchSubnets(projectId) });
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
    if (!subnets || !sortCol) return subnets ?? [];
    return [...subnets].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'vlan_id') {
        const av = a.vlan_id, bv = b.vlan_id;
        if (av == null && bv != null) return 1;
        if (av != null && bv == null) return -1;
        cmp = (av ?? 0) - (bv ?? 0);
      } else {
        const av = (a[sortCol] ?? '') as string;
        const bv = (b[sortCol] ?? '') as string;
        if (!av && bv) return 1;
        if (av && !bv) return -1;
        cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [subnets, sortCol, sortDir]);

  if (isLoading) return <div className="loading">Loading...</div>;

  const base = `/p/${project.slug}`;
  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

  return (
    <div>
      <div className="page-header">
        <h2>Subnets</h2>
        <Link to={`${base}/subnets/new`} className="btn btn-primary">+ Add Subnet</Link>
      </div>

      {!subnets?.length ? (
        <div className="empty-state">No subnets yet. Add your first subnet to organize devices.</div>
      ) : (
        <div className="card table-container">
          <table>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                <th style={thStyle} onClick={() => handleSort('cidr')}>CIDR <SortIcon col="cidr" /></th>
                <th style={thStyle} onClick={() => handleSort('vlan_id')}>VLAN ID <SortIcon col="vlan_id" /></th>
                <th style={thStyle} onClick={() => handleSort('description')}>Description <SortIcon col="description" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s: Subnet) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/subnets/${s.id}`)}>
                  <td>{s.name}</td>
                  <td>{s.cidr}</td>
                  <td>{s.vlan_id || '—'}</td>
                  <td>{s.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
