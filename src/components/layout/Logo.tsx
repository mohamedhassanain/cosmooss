import React from 'react';
import { useSiteSettings } from '@/hooks/useSiteSettings';

interface LogoProps {
  className?: string;
  title?: string;
}

function InlineSVG({ className = 'h-16 w-16', title = 'Cosmooss' }: Readonly<{ className?: string; title?: string }>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8c8d8" />
          <stop offset="100%" stopColor="#f0a0b8" />
        </linearGradient>
        <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a8d8b8" />
          <stop offset="100%" stopColor="#88c8a0" />
        </linearGradient>
      </defs>
      
      <rect width="100" height="100" rx="25" fill="url(#logoGrad)" />
      
      {/* Cosmetics flower/leaf icon */}
      <g transform="translate(20, 20)" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Petals */}
        <circle cx="30" cy="20" r="12" fill="white" fillOpacity="0.4" stroke="none" />
        <circle cx="18" cy="30" r="10" fill="white" fillOpacity="0.3" stroke="none" />
        <circle cx="42" cy="30" r="10" fill="white" fillOpacity="0.3" stroke="none" />
        <circle cx="24" cy="18" r="8" fill="white" fillOpacity="0.35" stroke="none" />
        <circle cx="36" cy="18" r="8" fill="white" fillOpacity="0.35" stroke="none" />
        
        {/* Center */}
        <circle cx="30" cy="28" r="6" fill="white" fillOpacity="0.8" stroke="none" />
        
        {/* Stem */}
        <path d="M30 34 Q30 42 30 50" stroke="white" strokeWidth="3" />
        
        {/* Leaf */}
        <path d="M30 42 Q38 38 42 44 Q38 46 30 42" fill="url(#leafGrad)" stroke="none" />
        <path d="M30 38 Q22 34 18 40 Q22 42 30 38" fill="url(#leafGrad)" stroke="none" />
      </g>
    </svg>
  );
}

export default function Logo({ className = 'h-16 w-16', title = 'Cosmooss' }: Readonly<LogoProps>) {
  const { settings } = useSiteSettings();

  if (settings?.logo_url) {
    return <img src={settings.logo_url} alt={title} className={`${className} object-contain`} />;
  }

  return <InlineSVG className={className} title={title} />;
}
