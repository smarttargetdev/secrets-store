import JSZip from 'jszip';

export interface GeneratedRnFile {
  path: string;
  title: string;
  description: string;
  language: 'typescript' | 'json' | 'markdown';
  content: string;
}

export function getReactNativeProjectFiles(): GeneratedRnFile[] {
  return [
    {
      path: 'src/auth/cloudflareKeychain.ts',
      title: 'Módulo de Autenticação (react-native-keychain)',
      description:
        'Armazena e recupera com segurança a API Token, Zone ID e Account ID do Cloudflare no Keychain (iOS) e Keystore (Android), com suporte a múltiplos perfis e proteção biométrica/PIN.',
      language: 'typescript',
      content: `import * as Keychain from 'react-native-keychain';
import { Platform } from 'react-native';

export interface CloudflareCredentials {
  profileId: string;
  profileLabel: string;
  apiToken: string;
  zoneId: string;
  accountId?: string;
  updatedAt: string;
}

export interface StoredProfileMeta {
  profileId: string;
  profileLabel: string;
  zoneId: string;
  accountId?: string;
  updatedAt: string;
}

const KEYCHAIN_SERVICE_PREFIX = 'com.cfvault.cloudflare.profile';
const INDEX_SERVICE = 'com.cfvault.cloudflare.index';

function getProfileService(profileId: string): string {
  return \`\${KEYCHAIN_SERVICE_PREFIX}.\${profileId}\`;
}

function getSecurityOptions(requireBiometry = false): Keychain.SetOptions {
  const base: Keychain.SetOptions = {
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    storage:
      Platform.OS === 'android'
        ? Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH
        : undefined,
  };

  if (requireBiometry) {
    return {
      ...base,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      authenticationType: Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
    };
  }

  return base;
}

export async function saveCloudflareCredentials(
  credentials: Omit<CloudflareCredentials, 'updatedAt'>,
  options?: { requireBiometry?: boolean }
): Promise<CloudflareCredentials> {
  if (!credentials.apiToken.trim()) {
    throw new Error('A API Token do Cloudflare é obrigatória.');
  }
  if (!/^[a-f0-9]{32}$/i.test(credentials.zoneId.trim())) {
    throw new Error('Zone ID inválido. Deve conter 32 caracteres hexadecimais.');
  }

  const record: CloudflareCredentials = {
    ...credentials,
    profileLabel: credentials.profileLabel.trim() || 'Conta Cloudflare',
    apiToken: credentials.apiToken.trim(),
    zoneId: credentials.zoneId.trim(),
    accountId: credentials.accountId?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  // Armazena o JSON cifrado no Keychain/Keystore nativo usando o service específico do perfil
  await Keychain.setGenericPassword(
    record.profileId,
    JSON.stringify({
      apiToken: record.apiToken,
      zoneId: record.zoneId,
      accountId: record.accountId,
      profileLabel: record.profileLabel,
      updatedAt: record.updatedAt,
    }),
    {
      ...getSecurityOptions(options?.requireBiometry ?? false),
      service: getProfileService(record.profileId),
    }
  );

  // Atualiza o índice de perfis (sem armazenar o apiToken no índice)
  const currentIndex = await listStoredProfiles();
  const meta: StoredProfileMeta = {
    profileId: record.profileId,
    profileLabel: record.profileLabel,
    zoneId: record.zoneId,
    accountId: record.accountId,
    updatedAt: record.updatedAt,
  };

  const nextIndex = [
    meta,
    ...currentIndex.filter((item) => item.profileId !== record.profileId),
  ];

  await Keychain.setGenericPassword(
    'cf_vault_profiles',
    JSON.stringify(nextIndex),
    {
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      service: INDEX_SERVICE,
    }
  );

  return record;
}

export async function getCloudflareCredentials(
  profileId: string,
  promptMessage = 'Autentique-se para acessar o token Cloudflare'
): Promise<CloudflareCredentials | null> {
  const result = await Keychain.getGenericPassword({
    service: getProfileService(profileId),
    authenticationPrompt: {
      title: 'CF Vault',
      subtitle: 'Desbloquear credenciais Cloudflare',
      description: promptMessage,
      cancel: 'Cancelar',
    },
  });

  if (!result) {
    return null;
  }

  const parsed = JSON.parse(result.password) as Omit<CloudflareCredentials, 'profileId'>;
  return {
    profileId,
    ...parsed,
  };
}

export async function listStoredProfiles(): Promise<StoredProfileMeta[]> {
  const result = await Keychain.getGenericPassword({
    service: INDEX_SERVICE,
  });

  if (!result) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.password) as StoredProfileMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function removeCloudflareCredentials(profileId: string): Promise<void> {
  await Keychain.resetGenericPassword({
    service: getProfileService(profileId),
  });

  const currentIndex = await listStoredProfiles();
  const filtered = currentIndex.filter((item) => item.profileId !== profileId);

  if (filtered.length === 0) {
    await Keychain.resetGenericPassword({ service: INDEX_SERVICE });
  } else {
    await Keychain.setGenericPassword(
      'cf_vault_profiles',
      JSON.stringify(filtered),
      {
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        service: INDEX_SERVICE,
      }
    );
  }
}

export async function verifyCloudflareTokenAndZone(
  apiToken: string,
  zoneId: string
): Promise<{
  tokenStatus: string;
  zoneName: string;
  accountId: string;
  accountName: string;
}> {
  const headers = {
    Authorization: \`Bearer \${apiToken.trim()}\`,
    'Content-Type': 'application/json',
  };

  const [tokenRes, zoneRes] = await Promise.all([
    fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers }),
    fetch(\`https://api.cloudflare.com/client/v4/zones/\${encodeURIComponent(zoneId.trim())}\`, {
      headers,
    }),
  ]);

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.success) {
    throw new Error(tokenJson.errors?.[0]?.message || 'API Token inválido.');
  }

  const zoneJson = await zoneRes.json();
  if (!zoneRes.ok || !zoneJson.success) {
    throw new Error(zoneJson.errors?.[0]?.message || 'Zone ID não encontrado ou sem permissão.');
  }

  return {
    tokenStatus: tokenJson.result?.status || 'active',
    zoneName: zoneJson.result?.name || zoneId,
    accountId: zoneJson.result?.account?.id || '',
    accountName: zoneJson.result?.account?.name || '',
  };
}
`,
    },
    {
      path: 'src/screens/AuthSetupScreen.tsx',
      title: 'Tela de Autenticação (API Token & Zone ID)',
      description:
        'Formulário mobile nativo para inserir API Token e Zone ID, validar na Cloudflare e salvar no react-native-keychain.',
      language: 'typescript',
      content: `import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CloudflareCredentials,
  saveCloudflareCredentials,
  verifyCloudflareTokenAndZone,
} from '../auth/cloudflareKeychain';
import { useAppTheme } from '../theme/theme';

interface Props {
  onAuthenticated: (credentials: CloudflareCredentials) => void;
}

export function AuthSetupScreen({ onAuthenticated }: Props) {
  const { colors } = useAppTheme();
  const [profileLabel, setProfileLabel] = useState('Produção');
  const [apiToken, setApiToken] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [requireBiometry, setRequireBiometry] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    if (!apiToken.trim() || !zoneId.trim()) {
      setError('Preencha a API Token e o Zone ID do Cloudflare.');
      return;
    }

    setLoading(true);
    try {
      const verified = await verifyCloudflareTokenAndZone(apiToken, zoneId);
      const saved = await saveCloudflareCredentials(
        {
          profileId: \`cf_\${Date.now()}\`,
          profileLabel: profileLabel.trim() || verified.zoneName,
          apiToken,
          zoneId,
          accountId: verified.accountId,
        },
        { requireBiometry }
      );
      onAuthenticated(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao validar credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.text }]}>Conectar conta Cloudflare</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Suas credenciais serão cifradas e armazenadas no Keychain/Keystore nativo do dispositivo.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>Nome do Perfil</Text>
          <TextInput
            value={profileLabel}
            onChangeText={setProfileLabel}
            placeholder="Ex: Produção"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />

          <Text style={[styles.label, { color: colors.text }]}>Cloudflare API Token</Text>
          <View style={styles.row}>
            <TextInput
              value={apiToken}
              onChangeText={setApiToken}
              placeholder="Cole seu API Token com permissão de Workers/Secrets"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showToken}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.flex1, { color: colors.text, borderColor: colors.border }]}
            />
            <Pressable
              onPress={() => setShowToken((prev) => !prev)}
              style={[styles.toggleBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {showToken ? 'Ocultar' : 'Mostrar'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Zone ID</Text>
          <TextInput
            value={zoneId}
            onChangeText={setZoneId}
            placeholder="32 caracteres hexadecimais"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />

          <View style={styles.switchRow}>
            <View style={styles.flex1}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>
                Exigir Biometria / PIN do aparelho
              </Text>
              <Text style={[styles.switchHint, { color: colors.muted }]}>
                Protege o acesso ao token via Keychain Access Control
              </Text>
            </View>
            <Switch
              value={requireBiometry}
              onValueChange={setRequireBiometry}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleConnect}
            disabled={loading}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: colors.accent, opacity: pressed || loading ? 0.85 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Verificar e Salvar no Keychain</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingTop: 48 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  switchHint: { fontSize: 12, marginTop: 2 },
  errorBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderRadius: 10,
    padding: 12,
  },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '500' },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
`,
    },
    {
      path: 'src/services/cloudflareClient.ts',
      title: 'Cliente API Cloudflare (Workers & Secrets Store)',
      description:
        'Serviço tipado para listar scripts, secrets de Workers, Secret Stores e gerenciar criação, edição e exclusão.',
      language: 'typescript',
      content: `const CF_BASE = 'https://api.cloudflare.com/client/v4';

export interface WorkerSecretItem {
  name: string;
  type: string;
}

export interface SecretStoreItem {
  id: string;
  name: string;
}

export interface StoreSecretItem {
  id: string;
  name: string;
  comment?: string;
  scopes?: string[];
  modified_on?: string;
}

async function request<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(\`\${CF_BASE}\${path}\`, {
    method,
    headers: {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message || \`Erro Cloudflare (\${res.status})\`);
  }
  return data.result as T;
}

export const cloudflareClient = {
  listScripts: (token: string, accountId: string) =>
    request<Array<{ id: string }>>(token, 'GET', \`/accounts/\${accountId}/workers/scripts\`),

  listWorkerSecrets: (token: string, accountId: string, scriptName: string) =>
    request<WorkerSecretItem[]>(
      token,
      'GET',
      \`/accounts/\${accountId}/workers/scripts/\${encodeURIComponent(scriptName)}/secrets\`
    ),

  upsertWorkerSecret: (
    token: string,
    accountId: string,
    scriptName: string,
    name: string,
    text: string
  ) =>
    request<WorkerSecretItem>(
      token,
      'PUT',
      \`/accounts/\${accountId}/workers/scripts/\${encodeURIComponent(scriptName)}/secrets\`,
      { name, text, type: 'secret_text' }
    ),

  deleteWorkerSecret: (
    token: string,
    accountId: string,
    scriptName: string,
    secretName: string
  ) =>
    request<unknown>(
      token,
      'DELETE',
      \`/accounts/\${accountId}/workers/scripts/\${encodeURIComponent(scriptName)}/secrets/\${encodeURIComponent(secretName)}\`
    ),

  listStores: (token: string, accountId: string) =>
    request<SecretStoreItem[]>(token, 'GET', \`/accounts/\${accountId}/secrets_store/stores\`),

  listStoreSecrets: (token: string, accountId: string, storeId: string) =>
    request<StoreSecretItem[]>(
      token,
      'GET',
      \`/accounts/\${accountId}/secrets_store/stores/\${storeId}/secrets\`
    ),

  createStoreSecret: (
    token: string,
    accountId: string,
    storeId: string,
    secret: { name: string; value: string; comment?: string; scopes?: string[] }
  ) =>
    request<StoreSecretItem[]>(
      token,
      'POST',
      \`/accounts/\${accountId}/secrets_store/stores/\${storeId}/secrets\`,
      [secret]
    ),

  updateStoreSecret: (
    token: string,
    accountId: string,
    storeId: string,
    secretId: string,
    payload: { value?: string; comment?: string; scopes?: string[] }
  ) =>
    request<StoreSecretItem>(
      token,
      'PATCH',
      \`/accounts/\${accountId}/secrets_store/stores/\${storeId}/secrets/\${secretId}\`,
      payload
    ),

  deleteStoreSecret: (
    token: string,
    accountId: string,
    storeId: string,
    secretId: string
  ) =>
    request<unknown>(
      token,
      'DELETE',
      \`/accounts/\${accountId}/secrets_store/stores/\${storeId}/secrets/\${secretId}\`
    ),
};
`,
    },
    {
      path: 'src/screens/SecretsDashboardScreen.tsx',
      title: 'Dashboard de Secrets (Listar, Criar & Editar)',
      description:
        'Tela principal do app React Native listando secrets da Cloudflare com modal interativo para criação e edição.',
      language: 'typescript',
      content: `import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CloudflareCredentials } from '../auth/cloudflareKeychain';
import { cloudflareClient, WorkerSecretItem } from '../services/cloudflareClient';
import { useAppTheme } from '../theme/theme';

interface Props {
  credentials: CloudflareCredentials;
  onLock: () => void;
}

export function SecretsDashboardScreen({ credentials, onLock }: Props) {
  const { colors } = useAppTheme();
  const [scripts, setScripts] = useState<string[]>([]);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [secrets, setSecrets] = useState<WorkerSecretItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');

  const loadSecrets = useCallback(async () => {
    if (!credentials.accountId) return;
    setLoading(true);
    try {
      const list = await cloudflareClient.listScripts(
        credentials.apiToken,
        credentials.accountId
      );
      const names = list.map((s) => s.id);
      setScripts(names);
      const target = selectedScript || names[0] || '';
      setSelectedScript(target);
      if (target) {
        const items = await cloudflareClient.listWorkerSecrets(
          credentials.apiToken,
          credentials.accountId,
          target
        );
        setSecrets(items);
      }
    } finally {
      setLoading(false);
    }
  }, [credentials, selectedScript]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const handleSaveSecret = async () => {
    if (!credentials.accountId || !selectedScript || !secretName.trim() || !secretValue) {
      return;
    }
    await cloudflareClient.upsertWorkerSecret(
      credentials.apiToken,
      credentials.accountId,
      selectedScript,
      secretName.trim(),
      secretValue
    );
    setModalOpen(false);
    setSecretName('');
    setSecretValue('');
    setEditingName(null);
    loadSecrets();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {credentials.profileLabel}
          </Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            Worker: {selectedScript || 'Nenhum'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              setEditingName(null);
              setSecretName('');
              setSecretValue('');
              setModalOpen(true);
            }}
            style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.primaryBtnText}>Nova Secret</Text>
          </Pressable>
          <Pressable
            onPress={onLock}
            style={[styles.outlineBtn, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.text, fontSize: 13 }}>Bloquear</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={secrets}
        keyExtractor={(item) => item.name}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSecrets} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setEditingName(item.name);
              setSecretName(item.name);
              setSecretValue('');
              setModalOpen(true);
            }}
            style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View>
              <Text style={[styles.secretName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.secretMeta, { color: colors.muted }]}>
                {item.type} · Somente gravação
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>
              Editar
            </Text>
          </Pressable>
        )}
      />

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingName ? \`Rotacionar \${editingName}\` : 'Nova Secret'}
            </Text>
            <TextInput
              value={secretName}
              onChangeText={setSecretName}
              editable={!editingName}
              placeholder="NOME_DA_SECRET"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
            <TextInput
              value={secretValue}
              onChangeText={setSecretValue}
              placeholder="Valor da secret"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setModalOpen(false)}
                style={[styles.outlineBtn, { borderColor: colors.border, flex: 1 }]}
              >
                <Text style={{ color: colors.text, textAlign: 'center' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveSecret}
                style={[styles.primaryBtn, { backgroundColor: colors.accent, flex: 1 }]}
              >
                <Text style={[styles.primaryBtnText, { textAlign: 'center' }]}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 52,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  primaryBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  outlineBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  list: { padding: 16, gap: 10 },
  rowCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secretName: { fontSize: 14, fontWeight: '600', fontFamily: 'monospace' },
  secretMeta: { fontSize: 12, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: { padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, height: 46, paddingHorizontal: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
`,
    },
    {
      path: 'src/theme/theme.ts',
      title: 'Tema Claro / Escuro / Sistema',
      description: 'Tokens de cor adaptáveis ao tema do sistema operacional ou preferência manual.',
      language: 'typescript',
      content: `import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
  accent: '#EA580C',
};

export const darkColors = {
  background: '#0B1120',
  surface: '#111827',
  border: '#1E293B',
  text: '#F8FAFC',
  muted: '#94A3B8',
  accent: '#F38020',
};

export function useAppTheme(override?: 'light' | 'dark' | 'system') {
  const systemScheme = useColorScheme();
  const active =
    override && override !== 'system'
      ? override
      : systemScheme === 'dark'
        ? 'dark'
        : 'light';

  return {
    mode: active,
    colors: active === 'dark' ? darkColors : lightColors,
  };
}
`,
    },
    {
      path: 'App.tsx',
      title: 'Entrypoint React Native',
      description:
        'Gerencia o estado da sessão em memória, restaura o perfil do react-native-keychain e alterna entre AuthSetup e Dashboard.',
      language: 'typescript',
      content: `import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CloudflareCredentials,
  getCloudflareCredentials,
  listStoredProfiles,
} from './src/auth/cloudflareKeychain';
import { AuthSetupScreen } from './src/screens/AuthSetupScreen';
import { SecretsDashboardScreen } from './src/screens/SecretsDashboardScreen';
import { useAppTheme } from './src/theme/theme';

export default function App() {
  const { mode } = useAppTheme();
  const [activeCreds, setActiveCreds] = useState<CloudflareCredentials | null>(null);

  useEffect(() => {
    (async () => {
      const profiles = await listStoredProfiles();
      if (profiles.length > 0) {
        const creds = await getCloudflareCredentials(profiles[0].profileId);
        if (creds) setActiveCreds(creds);
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      {activeCreds ? (
        <SecretsDashboardScreen
          credentials={activeCreds}
          onLock={() => setActiveCreds(null)}
        />
      ) : (
        <AuthSetupScreen onAuthenticated={setActiveCreds} />
      )}
    </SafeAreaProvider>
  );
}
`,
    },
    {
      path: 'package.json',
      title: 'Dependências React Native',
      description: 'Manifesto com react-native-keychain e dependências nativas.',
      language: 'json',
      content: `{
  "name": "cf-vault-mobile",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "start": "react-native start",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "react": "19.0.0",
    "react-native": "0.79.0",
    "react-native-keychain": "^9.2.2",
    "react-native-safe-area-context": "^5.3.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.7.2"
  }
}
`,
    },
    {
      path: 'README.md',
      title: 'Guia de Instalação & Keychain',
      description: 'Instruções para instalar dependências iOS/Android e configurar FaceID/Keystore.',
      language: 'markdown',
      content: `# CF Vault Mobile (React Native)

Aplicativo React Native para gerenciar **Workers Secrets** e **Secrets Store** da Cloudflare usando \`react-native-keychain\`.

## Instalação

\`\`\`bash
npm install
cd ios && pod install && cd ..
\`\`\`

## Configuração iOS (Info.plist)

Adicione a permissão de FaceID caso habilite \`requireBiometry\`:

\`\`\`xml
<key>NSFaceIDUsageDescription</key>
<string>Autentique-se para desbloquear suas credenciais Cloudflare.</string>
\`\`\`

## Execução

\`\`\`bash
npm run ios
# ou
npm run android
\`\`\`
`,
    },
  ];
}

export async function downloadReactNativeZip(): Promise<void> {
  const zip = new JSZip();
  const files = getReactNativeProjectFiles();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'cf-vault-react-native.zip';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
