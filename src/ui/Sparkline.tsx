import React from 'react';
import './Sparkline.css';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 96,
  height = 24,
  className = '',
  strokeWidth = 1.75,
}) => {
  if (!data || data.length === 0) {
    return (
      <svg
        className={`sparkline${className ? ` ${className}` : ''}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      />
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = strokeWidth;
  const drawHeight = height - padding * 2;
  const step = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  const points = data.map((val, idx) => {
    const x = padding + idx * step;
    const y = height - padding - ((val - min) / range) * drawHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(' ');
  const areaPoints = `${padding},${height} ${polylinePoints} ${width - padding},${height}`;

  return (
    <svg
      className={`sparkline${className ? ` ${className}` : ''}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polygon className="sparkline__area" points={areaPoints} />
      <polyline
        className="sparkline__line"
        points={polylinePoints}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

