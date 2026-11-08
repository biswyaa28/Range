import React from 'react';
import { Haptics } from '@/engines';
import './Switch.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  id,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const toggle = () => {
    Haptics.tap();
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`switch ${className}`.trim()}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <span className="switch-knob" />
    </button>
  );
};

