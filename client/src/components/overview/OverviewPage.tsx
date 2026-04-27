import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Network, KeyRound, Star, GitFork, Upload, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProject } from '../../contexts/ProjectContext';
import { fetchProjectStats, updateProject } from '../../api/projects';
import { useParams } from 'react-router-dom';
import { RichToolbar } from '../ui/RichEditor';
import { useToast } from '../ui/Toast';
import PageHeader from '../layout/PageHeader';

function StatCard({ label, value, icon: Icon }: { label: string; value: number | undefined; icon: React.ElementType }) {
  return (
    <div className="card overview-stat-card">
      <div className="overview-stat-head">
        <div className="overview-stat-label">{label}</div>
        <div className="overview-stat-icon">
          <Icon size={18} />
        </div>
      </div>
      <div className="overview-stat-value">{value ?? '—'}</div>
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
  const toast = useToast();

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
    onError: (err: Error) => toast(err.message || 'Failed to save project', 'error'),
  });

  // Populate editor innerHTML when edit mode opens — use a ref so we don't clobber
  // the user's in-flight edits if the upstream description prop changes mid-edit.
  const descriptionRef = useRef(project.description);
  descriptionRef.current = project.description;
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = descriptionRef.current || '';
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

  const base = `/p/${project.slug}`;
  const isEmptyProject = stats &&
    stats.device_count === 0 &&
    stats.subnet_count === 0 &&
    stats.credential_count === 0;

  return (
    <div>
      <PageHeader
        title={project.name}
        subtitle={project.about_title || 'Project overview'}
      />

      {/* Stat cards */}
      <div className="overview-stats-row">
        <StatCard label="Hosts" value={stats?.device_count} icon={Monitor} />
        <StatCard label="Favourited" value={stats?.favourite_count} icon={Star} />
        <StatCard label="Subnets" value={stats?.subnet_count} icon={Network} />
        <StatCard label="Credentials" value={stats?.credential_count} icon={KeyRound} />
      </div>

      {isEmptyProject && (
        <div className="card overview-onboarding">
          <div className="overview-onboarding-head">
            <Sparkles size={18} />
            <h3>Getting started</h3>
          </div>
          <p className="overview-onboarding-lead">
            This project is empty. Pick a starting point — you can always add more later.
          </p>
          <div className="overview-onboarding-grid">
            <Link to={`${base}/devices/new`} className="overview-onboarding-action">
              <Monitor size={20} />
              <div>
                <div className="overview-onboarding-action-title">Add a host</div>
                <div className="overview-onboarding-action-sub">Track a device, server, or switch</div>
              </div>
            </Link>
            <Link to={`${base}/subnets/new`} className="overview-onboarding-action">
              <Network size={20} />
              <div>
                <div className="overview-onboarding-action-title">Define a subnet</div>
                <div className="overview-onboarding-action-sub">Group hosts by CIDR or VLAN</div>
              </div>
            </Link>
            <Link to={`${base}/credentials`} className="overview-onboarding-action">
              <KeyRound size={20} />
              <div>
                <div className="overview-onboarding-action-title">Store credentials</div>
                <div className="overview-onboarding-action-sub">Keep logins alongside the hosts they belong to</div>
              </div>
            </Link>
            <Link to={`${base}/diagram`} className="overview-onboarding-action">
              <GitFork size={20} />
              <div>
                <div className="overview-onboarding-action-title">Open the diagram</div>
                <div className="overview-onboarding-action-sub">Visualise your network topology</div>
              </div>
            </Link>
            <Link to={`${base}/backup`} className="overview-onboarding-action">
              <Upload size={20} />
              <div>
                <div className="overview-onboarding-action-title">Import a backup</div>
                <div className="overview-onboarding-action-sub">Restore from a previous export</div>
              </div>
            </Link>
          </div>
        </div>
      )}

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
