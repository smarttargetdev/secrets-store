import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cloudflareApi } from '../lib/cloudflareApi';
import type { CloudflareProfile, SecretStore, StoreSecret } from '../types/cloudflare';
import { IconTooltipButton } from './IconTooltipButton';
import { SecretEditorSheet, type SecretEditorTarget } from './SecretEditorSheet';

interface SecretsStoreViewProps {
  profile: CloudflareProfile;
  onNotify: (msg: string) => void;
}

export function SecretsStoreView({ profile, onNotify }: SecretsStoreViewProps) {
  const [stores, setStores] = useState<SecretStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [secrets, setSecrets] = useState<StoreSecret[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newStoreOpen, setNewStoreOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);

  const [editorTarget, setEditorTarget] = useState<SecretEditorTarget | null>(null);
  const [confirmDeleteSecretId, setConfirmDeleteSecretId] = useState<string | null>(null);
  const [confirmDeleteStoreId, setConfirmDeleteStoreId] = useState<string | null>(null);

  const [duplicateTarget, setDuplicateTarget] = useState<StoreSecret | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);
  const [copiedValueId, setCopiedValueId] = useState<string | null>(null);
  const [maskValues, setMaskValues] = useState(true);
  const [sessionValues, setSessionValues] = useState<Record<string, string>>({});
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSessionValues({});
    setMaskValues(true);
  }, [profile.id]);

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    setError(null);
    try {
      const items = await cloudflareApi.listSecretStores(profile.apiToken, profile.accountId);
      setStores(items);
      setSelectedStoreId((prev) =>
        prev && items.some((s) => s.id === prev) ? prev : items[0]?.id ?? ''
      );
    } catch (err) {
      setStores([]);
      setSelectedStoreId('');
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar Secret Stores. Verifique a permissão Secrets Store: Read.'
      );
    } finally {
      setLoadingStores(false);
    }
  }, [profile.apiToken, profile.accountId]);

  const loadStoreSecrets = useCallback(async () => {
    if (!selectedStoreId) {
      setSecrets([]);
      return;
    }
    setLoadingSecrets(true);
    setError(null);
    try {
      const items = await cloudflareApi.listStoreSecrets(
        profile.apiToken,
        profile.accountId,
        selectedStoreId
      );
      setSecrets([...items].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setSecrets([]);
      setError(
        err instanceof Error ? err.message : 'Erro ao listar secrets deste Store.'
      );
    } finally {
      setLoadingSecrets(false);
    }
  }, [profile.apiToken, profile.accountId, selectedStoreId]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    void loadStoreSecrets();
  }, [loadStoreSecrets]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId]
  );

  const filteredSecrets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return secrets;
    return secrets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.comment ?? '').toLowerCase().includes(q)
    );
  }, [secrets, searchQuery]);

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    setCreatingStore(true);
    setError(null);
    try {
      const created = await cloudflareApi.createSecretStore(
        profile.apiToken,
        profile.accountId,
        newStoreName.trim()
      );
      setNewStoreName('');
      setNewStoreOpen(false);
      onNotify(`Store "${created[0]?.name || newStoreName}" criado.`);
      await loadStores();
      if (created[0]?.id) {
        setSelectedStoreId(created[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar Store.');
    } finally {
      setCreatingStore(false);
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    setError(null);
    try {
      await cloudflareApi.deleteSecretStore(profile.apiToken, profile.accountId, storeId);
      setConfirmDeleteStoreId(null);
      onNotify('Secret Store excluído.');
      await loadStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir Store.');
    }
  };

  const getSessionValueKey = useCallback(
    (storeId: string, secretName: string) => `${storeId}::${secretName}`,
    []
  );

  const handleDeleteSecret = async (secret: StoreSecret) => {
    if (!selectedStoreId) return;
    setError(null);
    try {
      await cloudflareApi.deleteStoreSecret(
        profile.apiToken,
        profile.accountId,
        selectedStoreId,
        secret.id
      );
      setConfirmDeleteSecretId(null);
      setSessionValues((prev) => {
        const next = { ...prev };
        delete next[getSessionValueKey(selectedStoreId, secret.name)];
        return next;
      });
      onNotify(`Secret "${secret.name}" removida do Store.`);
      await loadStoreSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir secret.');
    }
  };

  const handleCopySecretName = async (secret: StoreSecret) => {
    try {
      await navigator.clipboard.writeText(secret.name);
      setCopiedSecretId(secret.id);
      setCopiedValueId(null);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedSecretId((prev) => (prev === secret.id ? null : prev));
      }, 2000);
      onNotify(`Chave "${secret.name}" copiada.`);
    } catch {
      onNotify('Não foi possível copiar para a área de transferência.');
    }
  };

  const handleCopySecretValue = async (secret: StoreSecret, secretValue: string) => {
    try {
      await navigator.clipboard.writeText(secretValue);
      setCopiedValueId(secret.id);
      setCopiedSecretId(null);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedValueId((prev) => (prev === secret.id ? null : prev));
      }, 2000);
      onNotify(`Valor de "${secret.name}" copiado.`);
    } catch {
      onNotify('Não foi possível copiar o valor.');
    }
  };

  const handleDuplicateSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTarget || !selectedStoreId || !duplicateName.trim()) return;
    setDuplicating(true);
    setError(null);
    try {
      const nextName = duplicateName.trim();
      await cloudflareApi.duplicateStoreSecret(
        profile.apiToken,
        profile.accountId,
        selectedStoreId,
        duplicateTarget.id,
        nextName,
        duplicateTarget.comment,
        duplicateTarget.scopes
      );
      const sourceVal = sessionValues[getSessionValueKey(selectedStoreId, duplicateTarget.name)];
      if (sourceVal !== undefined) {
        setSessionValues((prev) => ({
          ...prev,
          [getSessionValueKey(selectedStoreId, nextName)]: sourceVal,
        }));
      }
      onNotify(`Secret duplicada como "${nextName}".`);
      setDuplicateTarget(null);
      setDuplicateName('');
      await loadStoreSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao duplicar secret.');
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left column: Account Secret Stores */}
      <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold">Stores da Conta</h2>
          <div className="flex items-center gap-1.5">
            <IconTooltipButton
              label="Atualizar stores"
              text="Atualizar"
              size="sm"
              variant="secondary"
              tooltipSide="bottom"
              disabled={loadingStores}
              onClick={() => void loadStores()}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingStores ? 'animate-spin' : ''}`} />}
            />
            <IconTooltipButton
              label="Novo Secret Store"
              text="Novo Store"
              size="sm"
              variant="primary"
              tooltipSide="bottom"
              onClick={() => setNewStoreOpen((prev) => !prev)}
              icon={<Plus className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {newStoreOpen && (
          <form onSubmit={handleCreateStore} className="space-y-2 pt-1 pb-2 border-b border-slate-200 dark:border-slate-800">
            <input
              type="text"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder="Nome do novo Store"
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="flex items-center justify-end gap-2">
              <IconTooltipButton
                label="Cancelar"
                size="sm"
                variant="secondary"
                onClick={() => setNewStoreOpen(false)}
                icon={<X className="w-3.5 h-3.5" />}
              />
              <IconTooltipButton
                type="submit"
                label={creatingStore ? 'Criando...' : 'Criar Store'}
                size="sm"
                variant="primary"
                disabled={creatingStore}
                icon={<Check className="w-3.5 h-3.5" />}
              />
            </div>
          </form>
        )}

        {loadingStores ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum Secret Store criado nesta conta.
          </div>
        ) : (
          <div className="space-y-1.5">
            {stores.map((store) => {
              const active = store.id === selectedStoreId;
              const confirmingDelete = confirmDeleteStoreId === store.id;
              return (
                <div
                  key={store.id}
                  className={`rounded-xl border transition-colors ${
                    active
                      ? 'bg-orange-600/10 dark:bg-orange-500/15 border-orange-500/30'
                      : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteStoreId(null);
                        setSelectedStoreId(store.id);
                      }}
                      className="flex-1 min-h-[36px] text-left min-w-0"
                    >
                      <p
                        className={`text-sm font-semibold truncate ${
                          active
                            ? 'text-orange-700 dark:text-orange-300'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {store.name}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {store.id}
                      </p>
                    </button>
                    {!confirmingDelete && (
                      <IconTooltipButton
                        label={`Excluir store ${store.name}`}
                        text="Excluir"
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmDeleteStoreId(store.id)}
                        className="!border-transparent"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                      />
                    )}
                  </div>
                  {confirmingDelete && (
                    <div className="px-3 pb-2.5 flex items-center justify-end gap-2">
                      <IconTooltipButton
                        label="Cancelar exclusão"
                        text="Cancelar"
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfirmDeleteStoreId(null)}
                        icon={<X className="w-3.5 h-3.5" />}
                      />
                      <IconTooltipButton
                        label="Confirmar exclusão do Store"
                        text="Confirmar"
                        size="sm"
                        variant="primary"
                        onClick={() => void handleDeleteStore(store.id)}
                        className="!bg-red-600 hover:!bg-red-700"
                        icon={<Check className="w-3.5 h-3.5" />}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* Right column: Store Secrets List */}
      <section className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold truncate">
                {activeStore ? activeStore.name : 'Secrets Store'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Secrets compartilhados em nível de conta com escopos granulares
              </p>
            </div>

            <IconTooltipButton
              label="Nova secret no Store"
              text="Nova Secret"
              size="sm"
              variant="primary"
              tooltipSide="bottom"
              disabled={!activeStore}
              onClick={() =>
                activeStore &&
                setEditorTarget({
                  kind: 'store',
                  mode: 'create',
                  storeId: activeStore.id,
                  storeName: activeStore.name,
                })
              }
              icon={<Plus className="w-3.5 h-3.5" />}
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou comentário..."
                className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={maskValues}
              aria-label={
                maskValues
                  ? 'Desmascarar valores das secrets no Store'
                  : 'Mascarar valores das secrets no Store'
              }
              title={
                maskValues
                  ? 'Modo privacidade ativo · Clique para revelar valores disponíveis'
                  : 'Valores visíveis · Clique para mascarar valores'
              }
              onClick={() => setMaskValues((prev) => !prev)}
              className="min-h-[44px] h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800/80 inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              {maskValues ? (
                <EyeOff className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
              ) : (
                <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span className="whitespace-nowrap">
                {maskValues ? 'Valores ocultos' : 'Valores visíveis'}
              </span>
              <span
                aria-hidden="true"
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  maskValues
                    ? 'bg-orange-600 dark:bg-orange-500'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform ${
                    maskValues ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </span>
            </button>

            <IconTooltipButton
              label="Recarregar secrets do Store"
              text="Recarregar"
              variant="secondary"
              tooltipSide="bottom"
              disabled={!activeStore || loadingSecrets}
              onClick={() => void loadStoreSecrets()}
              icon={<RefreshCw className={`w-4 h-4 ${loadingSecrets ? 'animate-spin' : ''}`} />}
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="m-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loadingSecrets ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-44 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  <div className="h-3 w-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
                <div className="h-9 w-28 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              </div>
            ))}
          </div>
        ) : !activeStore ? (
          <div className="py-14 px-6 text-center space-y-2">
            <Layers className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="font-display font-semibold text-sm">Selecione ou crie um Secret Store</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Use o painel lateral para criar um Store compartilhado e gerenciar suas chaves centralizadas.
            </p>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <Layers className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="font-display font-semibold text-sm">
              {searchQuery ? 'Nenhuma secret encontrada' : 'Store sem secrets cadastradas'}
            </p>
            {!searchQuery && (
              <div className="flex justify-center">
                <IconTooltipButton
                  label="Criar secret no Store"
                  variant="primary"
                  onClick={() =>
                    setEditorTarget({
                      kind: 'store',
                      mode: 'create',
                      storeId: activeStore.id,
                      storeName: activeStore.name,
                    })
                  }
                  icon={<Plus className="w-5 h-5" />}
                />
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredSecrets.map((secret) => {
              const confirming = confirmDeleteSecretId === secret.id;
              const isCopied = copiedSecretId === secret.id;
              const isValueCopied = copiedValueId === secret.id;
              const sessionValue = sessionValues[getSessionValueKey(selectedStoreId, secret.name)];
              return (
                <li
                  key={secret.id}
                  className="px-4 sm:px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-mono text-sm font-semibold truncate">{secret.name}</p>
                      <IconTooltipButton
                        label={isCopied ? `Chave ${secret.name} copiada` : `Copiar chave ${secret.name}`}
                        text={isCopied ? 'Copiado' : 'Copiar'}
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleCopySecretName(secret)}
                        className="!h-7 !min-h-[28px] !px-2 !text-[11px] shrink-0"
                        icon={
                          isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )
                        }
                      />
                    </div>

                    {maskValues ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono tracking-wider select-none" aria-label="Valor mascarado">
                          ••••••••••••
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{secret.scopes?.join(', ') || 'Escopo padrão'}</span>
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {sessionValue !== undefined ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <code className="font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 break-all">
                              {sessionValue}
                            </code>
                            <IconTooltipButton
                              label={
                                isValueCopied
                                  ? `Valor de ${secret.name} copiado`
                                  : `Copiar valor de ${secret.name}`
                              }
                              text={isValueCopied ? 'Valor copiado' : 'Copiar valor'}
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleCopySecretValue(secret, sessionValue)}
                              className="!h-7 !min-h-[28px] !px-2 !text-[11px] shrink-0"
                              icon={
                                isValueCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )
                              }
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Somente gravação (API Cloudflare não expõe valor salvo)
                          </p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span>{secret.scopes?.join(', ') || 'Escopo padrão'}</span>
                          {secret.status ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{secret.status}</span>
                            </>
                          ) : null}
                          {secret.modified_on ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="tabular-nums">
                                {new Date(secret.modified_on).toLocaleDateString('pt-BR')}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    )}

                    {secret.comment && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                        {secret.comment}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {confirming ? (
                      <>
                        <IconTooltipButton
                          label="Cancelar exclusão"
                          text="Cancelar"
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirmDeleteSecretId(null)}
                          icon={<X className="w-3.5 h-3.5" />}
                        />
                        <IconTooltipButton
                          label="Confirmar exclusão"
                          text="Confirmar"
                          size="sm"
                          variant="primary"
                          onClick={() => void handleDeleteSecret(secret)}
                          className="!bg-red-600 hover:!bg-red-700"
                          icon={<Check className="w-3.5 h-3.5" />}
                        />
                      </>
                    ) : (
                      <>
                        <IconTooltipButton
                          label="Editar / Rotacionar secret"
                          text="Editar"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setEditorTarget({
                              kind: 'store',
                              mode: 'edit',
                              storeId: activeStore.id,
                              storeName: activeStore.name,
                              initialSecret: secret,
                            })
                          }
                          icon={<Pencil className="w-3.5 h-3.5" />}
                        />
                        <IconTooltipButton
                          label={`Duplicar ${secret.name}`}
                          text="Duplicar"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setDuplicateTarget(secret);
                            setDuplicateName(`${secret.name}_COPY`);
                          }}
                          icon={<CopyPlus className="w-3.5 h-3.5" />}
                        />
                        <IconTooltipButton
                          label={`Excluir ${secret.name}`}
                          text="Excluir"
                          size="sm"
                          variant="danger"
                          onClick={() => setConfirmDeleteSecretId(secret.id)}
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SecretEditorSheet
        target={editorTarget}
        token={profile.apiToken}
        accountId={profile.accountId}
        onClose={() => setEditorTarget(null)}
        onSaved={(msg, savedSecret) => {
          if (savedSecret?.value !== undefined && selectedStoreId) {
            const key = getSessionValueKey(selectedStoreId, savedSecret.name);
            const val = savedSecret.value;
            setSessionValues((prev) => ({ ...prev, [key]: val }));
          }
          setEditorTarget(null);
          onNotify(msg);
          void loadStoreSecrets();
        }}
      />

      {duplicateTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 lg:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full lg:max-w-md bg-white dark:bg-slate-900 border-t lg:border border-slate-200 dark:border-slate-800 rounded-t-3xl lg:rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">
              Duplicar {duplicateTarget.name}
            </h3>
            <form onSubmit={handleDuplicateSecret} className="space-y-4">
              <div>
                <label htmlFor="dup-name" className="block text-xs font-semibold mb-1.5">
                  Nome da nova secret
                </label>
                <input
                  id="dup-name"
                  type="text"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <IconTooltipButton
                  label="Cancelar"
                  variant="secondary"
                  onClick={() => setDuplicateTarget(null)}
                  icon={<X className="w-4 h-4" />}
                />
                <IconTooltipButton
                  type="submit"
                  label={duplicating ? 'Duplicando...' : 'Duplicar Secret'}
                  variant="primary"
                  disabled={duplicating}
                  icon={<CopyPlus className="w-4 h-4" />}
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
