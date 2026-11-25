import { useState } from 'react';
import { Target } from 'lucide-react';

export const BRAND_LOGO_URL = 'https://assets.smarttarget.com.br/company/target.svg';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);
  const dimClass = SIZE_CLASSES[size];

  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`${dimClass} inline-flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 shrink-0 ${className}`}
      >
        <Target className="w-full h-full" />
      </span>
    );
  }

  return (
    <img
      src={BRAND_LOGO_URL}
      alt="Secrets Manager"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dimClass} object-contain shrink-0 transition-[filter] duration-150 dark:brightness-110 dark:drop-shadow-[0_0_8px_rgba(255,255,255,0.22)] ${className}`}
    />
  );
}
