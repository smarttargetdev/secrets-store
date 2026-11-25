import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, ShieldCheck } from 'lucide-react';
import {
  downloadReactNativeZip,
  getReactNativeProjectFiles,
} from '../lib/reactNativeTemplate';
import { IconTooltipButton } from './IconTooltipButton';

export function ReactNativeExporterView() {
  const files = useMemo(() => getReactNativeProjectFiles(), []);
  const [selectedPath, setSelectedPath] = useState(files[0].path);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const activeFile = useMemo(
    () => files.find((f) => f.path === selectedPath) ?? files[0],
    [files, selectedPath]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeFile.content);
    setCopiedPath(activeFile.path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      await downloadReactNativeZip();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-600 dark:text-orange-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Módulo Nativo react-native-keychain · TypeScript</span>
          </div>
          <h2 className="font-display text-xl font-bold text-balance">
            Projeto React Native pronto para iOS e Android
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Inclui o módulo de autenticação seguro com <span className="font-mono text-xs">react-native-keychain</span> (armazenando API Token, Zone ID e Account ID no Keychain/Keystore com proteção biométrica), cliente Cloudflare API v4, Dashboard de Secrets e suporte a tema Claro/Escuro/Sistema.
          </p>
        </div>

        <IconTooltipButton
          label={downloading ? 'Empacotando projeto...' : 'Baixar Projeto React Native (.ZIP)'}
          variant="primary"
          tooltipSide="bottom"
          disabled={downloading}
          onClick={() => void handleDownloadZip()}
          icon={<Download className="w-5 h-5" />}
        />
      </section>

      {/* Code Browser Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 space-y-1">
          {files.map((file) => {
            const active = file.path === activeFile.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl text-left transition-colors flex items-start gap-3 ${
                  active
                    ? 'bg-orange-600/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                }`}
              >
                <FileCode2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{file.title}</p>
                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {file.path}
                  </p>
                </div>
              </button>
            );
          })}
        </aside>

        <section className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold truncate">{activeFile.path}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {activeFile.description}
              </p>
            </div>
            <IconTooltipButton
              label={copiedPath === activeFile.path ? 'Código copiado' : 'Copiar código do arquivo'}
              size="sm"
              variant="secondary"
              tooltipSide="bottom"
              onClick={() => void handleCopy()}
              icon={
                copiedPath === activeFile.path ? (
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )
              }
            />
          </div>

          <div className="bg-slate-950 text-slate-100 p-4 sm:p-5 overflow-x-auto max-h-[600px]">
            <pre className="font-mono text-xs leading-relaxed">
              <code>{activeFile.content}</code>
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
