import { useEffect } from 'react';
import { useParams, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectBySlug } from '../../api/projects';
import { ProjectContext } from '../../contexts/ProjectContext';
import AppShell from './AppShell';
import Breadcrumb from './Breadcrumb';
import SearchModal from '../ui/SearchModal';
import { setStorage } from '../../utils/storage';

const SECTION_TITLES: Record<string, string> = {
  overview: 'Overview',
  agents: 'Agents',
  devices: 'Devices',
  subnets: 'Subnets',
  credentials: 'Credentials',
  diagram: 'Network Diagram',
  timeline: 'Timeline',
  query: 'SQL Query',
  settings: 'Project Settings',
  logs: 'Project Logs',
};

export default function ProjectLayout() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const location = useLocation();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectBySlug(projectSlug!),
    enabled: !!projectSlug,
  });

  useEffect(() => {
    const segment = location.pathname.split('/').filter(Boolean)[2] || 'overview';
    const section = SECTION_TITLES[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    document.title = `Network Manager - ${section}`;
    return () => { document.title = 'Network Manager'; };
  }, [location.pathname]);

  if (isLoading) {
    return (
      <AppShell>
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading project...</div>
      </AppShell>
    );
  }

  if (error || !project) {
    return <Navigate to="/" replace />;
  }

  // Save last-used project
  setStorage('last-project-slug', project.slug);

  return (
    <ProjectContext.Provider value={{ project, projectId: project.id }}>
      <AppShell>
        <Breadcrumb />
        <Outlet />
      </AppShell>
      <SearchModal />
    </ProjectContext.Provider>
  );
}
