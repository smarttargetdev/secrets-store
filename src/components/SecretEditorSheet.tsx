import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Info, X } from 'lucide-react';
import { cloudflareApi } from '../lib/cloudflareApi';
import type { SecretStoreScope, StoreSecret } from '../types/cloudflare';
import { IconTooltipButton } from './IconTooltipButton';

const AVAILABLE_SCOPES: Array<{ id: SecretStoreScope; label: string }> = [
  { id: 'workers', label: 'Workers' },
  { id: 'ai_gateway', label: 'AI Gateway' },
  { id: 'dex', label: 'DEX' },
  { id: 'access', label: 'Access' },
  { id: 'containers', label: 'Containers' },
  { id: 'websearch', label: 'Web Search' },
];

export type SecretEditorTarget =
  | {
      kind: 'worker';
      mode: 'create' | 'edit';
      scriptName: string;
      initialName?: string;
    }
  | {
      kind: 'store';
      mode: 'create' | 'edit';
      storeId: string;
      storeName: string;
      initialSecret?: StoreSecret;
    };

interface SecretEditorSheetProps {
  target: SecretEditorTarget | null;
  token: string;
  accountId: string;
  onClose: () => void;
  onSaved: (message: string, savedSecret?: { name: string; value?: string }) => void;
}

export function SecretEditorSheet({
  target,
  token,
  accountId,
  onClose,
  onSaved,
}: SecretEditorSheetProps) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [comment, setComment] = useState('');
  const [scopes, setScopes] = useState<string[]>(['workers']);
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    setValue('');
    setShowValue(false);

    if (target.kind === 'worker') {
      setName(target.initialName ?? '');
      setComment('');
      setScopes(['workers']);
    } else if (target.mode === 'edit' && target.initialSecret) {
      setName(target.initialSecret.name);
      setComment(target.initialSecret.comment ?? '');
      setScopes(
        target.initialSecret.scopes && target.initialSecret.scopes.length > 0
          ? target.initialSecret.scopes
          : ['workers']
      );
    } else {
      setName('');
      setComment('');
      setScopes(['workers']);
    }
  }, [target]);

  if (!target) return null;

  const isEdit = target.mode === 'edit';

  const toggleScope = (scopeId: string) => {
    setScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Informe o nome da secret.');
      return;
    }
    if (/\s/.test(cleanName)) {
      setError('O nome da secret não pode conter espaços.');
      return;
    }

    if (target.kind === 'worker') {
      if (!value) {
        setError('Informe o valor da secret para gravar no Worker.');
        return;
      }
      setSaving(true);
      try {
        await cloudflareApi.upsertWorkerSecret(
          token,
          accountId,
          target.scriptName,
          cleanName,
          value
        );
        onSaved(
          isEdit
            ? `Secret "${cleanName}" rotacionada no Worker "${target.scriptName}".`
            : `Secret "${cleanName}" criada no Worker "${target.scriptName}".`,
          { name: cleanName, value }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar secret.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Secrets Store
    if (!isEdit && !value) {
      setError('Informe o valor inicial da secret.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && target.initialSecret) {
        const patchPayload: { value?: string; comment?: string; scopes?: string[] } = {
          comment: comment.trim(),
          scopes: scopes.length > 0 ? scopes : ['workers'],
        };
        if (value) {
          patchPayload.value = value;
        }
        await cloudflareApi.updateStoreSecret(
          token,
          accountId,
          target.storeId,
          target.initialSecret.id,
          patchPayload
        );
        onSaved(
          `Secret "${cleanName}" atualizada no Store "${target.storeName}".`,
          value ? { name: cleanName, value } : { name: cleanName }
        );
      } else {
        await cloudflareApi.createStoreSecrets(token, accountId, target.storeId, [
          {
            name: cleanName,
            value,
            ...(comment.trim() ? { comment: comment.trim() } : {}),
            ...(scopes.length > 0 ? { scopes } : {}),
          },
        ]);
        onSaved(`Secret "${cleanName}" criada no Store "${target.storeName}".`, {
          name: cleanName,
          value,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar no Secrets Store.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 lg:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-editor-title"
    >
      <div className="w-full lg:max-w-lg bg-white dark:bg-slate-900 border-t lg:border border-slate-200 dark:border-slate-800 rounded-t-3xl lg:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Mobile grab handle */}
        <div className="lg:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="secret-editor-title" className="font-display text-lg font-bold truncate">
              {isEdit ? `Editar ${name}` : 'Nova Secret Cloudflare'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {target.kind === 'worker'
                ? `Worker Script: ${target.scriptName}`
                : `Secrets Store: ${target.storeName}`}
            </p>
          </div>
          <IconTooltipButton
            label="Fechar formulário"
            text="Fechar"
            size="sm"
            variant="ghost"
            tooltipSide="bottom"
            onClick={onClose}
            icon={<X className="w-4 h-4" />}
          />
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              A API da Cloudflare é write-only: valores existentes não são exibidos. Ao editar,
              {target.kind === 'worker'
                ? ' informe o novo valor para rotacionar a secret.'
                : ' deixe o valor em branco caso queira alterar apenas comentário ou escopos.'}
            </span>
          </div>

          <div>
            <label htmlFor="secret-name-input" className="block text-xs font-semibold mb-1.5">
              Nome da Secret
            </label>
            <input
              id="secret-name-input"
              type="text"
              value={name}
              disabled={isEdit}
              onChange={(e) => setName(e.target.value)}
              placeholder="EX: DATABASE_URL ou STRIPE_SECRET_KEY"
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm disabled:opacity-65 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label htmlFor="secret-value-input" className="block text-xs font-semibold mb-1.5">
              {isEdit ? 'Novo Valor (rotação)' : 'Valor da Secret'}
            </label>
            <div className="flex gap-2">
              <textarea
                id="secret-value-input"
                rows={showValue ? 3 : 1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  isEdit && target.kind === 'store'
                    ? 'Opcional — preencha apenas para substituir o valor atual'
                    : 'Cole o valor confidencial'
                }
                style={
                  showValue
                    ? undefined
                    : ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)
                }
                className="flex-1 min-h-[44px] py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <IconTooltipButton
                label={showValue ? 'Ocultar valor' : 'Mostrar valor'}
                text={showValue ? 'Ocultar' : 'Mostrar'}
                variant="secondary"
                onClick={() => setShowValue((prev) => !prev)}
                icon={showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              />
            </div>
          </div>

          {target.kind === 'store' && (
            <>
              <div>
                <label htmlFor="secret-comment-input" className="block text-xs font-semibold mb-1.5">
                  Comentário (opcional)
                </label>
                <input
                  id="secret-comment-input"
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ex: Chave principal usada pelos Workers de checkout"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold mb-2">Escopos permitidos</span>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SCOPES.map((scope) => {
                    const active = scopes.includes(scope.id);
                    return (
                      <button
                        key={scope.id}
                        type="button"
                        onClick={() => toggleScope(scope.id)}
                        aria-pressed={active}
                        className={`min-h-[38px] px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-orange-600 dark:bg-orange-500 border-orange-600 dark:border-orange-500 text-white'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        {scope.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <IconTooltipButton
              label="Cancelar"
              variant="secondary"
              onClick={onClose}
              icon={<X className="w-4 h-4" />}
            />
            <IconTooltipButton
              type="submit"
              label={saving ? 'Salvando...' : isEdit ? 'Atualizar Secret' : 'Criar Secret'}
              variant="primary"
              disabled={saving}
              icon={<Check className="w-4 h-4" />}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
