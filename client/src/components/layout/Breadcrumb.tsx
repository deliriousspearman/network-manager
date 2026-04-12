import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useProject } from '../../contexts/ProjectContext';
import { fetchDevice } from '../../api/devices';
import { fetchSubnet } from '../../api/subnets';
import { fetchAgent } from '../../api/agents';

type Crumb = { label: string; href?: string };

const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  devices: 'Devices',
  subnets: 'Subnets',
  credentials: 'Credentials',
  agents: 'Agents',
  diagram: 'Network Diagram',
  settings: 'Settings',
  query: 'SQL Query',
  logs: 'Activity Log',
};

const NEW_LABELS: Record<string, string> = {
  devices: 'New Device',
  subnets: 'New Subnet',
  credentials: 'New Credential',
  agents: 'New Agent',
};

export default function Breadcrumb() {
  const { project, projectId } = useProject();
  const location = useLocation();

  const base = `/p/${project.slug}`;
  const rest = location.pathname.slice(base.length).replace(/^\//, '');
  const segments = rest ? rest.split('/') : [];
  const section = segments[0];
  const second = segments[1];
  const isEdit = segments[2] === 'edit';
  const entityId = second && second !== 'new' ? Number(second) : null;

  const { data: device } = useQuery({
    queryKey: ['device', projectId, entityId],
    queryFn: () => fetchDevice(projectId, entityId!),
    enabled: section === 'devices' && entityId !== null,
    staleTime: 30_000,
  });

  const { data: subnet } = useQuery({
    queryKey: ['subnet', projectId, entityId],
    queryFn: () => fetchSubnet(projectId, entityId!),
    enabled: section === 'subnets' && entityId !== null,
    staleTime: 30_000,
  });

  const { data: agent } = useQuery({
    queryKey: ['agents', projectId, entityId],
    queryFn: () => fetchAgent(projectId, entityId!),
    enabled: section === 'agents' && entityId !== null,
    staleTime: 30_000,
  });

  const crumbs: Crumb[] = [{ label: project.name, href: `${base}/overview` }];

  if (section) {
    const sectionLabel = SECTION_LABELS[section] ?? section;
    const hasChild = second != null;
    crumbs.push({ label: sectionLabel, href: hasChild ? `${base}/${section}` : undefined });

    if (second === 'new') {
      crumbs.push({ label: NEW_LABELS[section] ?? 'New' });
    } else if (entityId !== null) {
      if (section === 'credentials') {
        crumbs.push({ label: 'Edit Credential' });
      } else {
        const entityName =
          section === 'devices' ? device?.name :
          section === 'subnets' ? subnet?.name :
          section === 'agents' ? agent?.device_name :
          undefined;
        crumbs.push({
          label: entityName ?? '…',
          href: isEdit ? `${base}/${section}/${entityId}` : undefined,
        });
        if (isEdit) crumbs.push({ label: 'Edit' });
      }
    }
  }

  return (
    <nav className="breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i} className="breadcrumb-item">
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          {crumb.href
            ? <Link to={crumb.href} className="breadcrumb-link">{crumb.label}</Link>
            : <span className="breadcrumb-current">{crumb.label}</span>}
        </span>
      ))}
    </nav>
  );
}
