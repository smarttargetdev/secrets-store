export type ThemePreference = 'light' | 'dark' | 'system';

export type AppTab = 'dashboard' | 'secrets-store' | 'profiles' | 'react-native';

export type SecretStoreScope =
  | 'workers'
  | 'ai_gateway'
  | 'dex'
  | 'access'
  | 'containers'
  | 'websearch';

export interface CloudflareProfile {
  id: string;
  label: string;
  apiToken: string;
  zoneId: string;
  accountId: string;
  accountName?: string;
  zoneName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudflareAccount {
  id: string;
  name: string;
  created_on?: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  account?: {
    id: string;
    name: string;
  };
}

export interface WorkerScript {
  id: string;
  etag?: string;
  modified_on?: string;
  created_on?: string;
  usage_model?: string;
}

export interface WorkerSecret {
  name: string;
  type: 'secret_text' | string;
}

export interface SecretStore {
  id: string;
  name: string;
  created_on?: string;
  modified_on?: string;
}

export interface StoreSecret {
  id: string;
  store_id?: string;
  name: string;
  comment?: string;
  scopes?: string[];
  status?: string;
  created_on?: string;
  modified_on?: string;
}

export interface TokenVerifyResult {
  id: string;
  status: string;
  not_before?: string;
  expires_on?: string;
}

export interface CloudflareApiError {
  code: number;
  message: string;
}

export interface CloudflareApiResponse<T> {
  success: boolean;
  errors: CloudflareApiError[];
  messages?: Array<{ code: number; message: string }>;
  result: T;
}
