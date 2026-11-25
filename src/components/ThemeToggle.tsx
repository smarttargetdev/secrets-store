import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../types/cloudflare';
import { IconTooltipButton } from './IconTooltipButton';

interface ThemeToggleProps {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
  tooltipSide?: 'top' | 'bottom';
  fullWidth?: boolean;
  iconOnly?: boolean;
}

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  shortLabel: string;
  Icon: typeof Sun;
}> = [
  { value: 'light', label: 'Tema Claro', shortLabel: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Tema Escuro', shortLabel: 'Escuro', Icon: Moon },
  { value: 'system', label: 'Tema do Sistema', shortLabel: 'Sistema', Icon: Monitor },
];

export function ThemeToggle({
  preference,
  onChange,
  tooltipSide = 'bottom',
  fullWidth = false,
  iconOnly = true,
}: ThemeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Selecionar tema da interface"
      className={`${
        fullWidth ? 'grid grid-cols-3 w-full' : 'inline-flex flex-wrap'
      } items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80`}
    >
      {OPTIONS.map(({ value, label, shortLabel, Icon }) => {
        const active = preference === value;
        return (
          <IconTooltipButton
            key={value}
            label={label}
            text={shortLabel}
            iconOnly={iconOnly}
            size="sm"
            tooltipSide={tooltipSide}
            variant={active ? 'active' : 'ghost'}
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={
              iconOnly
                ? '!w-8 !h-8 !min-w-[32px] !min-h-[32px]'
                : fullWidth
                  ? '!w-full !px-1.5 !text-[11px] !gap-1'
                  : '!px-2.5'
            }
            icon={<Icon className="w-4 h-4" />}
          />
        );
      })}
    </div>
  );
}
