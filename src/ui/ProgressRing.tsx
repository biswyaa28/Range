import React from 'react';
import { useReducedMotion } from '@/hooks';
import './ProgressRing.css';

export interface ProgressRingProps {
  /** 0–1 completion fraction */
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  size = 48,
  strokeWidth = 4,
  className = '',
  label,
}) => {
  const reduced = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      className={`progress-ring${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {/* Background track */}
      <circle
        className="progress-ring__track"
        cx={cx}
        cy={cy}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Foreground arc */}
      <circle
        className={`progress-ring__fill${reduced ? ' progress-ring__fill--no-anim' : ''}`}
        cx={cx}
        cy={cy}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
};

