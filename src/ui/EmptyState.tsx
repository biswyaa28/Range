import React from 'react';
import { Icon, IconName } from './Icon';
import './EmptyState.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`empty-state ${className}`.trim()}>
      {icon && (
        <div className="empty-state-icon">
          <Icon name={icon} size={36} />
        </div>
      )}
      <h2 className="empty-state-title">{title}</h2>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
};

