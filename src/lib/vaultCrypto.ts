import type { CloudflareProfile } from '../types/cloudflare';

const VAULT_STORAGE_KEY = 'cf_vault_encrypted_v1';
const VERIFIER_TEXT = 'CF_VAULT_VERIFIED_V1';
const PBKDF2_ITERATIONS = 120_000;

interface EncryptedPayload {
  iv: string;
  data: string;
}

interface StoredVault {
  version: 1;
  salt: string;
  verifier: EncryptedPayload;
  profilesCipher: EncryptedPayload;
  updatedAt: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const ivBuffer = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuffer);
  window.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const iv = fromBase64(payload.iv);
  const data = fromBase64(payload.data);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

export function hasEncryptedVault(): boolean {
  try {
    return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function createEncryptedVault(
  pin: string,
  initialProfiles: CloudflareProfile[]
): Promise<void> {
  if (!isValidPin(pin)) {
    throw new Error('O PIN deve conter entre 4 e 6 dígitos numéricos.');
  }

  const saltBuffer = new ArrayBuffer(16);
  const salt = new Uint8Array(saltBuffer);
  window.crypto.getRandomValues(salt);
  const key = await deriveKey(pin, salt);

  const verifier = await encryptText(key, VERIFIER_TEXT);
  const profilesCipher = await encryptText(key, JSON.stringify(initialProfiles));

  const vault: StoredVault = {
    version: 1,
    salt: toBase64(salt),
    verifier,
    profilesCipher,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
}

export async function unlockEncryptedVault(pin: string): Promise<CloudflareProfile[]> {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) {
    throw new Error('Nenhum cofre encontrado neste dispositivo.');
  }

  let vault: StoredVault;
  try {
    vault = JSON.parse(raw) as StoredVault;
  } catch {
    throw new Error('Cofre local corrompido.');
  }

  const salt = fromBase64(vault.salt);
  const key = await deriveKey(pin, salt);

  let verified = '';
  try {
    verified = await decryptText(key, vault.verifier);
  } catch {
    throw new Error('PIN incorreto.');
  }

  if (verified !== VERIFIER_TEXT) {
    throw new Error('PIN incorreto.');
  }

  const profilesJson = await decryptText(key, vault.profilesCipher);
  const parsed = JSON.parse(profilesJson) as CloudflareProfile[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveEncryptedProfiles(
  pin: string,
  profiles: CloudflareProfile[]
): Promise<void> {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) {
    await createEncryptedVault(pin, profiles);
    return;
  }

  const vault = JSON.parse(raw) as StoredVault;
  const salt = fromBase64(vault.salt);
  const key = await deriveKey(pin, salt);

  const verified = await decryptText(key, vault.verifier);
  if (verified !== VERIFIER_TEXT) {
    throw new Error('PIN inválido para atualizar o cofre.');
  }

  const updatedVault: StoredVault = {
    ...vault,
    profilesCipher: await encryptText(key, JSON.stringify(profiles)),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updatedVault));
}

export async function changeVaultPin(oldPin: string, newPin: string): Promise<void> {
  if (!isValidPin(newPin)) {
    throw new Error('O novo PIN deve conter entre 4 e 6 dígitos numéricos.');
  }
  const profiles = await unlockEncryptedVault(oldPin);
  await createEncryptedVault(newPin, profiles);
}

export function wipeEncryptedVault(): void {
  localStorage.removeItem(VAULT_STORAGE_KEY);
}
