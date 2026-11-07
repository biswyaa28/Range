import React from 'react';
import './Kbd.css';

export type KbdProps = React.HTMLAttributes<HTMLElement>;

export const Kbd: React.FC<KbdProps> = ({ className = '', children, ...rest }) => {
  return (
    <kbd className={`kbd ${className}`.trim()} {...rest}>
      {children}
    </kbd>
  );
};
