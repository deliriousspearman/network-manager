import { createContext, useContext } from 'react';
import type { Project } from 'shared/types';

interface ProjectContextType {
  project: Project;
  projectId: number;
}

export const ProjectContext = createContext<ProjectContextType | null>(null);

export function useProject(): ProjectContextType {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within a ProjectContext provider');
  return ctx;
}
