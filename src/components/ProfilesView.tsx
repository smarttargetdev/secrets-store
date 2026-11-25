import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { cloudflareApi } from '../lib/cloudflareApi';
import { changeVaultPin, isValidPin, wipeEncryptedVault } from '../lib/vaultCrypto';
import type { CloudflareProfile, ThemePreference } from '../types/cloudflare';
import { IconTooltipButton } from './IconTooltipButton';
import { ThemeToggle } from './ThemeToggle';

interface ProfilesViewProps {
  profiles: CloudflareProfile[];
  activeProfileId: string;
  vaultPin: string;
  themePreference: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onSelectProfile: (id: string) => void;
  onSaveProfiles: (next: CloudflareProfile[]) => Promise<void>;
  onPinChanged: (newPin: string) => void;
  onLockNow: () => void;
  onVaultWiped: () => void;
  onNotify: (msg: string) => void;
}

export function ProfilesView({
  profiles,
  activeProfileId,
  vaultPin,
  themePreference,
  onThemeChange,
  onSelectProfile,
  onSaveProfiles,
  onPinChanged,
  onLockNow,
  onVaultWiped,
  onNotify,
}: ProfilesViewProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Change PIN form
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Wipe vault
  const [confirmWipe, setConfirmWipe] = useState(false);

  const openCreateForm = () => {
    setEditingId(null);
    setLabel('');
    setApiToken('');
    setZoneId('');
    setAccountId('');
    setShowToken(false);
    setProfileError(null);
    setVerifyMsg(null);
    setFormOpen(true);
  };

  const openEditForm = (p: CloudflareProfile) => {
    setEditingId(p.id);
    setLabel(p.label);
    setApiToken(p.apiToken);
    setZoneId(p.zoneId);
    setAccountId(p.accountId);
    setShowToken(false);
    setProfileError(null);
    setVerifyMsg(null);
    setFormOpen(true);
  };

  const handleVerify = async () => {
    setProfileError(null);
    setVerifyMsg(null);
    if (!apiToken.trim()) {
      setProfileError('Informe a API Token para validar.');
      return;
    }
    setVerifying(true);
    try {
      await cloudflareApi.verifyToken(apiToken.trim());
      let resolvedAcc = accountId.trim();
      let accName = '';
      let zName = '';

      if (zoneId.trim()) {
        const zone = await cloudflareApi.getZone(apiToken.trim(), zoneId.trim());
        zName = zone.name;
        if (!resolvedAcc && zone.account?.id) {
          resolvedAcc = zone.account.id;
          accName = zone.account.name;
        }
      }

      if (!resolvedAcc) {
        const accounts = await cloudflareApi.listAccounts(apiToken.trim());
        if (accounts.length > 0) {
          resolvedAcc = accounts[0].id;
          accName = accounts[0].name;
        }
      }

      if (resolvedAcc) setAccountId(resolvedAcc);
      setVerifyMsg(
        `Credenciais válidas${accName ? ` · Conta: ${accName}` : ''}${zName ? ` · Zona: ${zName}` : ''}`
      );
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Falha ao validar credenciais.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);

    if (!apiToken.trim()) {
      setProfileError('A API Token é obrigatória.');
      return;
    }
    if (zoneId.trim() && !/^[a-f0-9]{32}$/i.test(zoneId.trim())) {
      setProfileError('Zone ID inválido (deve conter 32 caracteres hexadecimais).');
      return;
    }

    setSavingProfile(true);
    try {
      let resolvedAccId = accountId.trim();
      let resolvedAccName: string | undefined;
      let resolvedZoneName: string | undefined;

      await cloudflareApi.verifyToken(apiToken.trim());

      if (zoneId.trim()) {
        try {
          const zone = await cloudflareApi.getZone(apiToken.trim(), zoneId.trim());
          resolvedZoneName = zone.name;
          if (!resolvedAccId && zone.account?.id) {
            resolvedAccId = zone.account.id;
            resolvedAccName = zone.account.name;
          }
        } catch {
          // Zone read permission optional
        }
      }

      if (!resolvedAccId) {
        try {
          const accounts = await cloudflareApi.listAccounts(apiToken.trim());
          if (accounts.length > 0) {
            resolvedAccId = accounts[0].id;
            resolvedAccName = accounts[0].name;
          }
        } catch {
          // ignore
        }
      }

      if (!resolvedAccId) {
        throw new Error('Informe o Account ID manualmente ou use um token com leitura de conta.');
      }

      const now = new Date().toISOString();
      if (editingId) {
        const next = profiles.map((p) =>
          p.id === editingId
            ? {
                ...p,
                label: label.trim() || resolvedAccName || p.label,
                apiToken: apiToken.trim(),
                zoneId: zoneId.trim(),
                accountId: resolvedAccId,
                accountName: resolvedAccName ?? p.accountName,
                zoneName: resolvedZoneName ?? p.zoneName,
                updatedAt: now,
              }
            : p
        );
        await onSaveProfiles(next);
        onNotify('Perfil atualizado no cofre cifrado.');
      } else {
        const newProfile: CloudflareProfile = {
          id: `cf_${Date.now()}`,
          label: label.trim() || resolvedAccName || 'Novo Perfil Cloudflare',
          apiToken: apiToken.trim(),
          zoneId: zoneId.trim(),
          accountId: resolvedAccId,
          accountName: resolvedAccName,
          zoneName: resolvedZoneName,
          createdAt: now,
          updatedAt: now,
        };
        const next = [newProfile, ...profiles];
        await onSaveProfiles(next);
        onSelectProfile(newProfile.id);
        onNotify(`Perfil "${newProfile.label}" salvo e ativado.`);
      }

      setFormOpen(false);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRemoveProfile = async (id: string) => {
    if (profiles.length <= 1) return;
    const next = profiles.filter((p) => p.id !== id);
    await onSaveProfiles(next);
    if (activeProfileId === id && next[0]) {
      onSelectProfile(next[0].id);
    }
    setConfirmRemoveId(null);
    onNotify('Perfil removido do cofre.');
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (oldPin !== vaultPin) {
      setPinError('PIN atual incorreto.');
      return;
    }
    if (!isValidPin(newPin)) {
      setPinError('O novo PIN deve conter entre 4 e 6 dígitos numéricos.');
      return;
    }
    setChangingPin(true);
    try {
      await changeVaultPin(oldPin, newPin);
      onPinChanged(newPin);
      setOldPin('');
      setNewPin('');
      onNotify('PIN do cofre atualizado com sucesso.');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Erro ao alterar PIN.');
    } finally {
      setChangingPin(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Profiles List */}
      <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">Perfis Cloudflare no Cofre</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Múltiplas contas cifradas localmente com AES-256-GCM
            </p>
          </div>
          <IconTooltipButton
            label="Adicionar perfil Cloudflare"
            text="Novo Perfil"
            variant="primary"
            tooltipSide="bottom"
            onClick={openCreateForm}
            icon={<Plus className="w-4 h-4" />}
          />
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const confirmingRemove = confirmRemoveId === p.id;
            return (
              <li
                key={p.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display font-bold text-sm truncate">{p.label}</p>
                    {isActive && (
                      <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                        · Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                    Account: {p.accountId}
                    {p.zoneId ? ` · Zone: ${p.zoneId.slice(0, 10)}...` : ''}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                    Atualizado em {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {!isActive && (
                    <IconTooltipButton
                      label={`Ativar perfil ${p.label}`}
                      text="Ativar"
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        onSelectProfile(p.id);
                        onNotify(`Perfil ativo alterado para "${p.label}".`);
                      }}
                      icon={<UserCheck className="w-3.5 h-3.5" />}
                    />
                  )}

                  <IconTooltipButton
                    label={`Editar perfil ${p.label}`}
                    text="Editar"
                    size="sm"
                    variant="secondary"
                    onClick={() => openEditForm(p)}
                    icon={<Pencil className="w-3.5 h-3.5" />}
                  />

                  {profiles.length > 1 &&
                    (confirmingRemove ? (
                      <>
                        <IconTooltipButton
                          label="Cancelar remoção"
                          text="Cancelar"
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirmRemoveId(null)}
                          icon={<X className="w-3.5 h-3.5" />}
                        />
                        <IconTooltipButton
                          label="Confirmar remoção do perfil"
                          text="Confirmar"
                          size="sm"
                          variant="primary"
                          onClick={() => void handleRemoveProfile(p.id)}
                          className="!bg-red-600 hover:!bg-red-700"
                          icon={<Check className="w-3.5 h-3.5" />}
                        />
                      </>
                    ) : (
                      <IconTooltipButton
                        label={`Remover perfil ${p.label}`}
                        text="Remover"
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmRemoveId(p.id)}
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                      />
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Right Column: Theme, Lock & PIN Security */}
      <div className="lg:col-span-5 space-y-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="font-display text-base font-bold">Aparência do Aplicativo</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Alterne entre tema Claro, Escuro ou sincronizado com o Sistema.
            </p>
          </div>
          <ThemeToggle preference={themePreference} onChange={onThemeChange} />
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold">Segurança & PIN</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Altere o PIN do cofre ou bloqueie a sessão em memória.
              </p>
            </div>
            <IconTooltipButton
              label="Bloquear cofre agora"
              iconOnly
              size="sm"
              variant="secondary"
              onClick={onLockNow}
              icon={<Lock className="w-4 h-4" />}
            />
          </div>

          <form onSubmit={handleChangePin} className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="old-pin" className="block text-xs font-medium mb-1">
                  PIN atual
                </label>
                <input
                  id="old-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="new-pin" className="block text-xs font-medium mb-1">
                  Novo PIN (4-6 dígitos)
                </label>
                <input
                  id="new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm"
                />
              </div>
            </div>

            {pinError && <p className="text-xs text-red-600 dark:text-red-400">{pinError}</p>}

            <div className="flex justify-end">
              <IconTooltipButton
                type="submit"
                label={changingPin ? 'Recriptografando...' : 'Atualizar PIN'}
                variant="primary"
                fullWidth
                disabled={changingPin}
                icon={<KeyRound className="w-4 h-4" />}
              />
            </div>
          </form>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {confirmWipe ? 'Confirmar limpeza total do cofre?' : 'Redefinir cofre local'}
            </span>
            {!confirmWipe ? (
              <IconTooltipButton
                label="Apagar todos os perfis e redefinir cofre"
                text="Redefinir"
                size="sm"
                variant="danger"
                onClick={() => setConfirmWipe(true)}
                icon={<ShieldAlert className="w-4 h-4" />}
              />
            ) : (
              <div className="flex gap-2">
                <IconTooltipButton
                  label="Cancelar"
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmWipe(false)}
                  icon={<X className="w-3.5 h-3.5" />}
                />
                <IconTooltipButton
                  label="Confirmar limpeza total"
                  text="Confirmar"
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    wipeEncryptedVault();
                    onVaultWiped();
                  }}
                  className="!bg-red-600 hover:!bg-red-700"
                  icon={<Check className="w-3.5 h-3.5" />}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Add / Edit Profile Sheet */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 lg:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full lg:max-w-lg bg-white dark:bg-slate-900 border-t lg:border border-slate-200 dark:border-slate-800 rounded-t-3xl lg:rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="lg:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <h3 className="font-display text-lg font-bold">
              {editingId ? 'Editar Perfil Cloudflare' : 'Novo Perfil Cloudflare'}
            </h3>
            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label htmlFor="prof-label" className="block text-xs font-semibold mb-1">
                  Nome do Perfil
                </label>
                <input
                  id="prof-label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex: Staging ou Cliente X"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div>
                <label htmlFor="prof-token" className="block text-xs font-semibold mb-1">
                  Cloudflare API Token
                </label>
                <div className="flex gap-2">
                  <input
                    id="prof-token"
                    type={showToken ? 'text' : 'password'}
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Bearer Token"
                    className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs"
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
                  <label htmlFor="prof-zone" className="block text-xs font-semibold mb-1">
                    Zone ID
                  </label>
                  <input
                    id="prof-zone"
                    type="text"
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    placeholder="32 hex chars (opcional)"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="prof-acc" className="block text-xs font-semibold mb-1">
                    Account ID
                  </label>
                  <input
                    id="prof-acc"
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="Auto-detectado ao verificar"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs"
                  />
                </div>
              </div>

              {verifyMsg && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{verifyMsg}</span>
                </p>
              )}

              {profileError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                  {profileError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                <IconTooltipButton
                  label="Cancelar"
                  variant="secondary"
                  onClick={() => setFormOpen(false)}
                  icon={<X className="w-4 h-4" />}
                />
                <IconTooltipButton
                  label={verifying ? 'Validando token...' : 'Validar Token & Zone ID'}
                  text={verifying ? 'Validando...' : 'Validar Token'}
                  variant="secondary"
                  disabled={verifying}
                  onClick={() => void handleVerify()}
                  icon={<ShieldCheck className="w-4 h-4" />}
                />
                <IconTooltipButton
                  type="submit"
                  label={savingProfile ? 'Salvando perfil...' : 'Salvar Perfil'}
                  variant="primary"
                  disabled={savingProfile}
                  icon={<Check className="w-4 h-4" />}
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
