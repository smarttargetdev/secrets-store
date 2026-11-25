import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  LockOpen,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { cloudflareApi } from '../lib/cloudflareApi';
import {
  createEncryptedVault,
  isValidPin,
  unlockEncryptedVault,
  wipeEncryptedVault,
} from '../lib/vaultCrypto';
import type { CloudflareProfile, ThemePreference } from '../types/cloudflare';
import { AppHeader } from './AppHeader';
import { BrandLogo } from './BrandLogo';
import { IconTooltipButton } from './IconTooltipButton';

interface VaultGateProps {
  vaultExists: boolean;
  themePreference: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onUnlocked: (pin: string, profiles: CloudflareProfile[]) => void;
  onVaultWiped: () => void;
}

const KEYPAD_NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function VaultGate({
  vaultExists,
  themePreference,
  onThemeChange,
  onUnlocked,
  onVaultWiped,
}: VaultGateProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [onboardingStep, setOnboardingStep] = useState<'pin' | 'profile'>('pin');

  // Initial Profile Form State
  const [label, setLabel] = useState('Produção');
  const [apiToken, setApiToken] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [showToken, setShowToken] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState<{
    accountName?: string;
    zoneName?: string;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Physical keyboard entry for lock screen
  useEffect(() => {
    if (!vaultExists) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (busy) return;
      if (/^\d$/.test(e.key)) {
        setPin((prev) => (prev.length < 6 ? prev + e.key : prev));
        setError(null);
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
        setError(null);
      } else if (e.key === 'Enter' && pin.length >= 4) {
        void handleUnlock();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleUnlock = async () => {
    if (!isValidPin(pin)) {
      setError('Digite seu PIN de 4 a 6 dígitos.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const profiles = await unlockEncryptedVault(pin);
      onUnlocked(pin, profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desbloquear o cofre.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const handlePinNext = () => {
    setError(null);
    if (!isValidPin(pin)) {
      setError('O PIN deve ter entre 4 e 6 dígitos numéricos.');
      return;
    }
    if (pin !== confirmPin) {
      setError('Os dois PINs digitados não coincidem.');
      return;
    }
    setOnboardingStep('profile');
  };

  const handleVerifyCredentials = async () => {
    setError(null);
    setVerifyInfo(null);
    if (!apiToken.trim()) {
      setError('Cole sua API Token da Cloudflare para validar.');
      return;
    }

    setVerifying(true);
    try {
      await cloudflareApi.verifyToken(apiToken.trim());

      let discoveredAccountId = accountId.trim();
      let discoveredAccountName = '';
      let discoveredZoneName = '';

      if (zoneId.trim()) {
        const zone = await cloudflareApi.getZone(apiToken.trim(), zoneId.trim());
        discoveredZoneName = zone.name;
        if (!discoveredAccountId && zone.account?.id) {
          discoveredAccountId = zone.account.id;
          discoveredAccountName = zone.account.name;
        }
      }

      if (!discoveredAccountId) {
        const accounts = await cloudflareApi.listAccounts(apiToken.trim());
        if (accounts.length > 0) {
          discoveredAccountId = accounts[0].id;
          discoveredAccountName = accounts[0].name;
        }
      }

      if (discoveredAccountId) {
        setAccountId(discoveredAccountId);
      }
      setVerifyInfo({
        accountName: discoveredAccountName || undefined,
        zoneName: discoveredZoneName || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar o token.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setError(null);
    if (!apiToken.trim()) {
      setError('A API Token da Cloudflare é obrigatória.');
      return;
    }
    if (zoneId.trim() && !/^[a-f0-9]{32}$/i.test(zoneId.trim())) {
      setError('Zone ID inválido. Use 32 caracteres hexadecimais ou deixe em branco.');
      return;
    }

    setBusy(true);
    try {
      let resolvedAccountId = accountId.trim();
      let resolvedAccountName = verifyInfo?.accountName;
      let resolvedZoneName = verifyInfo?.zoneName;

      await cloudflareApi.verifyToken(apiToken.trim());

      if (zoneId.trim() && !resolvedZoneName) {
        try {
          const zone = await cloudflareApi.getZone(apiToken.trim(), zoneId.trim());
          resolvedZoneName = zone.name;
          if (!resolvedAccountId && zone.account?.id) {
            resolvedAccountId = zone.account.id;
            resolvedAccountName = zone.account.name;
          }
        } catch {
          // Allow saving if token only has Workers/Secrets Store permissions without Zone Read
        }
      }

      if (!resolvedAccountId) {
        try {
          const accounts = await cloudflareApi.listAccounts(apiToken.trim());
          if (accounts.length > 0) {
            resolvedAccountId = accounts[0].id;
            resolvedAccountName = accounts[0].name;
          }
        } catch {
          // Account ID can be supplied manually if token lacks Account:Read
        }
      }

      if (!resolvedAccountId) {
        throw new Error(
          'Informe o Account ID manualmente ou use um token com permissão de leitura de conta.'
        );
      }

      const now = new Date().toISOString();
      const firstProfile: CloudflareProfile = {
        id: `cf_${Date.now()}`,
        label: label.trim() || resolvedAccountName || 'Conta Cloudflare',
        apiToken: apiToken.trim(),
        zoneId: zoneId.trim(),
        accountId: resolvedAccountId,
        accountName: resolvedAccountName,
        zoneName: resolvedZoneName,
        createdAt: now,
        updatedAt: now,
      };

      await createEncryptedVault(pin, [firstProfile]);
      onUnlocked(pin, [firstProfile]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar cofre.');
    } finally {
      setBusy(false);
    }
  };

  const handleWipe = () => {
    wipeEncryptedVault();
    setPin('');
    setConfirmPin('');
    setConfirmWipe(false);
    setError(null);
    onVaultWiped();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <AppHeader
        selectedPanel={
          vaultExists
            ? 'Desbloqueio do Cofre'
            : onboardingStep === 'pin'
              ? 'Configuração Inicial · Passo 1 de 2'
              : 'Configuração Inicial · Passo 2 de 2'
        }
        themePreference={themePreference}
        onThemeChange={onThemeChange}
        containerClassName="max-w-6xl mx-auto"
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 flex items-center justify-center">
        {vaultExists ? (
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col items-center text-center mb-6">
              <BrandLogo size="lg" className="mb-4" />
              <h1 className="font-display text-2xl font-bold tracking-tight text-balance">
                Desbloquear cofre Cloudflare
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Digite seu PIN de 4 a 6 dígitos para descriptografar os perfis salvos neste dispositivo.
              </p>
            </div>

            {/* PIN Dots */}
            <div className="flex items-center justify-center gap-3 mb-6" aria-label="PIN digitado">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const filled = idx < pin.length;
                return (
                  <div
                    key={idx}
                    className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                      filled
                        ? 'bg-orange-600 dark:bg-orange-500 border-orange-600 dark:border-orange-500'
                        : 'border-slate-300 dark:border-slate-700 bg-transparent'
                    }`}
                  />
                );
              })}
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium text-center"
              >
                {error}
              </div>
            )}

            {/* Tactile Numeric Keypad (>= 48px targets) */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {KEYPAD_NUMS.map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setPin((prev) => (prev.length < 6 ? prev + num : prev));
                  }}
                  className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] text-lg font-mono font-semibold tabular-nums transition-transform focus-visible:outline-2 focus-visible:outline-orange-500"
                >
                  {num}
                </button>
              ))}
              <div className="h-14 flex items-center justify-center">
                <IconTooltipButton
                  label="Limpar PIN"
                  text="Limpar"
                  disabled={busy}
                  fullWidth
                  onClick={() => {
                    setPin('');
                    setError(null);
                  }}
                  className="!h-14 !px-2 !text-xs"
                  icon={<RotateCcw className="w-4 h-4" />}
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setPin((prev) => (prev.length < 6 ? prev + '0' : prev));
                }}
                className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] text-lg font-mono font-semibold tabular-nums transition-transform"
              >
                0
              </button>
              <div className="h-14 flex items-center justify-center">
                <IconTooltipButton
                  label="Apagar último dígito"
                  text="Apagar"
                  disabled={busy}
                  fullWidth
                  onClick={() => setPin((prev) => prev.slice(0, -1))}
                  className="!h-14 !px-2 !text-xs"
                  icon={<Delete className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="flex justify-center">
              <IconTooltipButton
                label={busy ? 'Desbloqueando...' : 'Desbloquear Cofre'}
                variant="primary"
                fullWidth
                disabled={busy || pin.length < 4}
                onClick={handleUnlock}
                icon={<LockOpen className="w-5 h-5" />}
              />
            </div>

            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center">
              {!confirmWipe ? (
                <div className="flex justify-center">
                  <IconTooltipButton
                    label="Esqueci meu PIN · Redefinir cofre local"
                    text="Redefinir cofre local"
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmWipe(true)}
                    icon={<Trash2 className="w-4 h-4" />}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                    Isso removerá todos os perfis salvos neste navegador. Deseja continuar?
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <IconTooltipButton
                      label="Cancelar"
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmWipe(false)}
                      icon={<X className="w-4 h-4" />}
                    />
                    <IconTooltipButton
                      label="Confirmar limpeza do cofre"
                      text="Limpar cofre"
                      size="sm"
                      variant="primary"
                      onClick={handleWipe}
                      className="!bg-red-600 hover:!bg-red-700"
                      icon={<Check className="w-4 h-4" />}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            {/* Left contextual column */}
            <div className="lg:col-span-2 space-y-5 pt-2">
              <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
                Passo {onboardingStep === 'pin' ? '1 de 2' : '2 de 2'} · Configuração inicial
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight text-balance">
                Gerencie seus secrets da Cloudflare com segurança local
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Seus API Tokens, Zone IDs e contas são cifrados no dispositivo com AES-256-GCM derivado do seu PIN. O servidor local atua apenas como proxy sem armazenar credenciais.
              </p>
              <div className="pt-2 space-y-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <p>Workers Secrets · Criar, rotacionar em lote e excluir variáveis</p>
                <p>Secrets Store · Gerenciar stores, escopos e duplicação</p>
                <p>Exportação React Native · Módulo pronto com react-native-keychain</p>
              </div>
            </div>

            {/* Right setup card */}
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
              {onboardingStep === 'pin' ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold">Defina o PIN do cofre</h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Use de 4 a 6 dígitos numéricos para proteger seus perfis.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="setup-pin" className="block text-xs font-semibold mb-1.5">
                      PIN numérico (4 a 6 dígitos)
                    </label>
                    <input
                      id="setup-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => {
                        setError(null);
                        setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                      }}
                      placeholder="••••"
                      className="w-full h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-pin" className="block text-xs font-semibold mb-1.5">
                      Confirmar PIN
                    </label>
                    <input
                      id="confirm-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={confirmPin}
                      onChange={(e) => {
                        setError(null);
                        setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handlePinNext();
                      }}
                      placeholder="••••"
                      className="w-full h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium"
                    >
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <IconTooltipButton
                      label="Continuar para Credenciais Cloudflare"
                      variant="primary"
                      fullWidth
                      onClick={handlePinNext}
                      icon={<ArrowRight className="w-5 h-5" />}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-lg font-bold">
                        Adicionar primeiro perfil Cloudflare
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Insira sua API Token e Zone ID ou Account ID.
                      </p>
                    </div>
                    <IconTooltipButton
                      label="Voltar ao PIN"
                      text="Voltar"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setError(null);
                        setOnboardingStep('pin');
                      }}
                      icon={<ArrowLeft className="w-4 h-4" />}
                    />
                  </div>

                  <div>
                    <label htmlFor="init-label" className="block text-xs font-semibold mb-1.5">
                      Nome do Perfil
                    </label>
                    <input
                      id="init-label"
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Ex: Produção"
                      className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="init-token" className="block text-xs font-semibold mb-1.5">
                      Cloudflare API Token
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="init-token"
                        type={showToken ? 'text' : 'password'}
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value)}
                        placeholder="Cole o Bearer Token criado no painel Cloudflare"
                        className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <IconTooltipButton
                        label={showToken ? 'Ocultar token' : 'Mostrar token'}
                        text={showToken ? 'Ocultar' : 'Mostrar'}
                        variant="secondary"
                        onClick={() => setShowToken((prev) => !prev)}
                        icon={showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="init-zone" className="block text-xs font-semibold mb-1.5">
                        Zone ID (opcional)
                      </label>
                      <input
                        id="init-zone"
                        type="text"
                        value={zoneId}
                        onChange={(e) => setZoneId(e.target.value)}
                        placeholder="32 caracteres hexadecimais"
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="init-account" className="block text-xs font-semibold mb-1.5">
                        Account ID (auto-detectável)
                      </label>
                      <input
                        id="init-account"
                        type="text"
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        placeholder="Detectado ao verificar"
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  {verifyInfo && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Token válido
                        {verifyInfo.accountName ? ` · Conta: ${verifyInfo.accountName}` : ''}
                        {verifyInfo.zoneName ? ` · Zona: ${verifyInfo.zoneName}` : ''}
                      </span>
                    </div>
                  )}

                  {error && (
                    <div
                      role="alert"
                      className="px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium"
                    >
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
                    <IconTooltipButton
                      label={verifying ? 'Verificando token...' : 'Verificar Token & Zone ID'}
                      text={verifying ? 'Verificando...' : 'Verificar Token'}
                      variant="secondary"
                      disabled={verifying || busy}
                      onClick={handleVerifyCredentials}
                      icon={<ShieldCheck className="w-5 h-5" />}
                    />
                    <IconTooltipButton
                      label={busy ? 'Criptografando...' : 'Salvar Cofre e Entrar'}
                      variant="primary"
                      fullWidth
                      disabled={busy || verifying}
                      onClick={handleCompleteOnboarding}
                      icon={<Check className="w-5 h-5" />}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
