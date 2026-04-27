import type { ReactNode } from 'react';
import { Skeleton } from '../ui/Skeleton';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  isLoading?: boolean;
}

export default function PageHeader({ title, subtitle, icon, actions, breadcrumb, isLoading }: PageHeaderProps) {
  return (
    <header className="page-header">
      {breadcrumb && <div className="page-header-breadcrumb">{breadcrumb}</div>}
      <div className="page-header-main">
        <div className="page-header-title-wrap">
          {icon && <div className="page-header-icon">{icon}</div>}
          <div className="page-header-text">
            <h1 className="page-header-title">
              {isLoading ? <Skeleton width={220} height={28} /> : title}
            </h1>
            {isLoading ? (
              <div className="page-header-subtitle"><Skeleton width={120} height={14} /></div>
            ) : subtitle ? (
              <div className="page-header-subtitle">{subtitle}</div>
            ) : null}
          </div>
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
