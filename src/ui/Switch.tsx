import React from 'react';
import { Haptics } from '@/engines';
import './Switch.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  id,
  className = '',
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  const toggle = () => {
    if (disabled) return;
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
      disabled={disabled}
      className={`switch ${className}`.trim()}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <span className="switch-knob" />
    </button>
  );
};

