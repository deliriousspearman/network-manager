import { useEffect, useState, type ReactNode } from 'react';

export type TabDef = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  hidden?: boolean;
};

interface TabsProps {
  tabs: TabDef[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  hashPersist?: boolean;
  children: (activeId: string) => ReactNode;
  className?: string;
}

export default function Tabs({
  tabs,
  value,
  defaultValue,
  onChange,
  hashPersist = false,
  children,
  className,
}: TabsProps) {
  const visibleTabs = tabs.filter(t => !t.hidden);
  const firstId = visibleTabs[0]?.id ?? '';

  const initial = (() => {
    if (value) return value;
    if (hashPersist && typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && visibleTabs.some(t => t.id === hash)) return hash;
    }
    return defaultValue ?? firstId;
  })();

  const [internal, setInternal] = useState(initial);
  const active = value ?? internal;

  useEffect(() => {
    if (!hashPersist || typeof window === 'undefined') return;
    const onHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && visibleTabs.some(t => t.id === hash)) {
        setInternal(hash);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [hashPersist, visibleTabs]);

  const select = (id: string) => {
    setInternal(id);
    onChange?.(id);
    if (hashPersist && typeof window !== 'undefined') {
      history.replaceState(null, '', `#${id}`);
    }
  };

  return (
    <div className={`tabs-root${className ? ' ' + className : ''}`}>
      <div className="tabs-list" role="tablist">
        {visibleTabs.map(tab => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`tabs-trigger${isActive ? ' active' : ''}`}
              onClick={() => select(tab.id)}
            >
              {tab.icon && <span className="tabs-trigger-icon">{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="tabs-trigger-count">{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="tabs-panel" role="tabpanel">
        {children(active)}
      </div>
    </div>
  );
}
