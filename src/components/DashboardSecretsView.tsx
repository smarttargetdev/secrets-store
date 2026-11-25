import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  FileUp,
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

  // JSON file import modal state
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonRaw, setJsonRaw] = useState('');
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  const [copiedSecretName, setCopiedSecretName] = useState<string | null>(null);
  const [copiedValueName, setCopiedValueName] = useState<string | null>(null);
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
    setSelectedAccountId(profile.accountId);
    setSelectedScript('');
    setSecrets([]);
    setSessionValues({});
    setMaskValues(true);
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

  const getSessionValueKey = useCallback(
    (scriptName: string, secretName: string) => `${selectedAccountId}::${scriptName}::${secretName}`,
    [selectedAccountId]
  );

  const handleCopySecretName = async (secretName: string) => {
    try {
      await navigator.clipboard.writeText(secretName);
      setCopiedSecretName(secretName);
      setCopiedValueName(null);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedSecretName((prev) => (prev === secretName ? null : prev));
      }, 2000);
      onNotify(`Chave "${secretName}" copiada.`);
    } catch {
      onNotify('Não foi possível copiar para a área de transferência.');
    }
  };

  const handleCopySecretValue = async (secretName: string, secretValue: string) => {
    try {
      await navigator.clipboard.writeText(secretValue);
      setCopiedValueName(secretName);
      setCopiedSecretName(null);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedValueName((prev) => (prev === secretName ? null : prev));
      }, 2000);
      onNotify(`Valor de "${secretName}" copiado.`);
    } catch {
      onNotify('Não foi possível copiar o valor.');
    }
  };

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
      setSessionValues((prev) => {
        const next = { ...prev };
        delete next[getSessionValueKey(selectedScript, secretName)];
        return next;
      });
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
      setSessionValues((prev) => {
        const next = { ...prev };
        for (const [k, item] of Object.entries(secretsMap)) {
          next[getSessionValueKey(selectedScript, k)] = item.text;
        }
        return next;
      });
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

  const parsedJsonImport = useMemo(() => {
    const trimmed = jsonRaw.trim();
    if (!trimmed) {
      return { entries: [] as Array<{ name: string; text: string }>, error: null as string | null };
    }

    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(trimmed);
    } catch {
      return { entries: [], error: 'JSON inválido. Verifique a sintaxe do arquivo ou texto colado.' };
    }

    const entries: Array<{ name: string; text: string }> = [];

    const pushEntry = (nameRaw: unknown, valRaw: unknown) => {
      if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
        throw new Error('Encontrado item sem nome de secret válido.');
      }
      const key = nameRaw.trim();
      if (/\s/.test(key)) {
        throw new Error(`Nome de secret inválido (contém espaços): "${key}".`);
      }
      if (valRaw === null || valRaw === undefined) {
        throw new Error(`A secret "${key}" possui valor nulo ou indefinido.`);
      }
      const text =
        typeof valRaw === 'string'
          ? valRaw
          : typeof valRaw === 'number' || typeof valRaw === 'boolean'
            ? String(valRaw)
            : JSON.stringify(valRaw);
      entries.push({ name: key, text });
    };

    try {
      // Unwrap optional top-level { secrets: ... }
      const root =
        rawParsed &&
        typeof rawParsed === 'object' &&
        !Array.isArray(rawParsed) &&
        'secrets' in rawParsed &&
        Object.keys(rawParsed).length === 1
          ? (rawParsed as { secrets: unknown }).secrets
          : rawParsed;

      if (Array.isArray(root)) {
        for (const item of root) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('Cada item do array JSON deve ser um objeto { name, value }.');
          }
          const rec = item as Record<string, unknown>;
          const nameField = rec.name ?? rec.key;
          const valField = rec.value ?? rec.text;
          pushEntry(nameField, valField);
        }
      } else if (root && typeof root === 'object') {
        for (const [key, val] of Object.entries(root as Record<string, unknown>)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            const nested = val as Record<string, unknown>;
            if ('text' in nested || 'value' in nested) {
              pushEntry(nested.name ?? key, nested.text ?? nested.value);
              continue;
            }
          }
          pushEntry(key, val);
        }
      } else {
        throw new Error('A raiz do JSON deve ser um objeto chave-valor ou um array de secrets.');
      }

      if (entries.length === 0) {
        return { entries: [], error: 'Nenhuma secret encontrada na estrutura JSON.' };
      }
      if (entries.length > 100) {
        return {
          entries: [],
          error: 'A API em lote da Cloudflare suporta até 100 secrets por envio.',
        };
      }

      return { entries, error: null };
    } catch (err) {
      return {
        entries: [],
        error: err instanceof Error ? err.message : 'Estrutura JSON incompatível.',
      };
    }
  }, [jsonRaw]);

  const handleJsonFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setJsonError(null);
    try {
      const content = await file.text();
      setJsonFileName(file.name);
      setJsonRaw(content);
    } catch {
      setJsonError('Não foi possível ler o arquivo JSON selecionado.');
    }
  };

  const handleJsonImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJsonError(null);
    if (!selectedScript) return;

    if (parsedJsonImport.error) {
      setJsonError(parsedJsonImport.error);
      return;
    }
    if (parsedJsonImport.entries.length === 0) {
      setJsonError('Carregue um arquivo .json ou cole um JSON válido para importar.');
      return;
    }

    const secretsMap: Record<string, { type: 'secret_text'; name: string; text: string }> = {};
    for (const entry of parsedJsonImport.entries) {
      secretsMap[entry.name] = {
        type: 'secret_text',
        name: entry.name,
        text: entry.text,
      };
    }

    setJsonSaving(true);
    try {
      await cloudflareApi.bulkWorkerSecrets(
        profile.apiToken,
        selectedAccountId,
        selectedScript,
        secretsMap
      );
      setSessionValues((prev) => {
        const next = { ...prev };
        for (const entry of parsedJsonImport.entries) {
          next[getSessionValueKey(selectedScript, entry.name)] = entry.text;
        }
        return next;
      });
      setJsonModalOpen(false);
      setJsonRaw('');
      setJsonFileName(null);
      onNotify(
        `${parsedJsonImport.entries.length} secret(s) importadas via JSON para "${selectedScript}".`
      );
      await loadWorkerSecrets();
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Falha ao importar secrets via JSON.');
    } finally {
      setJsonSaving(false);
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
              text="Atualizar"
              size="sm"
              variant="secondary"
              tooltipSide="bottom"
              disabled={loadingScripts}
              onClick={() => void loadAccountOverview()}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingScripts ? 'animate-spin' : ''}`} />}
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

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <IconTooltipButton
                  label="Importar secrets de arquivo JSON"
                  text="Importar JSON"
                  size="sm"
                  variant="secondary"
                  tooltipSide="bottom"
                  disabled={!selectedScript}
                  onClick={() => {
                    setJsonError(null);
                    setJsonModalOpen(true);
                  }}
                  icon={<FileJson className="w-3.5 h-3.5" />}
                />
                <IconTooltipButton
                  label="Enviar secrets em lote (.env)"
                  text="Lote (.env)"
                  size="sm"
                  variant="secondary"
                  tooltipSide="bottom"
                  disabled={!selectedScript}
                  onClick={() => {
                    setBulkError(null);
                    setBulkOpen(true);
                  }}
                  icon={<Upload className="w-3.5 h-3.5" />}
                />
                <IconTooltipButton
                  label="Nova secret"
                  text="Nova Secret"
                  size="sm"
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
                  icon={<Plus className="w-3.5 h-3.5" />}
                />
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar secrets por nome..."
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={maskValues}
                aria-label={
                  maskValues
                    ? 'Desmascarar valores das secrets na lista'
                    : 'Mascarar valores das secrets na lista'
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
                label="Recarregar secrets"
                text="Recarregar"
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
                    text="Nova Secret"
                    variant="primary"
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
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSecrets.map((secret) => {
                const isConfirming = confirmDeleteName === secret.name;
                const isCopied = copiedSecretName === secret.name;
                const isValueCopied = copiedValueName === secret.name;
                const sessionValue = sessionValues[getSessionValueKey(selectedScript, secret.name)];
                return (
                  <li
                    key={secret.name}
                    className="px-4 sm:px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-mono text-sm font-semibold truncate">{secret.name}</p>
                        <IconTooltipButton
                          label={isCopied ? `Chave ${secret.name} copiada` : `Copiar chave ${secret.name}`}
                          text={isCopied ? 'Copiado' : 'Copiar'}
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleCopySecretName(secret.name)}
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
                          <span>{secret.type}</span>
                        </p>
                      ) : sessionValue !== undefined ? (
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
                            onClick={() => void handleCopySecretValue(secret.name, sessionValue)}
                            className="!h-7 !min-h-[28px] !px-2 !text-[11px] shrink-0"
                            icon={
                              isValueCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )
                            }
                          />
                          <span className="text-slate-500 dark:text-slate-400">{secret.type}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {secret.type} · Somente gravação (API Cloudflare não expõe valor salvo)
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {isConfirming ? (
                        <>
                          <IconTooltipButton
                            label="Cancelar exclusão"
                            text="Cancelar"
                            size="sm"
                            variant="secondary"
                            onClick={() => setConfirmDeleteName(null)}
                            icon={<X className="w-3.5 h-3.5" />}
                          />
                          <IconTooltipButton
                            label="Confirmar exclusão"
                            text="Confirmar"
                            size="sm"
                            variant="primary"
                            disabled={deletingName === secret.name}
                            onClick={() => void handleDeleteSecret(secret.name)}
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
                            text="Excluir"
                            size="sm"
                            variant="danger"
                            onClick={() => setConfirmDeleteName(secret.name)}
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
      </div>

      {/* Create / Edit Secret Sheet */}
      <SecretEditorSheet
        target={editorTarget}
        token={profile.apiToken}
        accountId={selectedAccountId}
        onClose={() => setEditorTarget(null)}
        onSaved={(msg, savedSecret) => {
          if (savedSecret?.value !== undefined && selectedScript) {
            const key = getSessionValueKey(selectedScript, savedSecret.name);
            const val = savedSecret.value;
            setSessionValues((prev) => ({ ...prev, [key]: val }));
          }
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

      {/* JSON File Import Modal */}
      {jsonModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 lg:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="json-import-title"
        >
          <div className="w-full lg:max-w-xl bg-white dark:bg-slate-900 border-t lg:border border-slate-200 dark:border-slate-800 rounded-t-3xl lg:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="lg:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 id="json-import-title" className="font-display text-lg font-bold truncate">
                  Importar Secrets via JSON
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Destino: <span className="font-mono">{selectedScript}</span> · Objeto chave-valor ou array
                </p>
              </div>
              <IconTooltipButton
                label="Fechar importação JSON"
                text="Fechar"
                size="sm"
                variant="ghost"
                tooltipSide="bottom"
                onClick={() => setJsonModalOpen(false)}
                icon={<X className="w-4 h-4" />}
              />
            </div>

            <form onSubmit={handleJsonImportSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              <input
                ref={jsonFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  void handleJsonFileSelected(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />

              {/* Dropzone + File Picker */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleJsonFileSelected(e.dataTransfer.files?.[0]);
                }}
                className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {jsonFileName ? `Arquivo: ${jsonFileName}` : 'Selecione ou arraste um arquivo .json'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Aceita {'{"CHAVE": "valor"}'} ou [{'{"name": "CHAVE", "value": "valor"}'}]
                  </p>
                </div>
                <IconTooltipButton
                  label="Selecionar arquivo .json"
                  text="Selecionar .json"
                  size="sm"
                  variant="secondary"
                  onClick={() => jsonFileInputRef.current?.click()}
                  icon={<FileUp className="w-3.5 h-3.5" />}
                />
              </div>

              <div>
                <label htmlFor="json-secrets-input" className="block text-xs font-semibold mb-1.5">
                  Conteúdo JSON
                </label>
                <textarea
                  id="json-secrets-input"
                  rows={6}
                  value={jsonRaw}
                  onChange={(e) => {
                    setJsonError(null);
                    setJsonRaw(e.target.value);
                  }}
                  placeholder={'{\n  "API_KEY": "sk_live_...",\n  "WEBHOOK_SECRET": "whsec_..."\n}'}
                  className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {parsedJsonImport.entries.length > 0 && !parsedJsonImport.error && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-semibold">Pré-visualização</span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {parsedJsonImport.entries.length} secret(s)
                    </span>
                  </div>
                  <ul className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedJsonImport.entries.map((item) => (
                      <li
                        key={item.name}
                        className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-mono font-medium truncate">{item.name}</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400 truncate max-w-[200px] shrink-0">
                          {maskValues ? '••••••••••••' : item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(jsonError || parsedJsonImport.error) && (
                <div
                  role="alert"
                  className="px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium"
                >
                  {jsonError || parsedJsonImport.error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <IconTooltipButton
                  label="Cancelar"
                  variant="secondary"
                  onClick={() => setJsonModalOpen(false)}
                  icon={<X className="w-4 h-4" />}
                />
                <IconTooltipButton
                  type="submit"
                  label={
                    jsonSaving
                      ? 'Importando secrets...'
                      : `Importar ${parsedJsonImport.entries.length || ''} secret(s)`
                  }
                  variant="primary"
                  disabled={
                    jsonSaving ||
                    Boolean(parsedJsonImport.error) ||
                    parsedJsonImport.entries.length === 0
                  }
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
