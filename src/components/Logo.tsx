import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ className = '', size = 'md' }: LogoProps) {
  // Adapt height dynamically for layout header constraints but default to 100px as requested
  const height = size === 'sm' ? '36px' : size === 'lg' ? '140px' : '100px';

  return (
    <img
      src="/logo.jpg"
      alt="SyncAI Consultancy Pvt. Ltd."
      style={{ height, width: "auto" }}
      className={className}
    />
  );
}


