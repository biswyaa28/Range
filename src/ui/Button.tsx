import React, { useState } from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}

interface Ripple {
  x: number;
  y: number;
  size: number;
  id: number;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', children, onClick, ...rest }, ref) => {
    const [ripples, setRipples] = useState<Ripple[]>([]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (variant === 'primary' && !rest.disabled) {
        const button = e.currentTarget;
        const rect = button.getBoundingClientRect();
        const d = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - d / 2;
        const y = e.clientY - rect.top - d / 2;

        const newRipple: Ripple = { x, y, size: d, id: Date.now() };
        setRipples((prev) => [...prev, newRipple]);

        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
        }, 600);
      }
      onClick?.(e);
    };

    const variantClass = `btn-${variant}`;
    const sizeClass = size !== 'md' ? `btn-${size}` : '';

    return (
      <button
        ref={ref}
        type="button"
        className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
        onClick={handleClick}
        {...rest}
      >
        {children}
        {variant === 'primary' &&
          ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="btn-ripple"
              style={{
                top: ripple.y,
                left: ripple.x,
                width: ripple.size,
                height: ripple.size,
              }}
            />
          ))}
      </button>
    );
  },
);

Button.displayName = 'Button';

