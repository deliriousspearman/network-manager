import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Network, KeyRound, Star } from 'lucide-react';
import { useProject } from '../../contexts/ProjectContext';
import { fetchProjectStats, updateProject } from '../../api/projects';
import { useParams } from 'react-router-dom';
import { RichToolbar } from '../ui/RichEditor';

function StatCard({ label, value, icon: Icon }: { label: string; value: number | undefined; icon: React.ElementType }) {
  return (
    <div className="card overview-stat-card">
      <div className="overview-stat-icon">
        <Icon size={20} />
      </div>
      <div className="overview-stat-value">{value ?? '—'}</div>
      <div className="overview-stat-label">{label}</div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function OverviewPage() {
  const { project, projectId } = useProject();
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  const { data: stats } = useQuery({
    queryKey: ['project-stats', projectId],
    queryFn: () => fetchProjectStats(projectId),
  });

  const updateMut = useMutation({
    mutationFn: (data: { description: string; about_title: string }) =>
      updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectSlug] });
      setEditing(false);
    },
  });

  // Populate editor innerHTML when edit mode opens
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = project.description || '';
    }
  }, [editing]);

  const startEdit = () => {
    setDraftTitle(project.about_title || 'About this project');
    setEditing(true);
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || '';
    updateMut.mutate({ description: html, about_title: draftTitle });
  };

  // Check if stored description is HTML or plain text for backward compatibility
  const descIsHtml = !!(project.description && project.description.includes('<'));

  return (
    <div>
      <div className="page-header">
        <h2>{project.name}</h2>
      </div>

      {/* Stat cards */}
      <div className="overview-stats-row">
        <StatCard label="Hosts" value={stats?.device_count} icon={Monitor} />
        <StatCard label="Favourited" value={stats?.favourite_count} icon={Star} />
        <StatCard label="Subnets" value={stats?.subnet_count} icon={Network} />
        <StatCard label="Credentials" value={stats?.credential_count} icon={KeyRound} />
      </div>

      {/* About / Description */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          {editing ? (
            <input
              className="overview-title-input"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              placeholder="Section title..."
            />
          ) : (
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {project.about_title || 'About this project'}
            </h3>
          )}
          {!editing && (
            <button className="btn btn-secondary btn-sm" onClick={startEdit}>Edit</button>
          )}
        </div>

        {editing ? (
          <>
            <RichToolbar editorRef={editorRef} />
            <div
              ref={editorRef}
              className="overview-rich-editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Add a description for this project..."
            />
            {updateMut.isError && (
              <div className="error-message" style={{ marginTop: '0.5rem' }}>{String(updateMut.error)}</div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : project.description ? (
          descIsHtml
            ? <div className="overview-rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(project.description) }} />
            : <p className="overview-description-text">{project.description}</p>
        ) : (
          <p className="overview-description-text">
            <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>No description yet. Click Edit to add one.</span>
          </p>
        )}

        <div className="overview-meta">
          <span>Created {formatDate(project.created_at)}</span>
          <span>Updated {formatDate(project.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}
