import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '../../api/projects';
import LoadingSpinner from '../ui/LoadingSpinner';
import { getStorage } from '../../utils/storage';

export default function ProjectRedirect() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const lastSlug = getStorage('last-project-slug');
  const target = projects?.find(p => p.slug === lastSlug) ?? projects?.[0];
  const slug = target?.slug ?? 'default';

  return <Navigate to={`/p/${slug}/overview`} replace />;
}
