import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { DashboardSecretsView } from './components/DashboardSecretsView';
import { IconTooltipButton } from './components/IconTooltipButton';
import { ProfilesView } from './components/ProfilesView';
import { ReactNativeExporterView } from './components/ReactNativeExporterView';
import { SecretsStoreView } from './components/SecretsStoreView';
import { ThemeToggle } from './components/ThemeToggle';
import { VaultGate } from './components/VaultGate';
import { useTheme } from './hooks/useTheme';
import { hasEncryptedVault, saveEncryptedProfiles } from './lib/vaultCrypto';
import type { AppTab, CloudflareProfile } from './types/cloudflare';

const NAV_ITEMS: Array<{ id: AppTab; label: string; shortLabel: string; Icon: typeof KeyRound }> = [
  { id: 'dashboard', label: 'Workers Secrets', shortLabel: 'Workers', Icon: KeyRound },
  { id: 'secrets-store', label: 'Secrets Store', shortLabel: 'Stores', Icon: Layers },
  { id: 'profiles', label: 'Perfis & PIN', shortLabel: 'Perfis', Icon: Users },
  { id: 'react-native', label: 'Módulo React Native', shortLabel: 'RN Code', Icon: Code2 },
];

export default function App() {
  const { preference, setPreference } = useTheme();

  const [vaultExists, setVaultExists] = useState<boolean>(() => hasEncryptedVault());
  const [vaultPin, setVaultPin] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<CloudflareProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null,
    [profiles, activeProfileId]
  );

  const handleUnlocked = (pin: string, unlockedProfiles: CloudflareProfile[]) => {
    setVaultPin(pin);
    setProfiles(unlockedProfiles);
    setVaultExists(true);
    if (unlockedProfiles[0]) {
      setActiveProfileId(unlockedProfiles[0].id);
    }
  };

  const handleLock = () => {
    setVaultPin(null);
    setProfiles([]);
    setActiveProfileId('');
  };

  const handleVaultWiped = () => {
    setVaultPin(null);
    setProfiles([]);
    setActiveProfileId('');
    setVaultExists(false);
  };

  const handleSaveProfiles = async (next: CloudflareProfile[]) => {
    if (!vaultPin) return;
    await saveEncryptedProfiles(vaultPin, next);
    setProfiles(next);
  };

  if (!vaultPin || !activeProfile) {
    return (
      <VaultGate
        vaultExists={vaultExists}
        themePreference={preference}
        onThemeChange={setPreference}
        onUnlocked={handleUnlocked}
        onVaultWiped={handleVaultWiped}
      />
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-600 dark:bg-orange-500 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight whitespace-nowrap">
            CF Vault
          </span>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <label
            htmlFor="sidebar-profile-select"
            className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400"
          >
            Perfil Ativo
          </label>
          <select
            id="sidebar-profile-select"
            value={activeProfile.id}
            onChange={(e) => {
              setActiveProfileId(e.target.value);
              const chosen = profiles.find((p) => p.id === e.target.value);
              if (chosen) setToast(`Perfil ativo: ${chosen.label}`);
            }}
            className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Navegação principal">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-orange-600/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <ThemeToggle preference={preference} onChange={setPreference} tooltipSide="top" />
          <IconTooltipButton
            label="Bloquear Cofre"
            tooltipSide="top"
            variant="secondary"
            onClick={handleLock}
            icon={<Lock className="w-4 h-4" />}
          />
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (52px mobile, 64px desktop) */}
        <header className="sticky top-0 z-30 h-[52px] lg:h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden w-7 h-7 rounded-lg bg-orange-600 dark:bg-orange-500 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <h1 className="font-display font-bold text-base lg:text-lg truncate">
              {currentNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <select
              aria-label="Selecionar perfil Cloudflare"
              value={activeProfile.id}
              onChange={(e) => setActiveProfileId(e.target.value)}
              className="lg:hidden h-9 max-w-[140px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold truncate"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <div className="lg:hidden">
              <IconTooltipButton
                label="Bloquear Cofre"
                tooltipSide="bottom"
                size="sm"
                variant="secondary"
                onClick={handleLock}
                icon={<Lock className="w-4 h-4" />}
              />
            </div>

            <div className="hidden lg:block text-xs text-slate-500 dark:text-slate-400">
              <span>{activeProfile.label}</span>
              {activeProfile.zoneName ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono">{activeProfile.zoneName}</span>
                </>
              ) : null}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8">
          {activeTab === 'dashboard' && (
            <DashboardSecretsView
              profile={activeProfile}
              onNotify={setToast}
              onOpenSecretsStore={() => setActiveTab('secrets-store')}
            />
          )}

          {activeTab === 'secrets-store' && (
            <SecretsStoreView profile={activeProfile} onNotify={setToast} />
          )}

          {activeTab === 'profiles' && (
            <ProfilesView
              profiles={profiles}
              activeProfileId={activeProfile.id}
              vaultPin={vaultPin}
              themePreference={preference}
              onThemeChange={setPreference}
              onSelectProfile={setActiveProfileId}
              onSaveProfiles={handleSaveProfiles}
              onPinChanged={setVaultPin}
              onLockNow={handleLock}
              onVaultWiped={handleVaultWiped}
              onNotify={setToast}
            />
          )}

          {activeTab === 'react-native' && <ReactNativeExporterView />}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (56px height, keeping total sticky <= 15% viewport) */}
      <nav
        aria-label="Navegação móvel"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center"
      >
        {NAV_ITEMS.map(({ id, shortLabel, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active
                  ? 'text-orange-600 dark:text-orange-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span className="text-[10px] leading-tight whitespace-nowrap">{shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Non-blocking feedback toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-16 lg:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 px-4 py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg flex items-center gap-2.5 text-xs font-medium"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span className="flex-1">{toast}</span>
        </div>
      )}
    </div>
  );
}
