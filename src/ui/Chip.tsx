import React from 'react';
import './Chip.css';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  active?: boolean;
  variant?: 'default' | 'accent';
}

export const Chip: React.FC<ChipProps> = ({
  active = false,
  variant = 'default',
  className = '',
  children,
  ...rest
}) => {
  const activeClass = active ? (variant === 'accent' ? 'chip-accent' : 'chip-active') : '';
  return (
    <span className={`chip ${activeClass} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
};

