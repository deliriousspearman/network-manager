import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '../../api/projects';

export default function ProjectRedirect() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  const lastSlug = localStorage.getItem('last-project-slug');
  const target = projects?.find(p => p.slug === lastSlug) ?? projects?.[0];
  const slug = target?.slug ?? 'default';

  return <Navigate to={`/p/${slug}/overview`} replace />;
}
