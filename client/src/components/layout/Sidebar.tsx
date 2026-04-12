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
  type LucideIcon,
} from 'lucide-react';
import { ProjectContext } from '../../contexts/ProjectContext';
import { fetchProjects } from '../../api/projects';
import ProjectSwitcher from './ProjectSwitcher';
import CollapsedProjectFlyout from './CollapsedProjectFlyout';
import { getStorage, setStorage } from '../../utils/storage';

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
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const projectSlug = projectCtx?.project?.slug;
  const basePath = projectSlug ? `/p/${projectSlug}` : '/p/default';

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
    const currentSubPath = location.pathname.replace(/^\/p\/[^/]+/, '');
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
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {!collapsed && projects.length > 0 && (
        <ProjectSwitcher
          projects={projects}
          currentSlug={projectSlug || ''}
          onSwitch={switchProject}
        />
      )}
      {collapsed && projects.length > 0 && (
        <div className="collapsed-project-wrapper">
          <button
            onClick={() => setFlyoutOpen(o => !o)}
            title={`Project: ${projectCtx?.project?.name || 'Select'}`}
            className={`collapsed-project-btn${flyoutOpen ? ' active' : ''}`}
          >
            {projectCtx?.project?.short_name || (projectCtx?.project?.name || 'P').substring(0, 2).toUpperCase()}
          </button>
          {flyoutOpen && (
            <CollapsedProjectFlyout
              projects={projects}
              currentSlug={projectSlug || ''}
              onSwitch={switchProject}
              onClose={() => setFlyoutOpen(false)}
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
        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          {collapsed ? (
            <span className="nav-tooltip">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          ) : (
            <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          )}
        </button>
        {!collapsed && <div className="sidebar-version">v0.5.1</div>}
      </div>
    </aside>
  );
}
