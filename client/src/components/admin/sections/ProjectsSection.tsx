import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchProjects, createProject, updateProject, deleteProject } from '../../../api/projects';
import Modal from '../../ui/Modal';
import type { Project } from 'shared/types';

export default function ProjectsSection() {
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formShortName, setFormShortName] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  function closeDeleteModal() {
    setDeleteTarget(null);
    setDeleteConfirmText('');
  }

  function autoSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function openCreateForm() {
    setEditId(null);
    setFormName('');
    setFormSlug('');
    setFormShortName('');
    setShowForm(true);
  }

  function openEditForm(project: Project) {
    setEditId(project.id);
    setFormName(project.name);
    setFormSlug(project.slug);
    setFormShortName(project.short_name || '');
    setShowForm(true);
  }

  const createMut = useMutation({
    mutationFn: () => createProject({ name: formName.trim(), slug: formSlug.trim(), short_name: formShortName.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: () => updateProject(editId!, { name: formName.trim(), slug: formSlug.trim(), short_name: formShortName.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      closeDeleteModal();
    },
  });

  const isSubmitting = createMut.isPending || updateMut.isPending;

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>Projects</h3>
        <button className="btn btn-primary" onClick={openCreateForm}>New Project</button>
      </div>

      {showForm && (
        <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--color-bg-secondary, var(--color-bg))', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <div className="form-row" style={{ marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => {
                  setFormName(e.target.value);
                  if (!editId) setFormSlug(autoSlug(e.target.value));
                }}
                placeholder="e.g. Home Network"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Short Name</label>
              <input
                type="text"
                value={formShortName}
                onChange={e => setFormShortName(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="e.g. HN"
                maxLength={2}
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Slug</label>
              <input
                type="text"
                value={formSlug}
                onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. home-network"
              />
            </div>
          </div>
          {(createMut.error || updateMut.error) && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              {(createMut.error || updateMut.error)?.message}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary"
              disabled={!formName.trim() || !formSlug.trim() || isSubmitting}
              onClick={() => editId ? updateMut.mutate() : createMut.mutate()}
            >
              {isSubmitting ? 'Saving...' : editId ? 'Update' : 'Create'}
            </button>
            <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {projects.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Short Name</th>
                <th>Slug</th>
                <th>Devices</th>
                <th>Subnets</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project: Project) => (
                <tr key={project.id}>
                  <td style={{ fontWeight: 500 }}>{project.name}</td>
                  <td style={{ fontWeight: 600 }}>{project.short_name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{project.slug}</td>
                  <td>{project.device_count ?? 0}</td>
                  <td>{project.subnet_count ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-sm" onClick={() => openEditForm(project)}>Edit</button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => { setDeleteTarget(project); setDeleteConfirmText(''); }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No projects found.</p>
      )}

      {deleteTarget && (
        <Modal onClose={closeDeleteModal} title="Delete Project">
          <div className="confirm-dialog-message">
            This will permanently delete <strong>{deleteTarget.name}</strong> and ALL its data
            (devices, subnets, credentials, diagram, logs). This cannot be undone.
          </div>
          <div style={{ margin: '1rem 0' }}>
            <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>
              Type <strong>DELETE PROJECT</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE PROJECT"
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
          <div className="confirm-dialog-actions">
            <button className="btn btn-secondary" onClick={closeDeleteModal}>Cancel</button>
            <button
              className="btn btn-danger"
              disabled={deleteConfirmText !== 'DELETE PROJECT' || deleteMut.isPending}
              onClick={() => deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? 'Deleting...' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
