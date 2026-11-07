import React from 'react';
import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, className = '', children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={`card ${interactive ? 'card-interactive' : ''} ${className}`.trim()}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

