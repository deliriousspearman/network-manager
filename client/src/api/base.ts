export function projectBase(projectId: number, resource: string): string {
  return `/api/projects/${projectId}/${resource}`;
}
