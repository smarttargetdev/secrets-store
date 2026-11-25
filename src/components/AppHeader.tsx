import { Lock } from 'lucide-react';
import type { CloudflareProfile, ThemePreference } from '../types/cloudflare';
import { BrandLogo } from './BrandLogo';
import { IconTooltipButton } from './IconTooltipButton';
import { ThemeToggle } from './ThemeToggle';

interface AppHeaderProps {
  selectedPanel: string;
  themePreference: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onLock?: () => void;
  activeProfile?: CloudflareProfile | null;
  containerClassName?: string;
}

export function AppHeader({
  selectedPanel,
  themePreference,
  onThemeChange,
  onLock,
  activeProfile,
  containerClassName = 'w-full',
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div
        className={`h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 ${containerClassName}`}
      >
        {/* Brand Logo + App Name + Selected Panel subtitle */}
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo size="md" className="shrink-0" />
          <div className="min-w-0">
            <span className="block font-display font-bold text-base sm:text-lg tracking-tight leading-tight text-slate-900 dark:text-slate-100 truncate">
              Secrets Manager
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight truncate mt-0.5">
              {selectedPanel}
            </p>
          </div>
        </div>

        {/* Right Controls: Active Profile context (desktop) + Icon-only Theme & Lock */}
        <div className="flex items-center gap-2.5 shrink-0">
          {activeProfile && (
            <div className="hidden lg:block text-xs text-slate-500 dark:text-slate-400 mr-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {activeProfile.label}
              </span>
              {activeProfile.zoneName ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono">{activeProfile.zoneName}</span>
                </>
              ) : null}
            </div>
          )}

          <ThemeToggle
            preference={themePreference}
            onChange={onThemeChange}
            iconOnly
            tooltipSide="bottom"
          />

          {onLock && (
            <IconTooltipButton
              label="Bloquear Cofre"
              iconOnly
              tooltipSide="bottom"
              size="sm"
              variant="secondary"
              onClick={onLock}
              icon={<Lock className="w-4 h-4" />}
            />
          )}
        </div>
      </div>
    </header>
  );
}
