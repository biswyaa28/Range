import React from 'react';

export type IconName =
  | 'today'
  | 'grid'
  | 'todo'
  | 'note'
  | 'flag'
  | 'timer'
  | 'chart'
  | 'prompter'
  | 'gear'
  | 'check'
  | 'plus'
  | 'x'
  | 'trash'
  | 'play'
  | 'pause'
  | 'pin'
  | 'bolt'
  | 'moon'
  | 'sun'
  | 'mirror'
  | 'bell'
  | 'star'
  | 'heart'
  | 'speaker'
  | 'download'
  | 'upload'
  | 'keys'
  | 'search'
  | 'sliders'
  | 'grip'
  | 'eye'
  | 'eyeoff'
  | 'chevL'
  | 'chevR'
  | 'chevU'
  | 'chevD'
  | 'class'
  | 'study'
  | 'work'
  | 'exercise'
  | 'meal'
  | 'personal'
  | 'other';

const SVG_PATHS: Record<IconName, React.ReactNode> = {
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="3.5" />
      <path d="M3.5 10.5h17M8.5 3.5V6M15.5 3.5V6" />
      <circle cx="12" cy="15.2" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  grid: (
    <>
      <rect x="3.75" y="3.75" width="7" height="7" rx="2.2" />
      <rect x="13.25" y="3.75" width="7" height="7" rx="2.2" />
      <rect x="3.75" y="13.25" width="7" height="7" rx="2.2" />
      <rect x="13.25" y="13.25" width="7" height="7" rx="2.2" />
    </>
  ),
  todo: (
    <>
      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5" />
      <path d="M8 12.2l2.9 2.9 5.3-6" />
    </>
  ),
  note: (
    <>
      <path d="M6.5 3.5h7.2l4.3 4.3v12.7h-11.5z" />
      <path d="M13.5 3.6V8h4.4" />
      <path d="M9.3 12.5h6M9.3 16h6" />
    </>
  ),
  flag: (
    <>
      <path d="M6.25 20.5v-16" />
      <path d="M6.25 5.2c1.8-.9 3.9-.9 5.7 0s3.9.9 5.7 0v8.6c-1.8.9-3.9.9-5.7 0s-3.9-.9-5.7 0z" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.25" r="7.25" />
      <path d="M12 13.25V9.5M9.75 3.5h4.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4.25 4.5v15.25h15.5" />
      <path d="M7.75 12.25v4.25M12 7.75v8.75M16.25 14.5v2" />
    </>
  ),
  prompter: (
    <>
      <rect x="3.75" y="4.5" width="16.5" height="15" rx="3.5" />
      <path d="M7.5 9.25h9M7.5 12.75h9M7.5 16.25h5.5" />
    </>
  ),
  gear: (
    <>
      <path d="M4.5 7.25h15M4.5 12h15M4.5 16.75h15" />
      <circle cx="9.75" cy="7.25" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="14.75" cy="12" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="8.25" cy="16.75" r="2.1" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  trash: (
    <>
      <path d="M4.75 7h14.5M9.75 7V5.25c0-.7.55-1.25 1.25-1.25h2c.7 0 1.25.55 1.25 1.25V7M6.75 7l.9 12.3c.05.7.62 1.2 1.32 1.2h6.06c.7 0 1.27-.5 1.32-1.2L17.25 7" />
      <path d="M10.25 10.75v6M13.75 10.75v6" />
    </>
  ),
  play: (
    <path
      d="M8.5 5.8v12.4c0 .8.9 1.3 1.6.9l10-6.2c.65-.4.65-1.4 0-1.8l-10-6.2c-.7-.4-1.6.1-1.6.9z"
      fill="currentColor"
      stroke="none"
    />
  ),
  pause: (
    <>
      <rect x="6.75" y="5.25" width="3.6" height="13.5" rx="1.6" fill="currentColor" stroke="none" />
      <rect x="13.65" y="5.25" width="3.6" height="13.5" rx="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21v-6.4" />
      <path d="M12 3.25a4.25 4.25 0 0 1 3.87 6.04c-.63 1.3-1.72 2.03-2.5 3.21-.32.47-.5 1-.5 1.5h-1.74c0-.5-.18-1.03-.5-1.5-.78-1.18-1.87-1.91-2.5-3.21A4.25 4.25 0 0 1 12 3.25z" />
    </>
  ),
  bolt: (
    <path
      d="M13.25 2.75 5.5 13.25h5l-1.75 8 7.75-10.5h-5z"
      fill="currentColor"
      stroke="none"
    />
  ),
  moon: <path d="M20.25 14.05A8.25 8.25 0 1 1 9.95 3.75a6.75 6.75 0 0 0 10.3 10.3z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.75v2M12 19.25v2M2.75 12h2M19.25 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" />
    </>
  ),
  mirror: (
    <>
      <path d="M12 2.75v18.5" strokeDasharray="2.5 3.5" />
      <path d="M8.25 8 4.5 12l3.75 4z" fill="currentColor" stroke="none" />
      <path d="M15.75 8 19.5 12l-3.75 4z" fill="currentColor" stroke="none" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.25v-5a6 6 0 0 1 12 0v5l2 2.75H4z" />
      <path d="M10.3 21.5a1.85 1.85 0 0 0 3.4 0" />
    </>
  ),
  star: <path d="M12 3.6l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.95l-5.25 2.75 1-5.85L3.5 9.75l5.9-.85z" />,
  heart: <path d="M12 20.25s-7.8-4.9-9.55-9.55C1.1 7.1 3.9 4 7 4c2.25 0 3.75 1.25 5 3.3C13.25 5.25 14.75 4 17 4c3.1 0 5.9 3.1 4.55 6.7C19.8 15.35 12 20.25 12 20.25z" />,
  speaker: (
    <>
      <path d="M4 9.75v4.5h3.25L13 19V5L7.25 9.75H4z" />
      <path d="M16.25 9.25c1.75 1.75 1.75 3.75 0 5.5" />
    </>
  ),
  download: <path d="M12 3.75v11M7.75 10.75 12 15l4.25-4.25M4.75 20.25h14.5" />,
  upload: <path d="M12 15.25v-11M7.75 8.5 12 4.25 16.25 8.5M4.75 15.5v4.75h14.5v-4.75" />,
  keys: (
    <>
      <rect x="3.25" y="6.75" width="17.5" height="10.5" rx="2.5" />
      <path d="M6.5 10.25h.8M10 10.25h.8M13.5 10.25h.8M17 10.25h.4M6.5 13.75h.8M10 13.75h.8M13.5 13.75h.8M17 13.75h.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M5 3.75v16.5M12 3.75v16.5M19 3.75v16.5" />
      <circle cx="5" cy="10" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="7.5" r="2.1" fill="currentColor" stroke="none" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6.75" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6.75" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="17.25" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17.25" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  eye: (
    <>
      <path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z" />
      <circle cx="12" cy="12" r="2.9" />
    </>
  ),
  eyeoff: (
    <>
      <path d="M4.25 4.25l15.5 15.5" />
      <path d="M10.3 6.15A9.7 9.7 0 0 1 12 5.75c5.75 0 9.25 6.25 9.25 6.25a17.7 17.7 0 0 1-2.8 3.6M6.7 7.35A17.4 17.4 0 0 0 2.75 12S6.25 18.25 12 18.25a9.5 9.5 0 0 0 3.9-.8" />
      <path d="M9.95 9.95a2.9 2.9 0 0 0 4.1 4.1" />
    </>
  ),
  chevL: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  chevR: <path d="M9.5 6.5 15 12l-5.5 5.5" />,
  chevU: <path d="M6.5 14.5l5.5-5.5 5.5 5.5" />,
  chevD: <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />,
  class: (
    <>
      <path d="M3.5 9.3 12 4.8l8.5 4.5L12 13.8z" />
      <path d="M7 11.8v4.2c0 1.2 2.2 2.4 5 2.4s5-1.2 5-2.4v-4.2" />
      <path d="M16.5 11v5" />
    </>
  ),
  study: (
    <>
      <path d="M12 6.6C10.4 5.1 8 4.6 5 4.9v12.2c3-.3 5.4.2 7 1.7 1.6-1.5 4-2 7-1.7V4.9c-3-.3-5.4.2-7 1.7z" />
      <path d="M12 6.6v12.2" />
    </>
  ),
  work: (
    <>
      <rect x="4" y="8.5" width="16" height="10" rx="2.5" />
      <path d="M9 8.5V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M4 13h16" />
    </>
  ),
  exercise: <path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10" />,
  meal: (
    <>
      <circle cx="10.5" cy="12" r="6.3" />
      <path d="M18.7 5.2v13.6" />
    </>
  ),
  personal: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" />
    </>
  ),
  other: <circle cx="12" cy="12" r="3.2" />,
};

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number | string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  className,
  style,
  ...rest
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      {...rest}
    >
      {SVG_PATHS[name] || SVG_PATHS.other}
    </svg>
  );
};

