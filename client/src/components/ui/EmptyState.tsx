import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  secondaryActions?: ReactNode;
}

export default function EmptyState({
  icon,
  title = 'No items yet',
  description,
  action,
  secondaryActions,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon ?? <Inbox size={22} />}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
      {secondaryActions && <div className="empty-state-secondary">{secondaryActions}</div>}
    </div>
  );
}
