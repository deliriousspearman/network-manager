import { useParams, Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectBySlug } from '../../api/projects';
import { ProjectContext } from '../../contexts/ProjectContext';
import AppShell from './AppShell';
import Breadcrumb from './Breadcrumb';

export default function ProjectLayout() {
  const { projectSlug } = useParams<{ projectSlug: string }>();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectBySlug(projectSlug!),
    enabled: !!projectSlug,
  });

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
  localStorage.setItem('last-project-slug', project.slug);

  return (
    <ProjectContext.Provider value={{ project, projectId: project.id }}>
      <AppShell>
        <Breadcrumb />
        <Outlet />
      </AppShell>
    </ProjectContext.Provider>
  );
}
