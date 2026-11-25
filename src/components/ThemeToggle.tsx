import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../types/cloudflare';
import { IconTooltipButton } from './IconTooltipButton';

interface ThemeToggleProps {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
  tooltipSide?: 'top' | 'bottom';
}

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Tema Claro', Icon: Sun },
  { value: 'dark', label: 'Tema Escuro', Icon: Moon },
  { value: 'system', label: 'Tema do Sistema', Icon: Monitor },
];

export function ThemeToggle({
  preference,
  onChange,
  tooltipSide = 'bottom',
}: ThemeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Selecionar tema da interface"
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <IconTooltipButton
            key={value}
            label={label}
            size="sm"
            tooltipSide={tooltipSide}
            variant={active ? 'active' : 'ghost'}
            aria-pressed={active}
            onClick={() => onChange(value)}
            icon={<Icon className="w-4 h-4" />}
          />
        );
      })}
    </div>
  );
}
