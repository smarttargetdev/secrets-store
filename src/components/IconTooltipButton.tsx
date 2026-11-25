import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'active';
type TooltipSide = 'top' | 'bottom';

interface IconTooltipButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'> {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  tooltipSide?: TooltipSide;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white border border-transparent',
  secondary:
    'bg-transparent border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
  ghost:
    'bg-transparent border border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100',
  danger:
    'bg-transparent border border-slate-200 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400',
  active:
    'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 border border-slate-200 dark:border-slate-700 shadow-xs',
};

export function IconTooltipButton({
  label,
  icon,
  variant = 'secondary',
  tooltipSide = 'top',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  ...rest
}: IconTooltipButtonProps) {
  const sizeClass = fullWidth
    ? 'w-full min-h-[46px] h-12'
    : size === 'sm'
      ? 'min-w-[38px] min-h-[38px] w-[38px] h-[38px]'
      : 'min-w-[44px] min-h-[44px] w-11 h-11';

  const tooltipPos =
    tooltipSide === 'bottom'
      ? 'top-full mt-2 left-1/2 -translate-x-1/2 translate-y-1 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0'
      : 'bottom-full mb-2 left-1/2 -translate-x-1/2 -translate-y-1 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0';

  return (
    <div
      className={`relative group/tip ${
        fullWidth ? 'flex w-full flex-1' : 'inline-flex shrink-0'
      }`}
    >
      <button
        type={type}
        aria-label={label}
        title={label}
        className={`${sizeClass} rounded-xl inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${VARIANT_CLASSES[variant]} ${className}`}
        {...rest}
      >
        {icon}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${tooltipPos} z-50 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-medium whitespace-nowrap shadow-md opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 transition-all duration-150`}
      >
        {label}
      </span>
    </div>
  );
}
