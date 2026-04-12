import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export default function ErrorState({
  icon,
  title = 'Something went wrong',
  description,
  action,
}: ErrorStateProps) {
  return (
    <div className="error-state">
      <div className="error-state-icon">
        {icon ?? <AlertTriangle size={22} />}
      </div>
      <h3 className="error-state-title">{title}</h3>
      {description && <p className="error-state-description">{description}</p>}
      {action && <div className="error-state-action">{action}</div>}
    </div>
  );
}
