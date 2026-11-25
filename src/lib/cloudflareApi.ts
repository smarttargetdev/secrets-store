import type {
  CloudflareAccount,
  CloudflareApiResponse,
  CloudflareZone,
  SecretStore,
  StoreSecret,
  TokenVerifyResult,
  WorkerScript,
  WorkerSecret,
} from '../types/cloudflare';

async function cfRequest<T>(
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown
): Promise<T> {
  const res = await fetch('/api/cloudflare/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cloudflare-Token': token.trim(),
    },
    body: JSON.stringify({ method, path, payload }),
  });

  const data = (await res.json()) as CloudflareApiResponse<T>;
  if (!res.ok || !data.success) {
    const firstError = data.errors?.[0];
    const msg = firstError
      ? `${firstError.message} (código ${firstError.code})`
      : `Erro HTTP ${res.status} na API da Cloudflare.`;
    throw new Error(msg);
  }

  return data.result;
}

export const cloudflareApi = {
  verifyToken(token: string): Promise<TokenVerifyResult> {
    return cfRequest<TokenVerifyResult>(token, 'GET', '/user/tokens/verify');
  },

  listAccounts(token: string): Promise<CloudflareAccount[]> {
    return cfRequest<CloudflareAccount[]>(token, 'GET', '/accounts?per_page=50');
  },

  listZones(token: string): Promise<CloudflareZone[]> {
    return cfRequest<CloudflareZone[]>(token, 'GET', '/zones?per_page=50');
  },

  getZone(token: string, zoneId: string): Promise<CloudflareZone> {
    return cfRequest<CloudflareZone>(
      token,
      'GET',
      `/zones/${encodeURIComponent(zoneId.trim())}`
    );
  },

  // Workers Secrets
  listWorkerScripts(token: string, accountId: string): Promise<WorkerScript[]> {
    return cfRequest<WorkerScript[]>(
      token,
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts`
    );
  },

  listWorkerSecrets(
    token: string,
    accountId: string,
    scriptName: string
  ): Promise<WorkerSecret[]> {
    return cfRequest<WorkerSecret[]>(
      token,
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`
    );
  },

  upsertWorkerSecret(
    token: string,
    accountId: string,
    scriptName: string,
    name: string,
    text: string
  ): Promise<WorkerSecret> {
    return cfRequest<WorkerSecret>(
      token,
      'PUT',
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`,
      {
        name: name.trim(),
        text,
        type: 'secret_text',
      }
    );
  },

  bulkWorkerSecrets(
    token: string,
    accountId: string,
    scriptName: string,
    secrets: Record<string, { type: 'secret_text'; name: string; text: string } | null>
  ): Promise<unknown> {
    return cfRequest<unknown>(
      token,
      'PATCH',
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets-bulk`,
      { secrets }
    );
  },

  deleteWorkerSecret(
    token: string,
    accountId: string,
    scriptName: string,
    secretName: string
  ): Promise<unknown> {
    return cfRequest<unknown>(
      token,
      'DELETE',
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets/${encodeURIComponent(secretName)}`
    );
  },

  // Secrets Store
  listSecretStores(token: string, accountId: string): Promise<SecretStore[]> {
    return cfRequest<SecretStore[]>(
      token,
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores?per_page=50`
    );
  },

  createSecretStore(
    token: string,
    accountId: string,
    name: string
  ): Promise<SecretStore[]> {
    return cfRequest<SecretStore[]>(
      token,
      'POST',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores`,
      [{ name: name.trim() }]
    );
  },

  deleteSecretStore(
    token: string,
    accountId: string,
    storeId: string
  ): Promise<unknown> {
    return cfRequest<unknown>(
      token,
      'DELETE',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores/${encodeURIComponent(storeId)}`
    );
  },

  listStoreSecrets(
    token: string,
    accountId: string,
    storeId: string
  ): Promise<StoreSecret[]> {
    return cfRequest<StoreSecret[]>(
      token,
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores/${encodeURIComponent(storeId)}/secrets?per_page=100`
    );
  },

  createStoreSecrets(
    token: string,
    accountId: string,
    storeId: string,
    secrets: Array<{
      name: string;
      value: string;
      comment?: string;
      scopes?: string[];
    }>
  ): Promise<StoreSecret[]> {
    return cfRequest<StoreSecret[]>(
      token,
      'POST',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores/${encodeURIComponent(storeId)}/secrets`,
      secrets
    );
  },

  updateStoreSecret(
    token: string,
    accountId: string,
    storeId: string,
    secretId: string,
    payload: {
      value?: string;
      comment?: string;
      scopes?: string[];
    }
  ): Promise<StoreSecret> {
    return cfRequest<StoreSecret>(
      token,
      'PATCH',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores/${encodeURIComponent(storeId)}/secrets/${encodeURIComponent(secretId)}`,
      payload
    );
  },

  deleteStoreSecret(
    token: string,
    accountId: string,
    storeId: string,
    secretId: string
  ): Promise<unknown> {
    return cfRequest<unknown>(
      token,
      'DELETE',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores/${encodeURIComponent(storeId)}/secrets/${encodeURIComponent(secretId)}`
    );
  },

  duplicateStoreSecret(
    token: string,
    accountId: string,
    storeId: string,
    secretId: string,
    newName: string,
    comment?: string,
    scopes?: string[]
  ): Promise<StoreSecret> {
    return cfRequest<StoreSecret>(
      token,
      'POST',
      `/accounts/${encodeURIComponent(accountId)}/secrets_store/stores/${encodeURIComponent(storeId)}/secrets/${encodeURIComponent(secretId)}/duplicate`,
      {
        name: newName.trim(),
        ...(comment ? { comment } : {}),
        ...(scopes && scopes.length > 0 ? { scopes } : {}),
      }
    );
  },
};
