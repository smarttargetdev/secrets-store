import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  KeyRound,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cloudflareApi } from '../lib/cloudflareApi';
import type {
  CloudflareAccount,
  CloudflareProfile,
  SecretStore,
  WorkerScript,
  WorkerSecret,
} from '../types/cloudflare';
import { IconTooltipButton } from './IconTooltipButton';
import { SecretEditorSheet, type SecretEditorTarget } from './SecretEditorSheet';

interface DashboardSecretsViewProps {
  profile: CloudflareProfile;
  onNotify: (msg: string) => void;
  onOpenSecretsStore: () => void;
}

export function DashboardSecretsView({
  profile,
  onNotify,
  onOpenSecretsStore,
}: DashboardSecretsViewProps) {
  const [accounts, setAccounts] = useState<CloudflareAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(profile.accountId);
  const [scripts, setScripts] = useState<WorkerScript[]>([]);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [secrets, setSecrets] = useState<WorkerSecret[]>([]);
  const [stores, setStores] = useState<SecretStore[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [loadingScripts, setLoadingScripts] = useState(true);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editorTarget, setEditorTarget] = useState<SecretEditorTarget | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  // Bulk import modal state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedAccountId(profile.accountId);
    setSelectedScript('');
    setSecrets([]);
  }, [profile.id, profile.accountId]);

  const loadAccountOverview = useCallback(async () => {
    setLoadingScripts(true);
    setError(null);
    try {
      const [acctRes, scriptsRes, storesRes] = await Promise.allSettled([
        cloudflareApi.listAccounts(profile.apiToken),
        cloudflareApi.listWorkerScripts(profile.apiToken, selectedAccountId),
        cloudflareApi.listSecretStores(profile.apiToken, selectedAccountId),
      ]);

      if (acctRes.status === 'fulfilled') {
        setAccounts(acctRes.value);
      }

      if (scriptsRes.status === 'fulfilled') {
        const sorted = [...scriptsRes.value].sort((a, b) => a.id.localeCompare(b.id));
        setScripts(sorted);
        setSelectedScript((prev) =>
          prev && sorted.some((s) => s.id === prev) ? prev : sorted[0]?.id ?? ''
        );
      } else {
        setScripts([]);
        setSelectedScript('');
        setError(
          scriptsRes.reason instanceof Error
            ? scriptsRes.reason.message
            : 'Falha ao carregar Workers da conta.'
        );
      }

      if (storesRes.status === 'fulfilled') {
        setStores(storesRes.value);
      } else {
        setStores([]);
      }
    } finally {
      setLoadingScripts(false);
    }
  }, [profile.apiToken, selectedAccountId]);

  const loadWorkerSecrets = useCallback(async () => {
    if (!selectedAccountId || !selectedScript) {
      setSecrets([]);
      return;
    }
    setLoadingSecrets(true);
    setError(null);
    try {
      const items = await cloudflareApi.listWorkerSecrets(
        profile.apiToken,
        selectedAccountId,
        selectedScript
      );
      setSecrets([...items].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setSecrets([]);
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível listar as secrets deste Worker.'
      );
    } finally {
      setLoadingSecrets(false);
    }
  }, [profile.apiToken, selectedAccountId, selectedScript]);

  useEffect(() => {
    void loadAccountOverview();
  }, [loadAccountOverview]);

  useEffect(() => {
    void loadWorkerSecrets();
  }, [loadWorkerSecrets]);

  const filteredSecrets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return secrets;
    return secrets.filter((s) => s.name.toLowerCase().includes(q));
  }, [secrets, searchQuery]);

  const handleDeleteSecret = async (secretName: string) => {
    if (!selectedScript) return;
    setDeletingName(secretName);
    setError(null);
    try {
      await cloudflareApi.deleteWorkerSecret(
        profile.apiToken,
        selectedAccountId,
        selectedScript,
        secretName
      );
      setConfirmDeleteName(null);
      onNotify(`Secret "${secretName}" removida de "${selectedScript}".`);
      await loadWorkerSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir secret.');
    } finally {
      setDeletingName(null);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError(null);
    if (!selectedScript) return;

    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    if (lines.length === 0) {
      setBulkError('Informe ao menos uma linha no formato NOME=VALOR.');
      return;
    }

    const secretsMap: Record<string, { type: 'secret_text'; name: string; text: string }> = {};
    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      if (eqIndex <= 0) {
        setBulkError(`Linha inválida: "${line}". Use o formato CHAVE=valor.`);
        return;
      }
      const key = line.slice(0, eqIndex).trim();
      const val = line.slice(eqIndex + 1);
      if (/\s/.test(key)) {
        setBulkError(`Nome de secret inválido: "${key}".`);
        return;
      }
      secretsMap[key] = { type: 'secret_text', name: key, text: val };
    }

    setBulkSaving(true);
    try {
      await cloudflareApi.bulkWorkerSecrets(
        profile.apiToken,
        selectedAccountId,
        selectedScript,
        secretsMap
      );
      setBulkOpen(false);
      setBulkText('');
      onNotify(`${Object.keys(secretsMap).length} secret(s) gravadas em "${selectedScript}".`);
      await loadWorkerSecrets();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Falha no envio em lote.');
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Strip: single-elevation 4-column metric bar */}
      <section
        aria-label="Resumo da conta Cloudflare"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Workers na Conta
          </p>
          <p className="font-display text-2xl font-bold tabular-nums mt-1">
            {loadingScripts ? '—' : scripts.length}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Secrets no Worker
          </p>
          <p className="font-display text-2xl font-bold tabular-nums mt-1">
            {loadingSecrets ? '—' : secrets.length}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSecretsStore}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-500/60 rounded-2xl p-4 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Secret Stores</span>
            <Layers className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          </p>
          <p className="font-display text-2xl font-bold tabular-nums mt-1">
            {loadingScripts ? '—' : stores.length}
          </p>
        </button>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Zona do Perfil
          </p>
          <p className="font-mono text-sm font-semibold truncate mt-2">
            {profile.zoneName || (profile.zoneId ? `${profile.zoneId.slice(0, 12)}...` : 'Não informada')}
          </p>
        </div>
      </section>

      {/* Main Workspace Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Account & Worker Script Selector */}
        <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold">Workers Scripts</h2>
            <IconTooltipButton
              label="Atualizar lista de Workers"
              size="sm"
              variant="secondary"
              tooltipSide="bottom"
              disabled={loadingScripts}
              onClick={() => void loadAccountOverview()}
              icon={<RefreshCw className={`w-4 h-4 ${loadingScripts ? 'animate-spin' : ''}`} />}
            />
          </div>

          {accounts.length > 1 && (
            <div>
              <label htmlFor="account-select" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Conta Cloudflare
              </label>
              <select
                id="account-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loadingScripts ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800/70 animate-pulse"
                />
              ))}
            </div>
          ) : scripts.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p>Nenhum Worker Script encontrado nesta conta.</p>
              <p>Verifique as permissões do token (Workers Scripts: Read).</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {scripts.map((script) => {
                const active = script.id === selectedScript;
                return (
                  <button
                    key={script.id}
                    type="button"
                    onClick={() => {
                      setConfirmDeleteName(null);
                      setSelectedScript(script.id);
                    }}
                    className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl text-left transition-colors flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-orange-600/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span className="font-mono text-xs font-medium truncate">{script.id}</span>
                    {script.modified_on && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                        {new Date(script.modified_on).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right column: Secrets Dashboard Table / List */}
        <section className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold truncate">
                  {selectedScript ? `Secrets de ${selectedScript}` : 'Workers Secrets'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Account ID: <span className="font-mono">{selectedAccountId}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <IconTooltipButton
                  label="Enviar secrets em lote (.env)"
                  variant="secondary"
                  tooltipSide="bottom"
                  disabled={!selectedScript}
                  onClick={() => {
                    setBulkError(null);
                    setBulkOpen(true);
                  }}
                  icon={<Upload className="w-4 h-4" />}
                />
                <IconTooltipButton
                  label="Nova secret"
                  variant="primary"
                  tooltipSide="bottom"
                  disabled={!selectedScript}
                  onClick={() =>
                    setEditorTarget({
                      kind: 'worker',
                      mode: 'create',
                      scriptName: selectedScript,
                    })
                  }
                  icon={<Plus className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar secrets por nome..."
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <IconTooltipButton
                label="Recarregar secrets"
                variant="secondary"
                tooltipSide="bottom"
                disabled={!selectedScript || loadingSecrets}
                onClick={() => void loadWorkerSecrets()}
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
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    <div className="h-3 w-28 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </div>
                  <div className="h-9 w-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
              ))}
            </div>
          ) : !selectedScript ? (
            <div className="py-14 px-6 text-center space-y-2">
              <KeyRound className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="font-display font-semibold text-sm">Selecione um Worker Script</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Escolha um Worker à esquerda para listar, criar, rotacionar ou remover suas variáveis confidenciais.
              </p>
            </div>
          ) : filteredSecrets.length === 0 ? (
            <div className="py-14 px-6 text-center space-y-3">
              <KeyRound className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="space-y-1">
                <p className="font-display font-semibold text-sm">
                  {searchQuery ? 'Nenhuma secret encontrada para o filtro' : 'Nenhuma secret configurada'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {searchQuery
                    ? 'Tente limpar a busca para visualizar todas as secrets do Worker.'
                    : `Adicione a primeira secret ao Worker "${selectedScript}".`}
                </p>
              </div>
              {!searchQuery && (
                <div className="flex justify-center">
                  <IconTooltipButton
                    label="Adicionar primeira secret"
                    variant="primary"
                    onClick={() =>
                      setEditorTarget({
                        kind: 'worker',
                        mode: 'create',
                        scriptName: selectedScript,
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
                const isConfirming = confirmDeleteName === secret.name;
                return (
                  <li
                    key={secret.name}
                    className="px-4 sm:px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold truncate">{secret.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {secret.type} · Valor protegido (somente gravação)
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isConfirming ? (
                        <>
                          <IconTooltipButton
                            label="Cancelar exclusão"
                            size="sm"
                            variant="secondary"
                            onClick={() => setConfirmDeleteName(null)}
                            icon={<X className="w-4 h-4" />}
                          />
                          <IconTooltipButton
                            label="Confirmar exclusão"
                            size="sm"
                            variant="primary"
                            disabled={deletingName === secret.name}
                            onClick={() => void handleDeleteSecret(secret.name)}
                            className="!bg-red-600 hover:!bg-red-700"
                            icon={<Check className="w-4 h-4" />}
                          />
                        </>
                      ) : (
                        <>
                          <IconTooltipButton
                            label="Editar / Rotacionar secret"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setEditorTarget({
                                kind: 'worker',
                                mode: 'edit',
                                scriptName: selectedScript,
                                initialName: secret.name,
                              })
                            }
                            icon={<Pencil className="w-3.5 h-3.5" />}
                          />
                          <IconTooltipButton
                            label={`Excluir secret ${secret.name}`}
                            size="sm"
                            variant="danger"
                            onClick={() => setConfirmDeleteName(secret.name)}
                            icon={<Trash2 className="w-4 h-4" />}
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
      </div>

      {/* Create / Edit Secret Sheet */}
      <SecretEditorSheet
        target={editorTarget}
        token={profile.apiToken}
        accountId={selectedAccountId}
        onClose={() => setEditorTarget(null)}
        onSaved={(msg) => {
          setEditorTarget(null);
          onNotify(msg);
          void loadWorkerSecrets();
        }}
      />

      {/* Bulk Secrets Modal */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 lg:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full lg:max-w-lg bg-white dark:bg-slate-900 border-t lg:border border-slate-200 dark:border-slate-800 rounded-t-3xl lg:rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="lg:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <div>
              <h3 className="font-display text-lg font-bold">Enviar Secrets em Lote (.env)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Informe uma secret por linha no formato <span className="font-mono">NOME=valor</span> para gravar em <span className="font-mono">{selectedScript}</span>.
              </p>
            </div>
            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'API_KEY=sk_live_...\nWEBHOOK_SECRET=whsec_...'}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {bulkError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{bulkError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <IconTooltipButton
                  label="Cancelar"
                  variant="secondary"
                  onClick={() => setBulkOpen(false)}
                  icon={<X className="w-4 h-4" />}
                />
                <IconTooltipButton
                  type="submit"
                  label={bulkSaving ? 'Enviando...' : 'Aplicar em Lote'}
                  variant="primary"
                  disabled={bulkSaving}
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
