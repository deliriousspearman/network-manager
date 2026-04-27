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
  Database,
  Wrench,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  Bot,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { ProjectContext } from '../../contexts/ProjectContext';
import { fetchProjects } from '../../api/projects';
import ProjectSwitcher from './ProjectSwitcher';
import CollapsedProjectFlyout from './CollapsedProjectFlyout';
import { getStorage, setStorage } from '../../utils/storage';
import { projectImageUrl } from '../../utils/projectAvatar';

function getInitialTheme(): 'light' | 'dark' {
  const stored = getStorage('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialCollapsed(): boolean {
  return getStorage('sidebar-collapsed') === 'true';
}

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
type NavSection = { label: string; items: NavItem[] };

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
    setStorage('theme', theme);
  }, [theme]);

  useEffect(() => {
    setStorage('sidebar-collapsed', String(collapsed));
    document.documentElement.setAttribute('data-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const toggleTheme = () => {
    // Suppress transitions for one paint so buttons/inputs/links repaint in
    // lockstep with the rest of the page (otherwise their background/color
    // transitions fire on the variable swap and trail behind). Two rAFs:
    // first commits the new data-theme attribute, second clears the class
    // so hover/focus polish resumes immediately afterwards.
    const root = document.documentElement;
    root.classList.add('theme-changing');
    setTheme(t => t === 'light' ? 'dark' : 'light');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove('theme-changing');
    }));
  };

  const projectSlug = projectCtx?.project?.slug || getStorage('last-project-slug') || undefined;
  const basePath = projectSlug ? `/p/${projectSlug}` : '/p/default';

  useEffect(() => {
    if (pendingSlug && projectCtx?.project?.slug === pendingSlug) {
      setPendingSlug(null);
    }
  }, [pendingSlug, projectCtx?.project?.slug]);

  const projectSections: NavSection[] = [
    {
      label: 'Inventory',
      items: [
        { to: `${basePath}/overview`, label: 'Overview', icon: LayoutDashboard },
        { to: `${basePath}/devices`, label: 'Devices', icon: Monitor },
        { to: `${basePath}/subnets`, label: 'Subnets', icon: Network },
        { to: `${basePath}/agents`, label: 'Agents', icon: Bot },
      ],
    },
    {
      label: 'Visualize',
      items: [
        { to: `${basePath}/diagram`, label: 'Network Diagram', icon: GitFork },
        { to: `${basePath}/timeline`, label: 'Timeline', icon: Clock },
      ],
    },
    {
      label: 'Data',
      items: [
        { to: `${basePath}/credentials`, label: 'Credentials', icon: KeyRound },
        { to: `${basePath}/query`, label: 'SQL Query', icon: Database },
      ],
    },
    {
      label: 'Project',
      items: [
        { to: `${basePath}/settings`, label: 'Settings', icon: Settings },
        { to: `${basePath}/logs`, label: 'Activity Log', icon: ScrollText },
        { to: `${basePath}/trash`, label: 'Trash', icon: Trash2 },
      ],
    },
  ];

  const adminSection: NavSection = {
    label: 'Admin',
    items: [
      { to: '/admin', label: 'Admin Settings', icon: Wrench, end: true },
      { to: '/admin/logs', label: 'Admin Logs', icon: ScrollText },
    ],
  };

  function switchProject(slug: string) {
    if (slug === projectCtx?.project?.slug) return;
    setPendingSlug(slug);
    const projectMatch = location.pathname.match(/^\/p\/[^/]+(\/.*)?$/);
    const currentSubPath = projectMatch ? projectMatch[1] || '' : '';
    navigate(`/p/${slug}${currentSubPath || '/overview'}`);
  }

  const renderItem = ({ to, label, icon: Icon, end }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) => isActive ? 'active' : ''}
    >
      <Icon size={17} />
      {collapsed ? <span className="nav-tooltip">{label}</span> : <span>{label}</span>}
    </NavLink>
  );

  const renderSection = (section: NavSection) => (
    <div key={section.label} className="sidebar-nav-section">
      {!collapsed && <div className="sidebar-nav-label">{section.label}</div>}
      {section.items.map(renderItem)}
    </div>
  );

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h1>Network Manager</h1>}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {!collapsed && projects.length > 0 && (
        <ProjectSwitcher
          projects={projects}
          currentSlug={projectSlug || ''}
          onSwitch={switchProject}
          pendingSlug={pendingSlug}
        />
      )}
      {collapsed && projects.length > 0 && (
        <div className="collapsed-project-wrapper">
          <button
            onClick={() => setFlyoutOpen(o => !o)}
            title={`Project: ${projectCtx?.project?.name || 'Select'}`}
            aria-label={`Switch project (current: ${projectCtx?.project?.name || 'none'})`}
            aria-expanded={flyoutOpen}
            aria-haspopup="menu"
            className={`collapsed-project-btn${flyoutOpen ? ' active' : ''}`}
          >
            {(() => {
              const imgSrc = projectImageUrl(projectCtx?.project);
              if (imgSrc) return <img className="project-avatar" src={imgSrc} alt="" />;
              return projectCtx?.project?.short_name || (projectCtx?.project?.name || 'P').substring(0, 2).toUpperCase();
            })()}
          </button>
          {flyoutOpen && (
            <CollapsedProjectFlyout
              projects={projects}
              currentSlug={projectSlug || ''}
              onSwitch={switchProject}
              onClose={() => setFlyoutOpen(false)}
              pendingSlug={pendingSlug}
            />
          )}
        </div>
      )}

      <nav>
        {projectSections.map(renderSection)}
        <div className="sidebar-nav-bottom">
          {renderSection(adminSection)}
        </div>
      </nav>

      <div className="sidebar-footer">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          {collapsed ? (
            <span className="nav-tooltip">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          ) : (
            <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          )}
        </button>
        {!collapsed && (
          <div className="sidebar-version">
            v0.7.5
          </div>
        )}
      </div>
    </aside>
  );
}
