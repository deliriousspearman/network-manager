import { useState, useEffect, useContext } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Monitor,
  Network,
  KeyRound,
  GitFork,
  Settings,
  ScrollText,
  Wrench,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,

} from 'lucide-react';
import { ProjectContext } from '../../contexts/ProjectContext';
import { fetchProjects } from '../../api/projects';

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialCollapsed(): boolean {
  return localStorage.getItem('sidebar-collapsed') === 'true';
}

export default function Sidebar() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const navigate = useNavigate();
  const location = useLocation();

  const projectCtx = useContext(ProjectContext);
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    document.documentElement.setAttribute('data-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const projectSlug = projectCtx?.project?.slug;
  const basePath = projectSlug ? `/p/${projectSlug}` : '/p/default';

  const navItems = [
    { to: `${basePath}/overview`, label: 'Overview', icon: LayoutDashboard },
    { to: `${basePath}/devices`, label: 'Devices', icon: Monitor },
    { to: `${basePath}/subnets`, label: 'Subnets', icon: Network },
    { to: `${basePath}/credentials`, label: 'Credentials', icon: KeyRound },
    { to: `${basePath}/diagram`, label: 'Network Diagram', icon: GitFork },
    { to: `${basePath}/settings`, label: 'Project Settings', icon: Settings },
    { to: `${basePath}/logs`, label: 'Logs', icon: ScrollText },
  ];

  function switchProject(slug: string) {
    const currentSubPath = location.pathname.replace(/^\/p\/[^/]+/, '');
    navigate(`/p/${slug}${currentSubPath || '/overview'}`);
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h1>Network Manager</h1>}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Project switcher */}
      {!collapsed && projects.length > 0 && (
        <select
          value={projectSlug || ''}
          onChange={e => switchProject(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.5rem 0.75rem',
            background: 'var(--color-bg-secondary, var(--color-bg))',
            border: 'none',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            borderRadius: 0,
            color: 'var(--color-text)',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {projects.map(p => (
            <option key={p.id} value={p.slug}>{p.name}</option>
          ))}
        </select>
      )}
      {collapsed && projects.length > 0 && (
        <div style={{ padding: '0 0.5rem', marginBottom: '0.5rem' }}>
          <button
            onClick={() => {
              const currentIndex = projects.findIndex(p => p.slug === projectSlug);
              const next = projects[(currentIndex + 1) % projects.length];
              if (next) switchProject(next.slug);
            }}
            title={`Project: ${projectCtx?.project?.name || 'Select'}`}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              background: 'var(--color-bg-secondary, var(--color-bg))',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--color-text)',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}
          >
            {(projectCtx?.project?.name || 'P')[0].toUpperCase()}
          </button>
        </div>
      )}

      <nav>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            <Icon size={18} />
            {collapsed ? <span className="nav-tooltip">{label}</span> : <span>{label}</span>}
          </NavLink>
        ))}
        <NavLink
          to="/admin"
          className={({ isActive }) => `nav-bottom${isActive ? ' active' : ''}`}
        >
          <Wrench size={18} />
          {collapsed ? <span className="nav-tooltip">Admin Settings</span> : <span>Admin Settings</span>}
        </NavLink>
      </nav>

      <button className="theme-toggle" onClick={toggleTheme} title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        {collapsed ? (
          <span className="nav-tooltip">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        ) : (
          <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        )}
      </button>
    </aside>
  );
}
