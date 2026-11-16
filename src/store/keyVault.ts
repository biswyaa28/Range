/**
 * Optional passphrase layer for the web AI key.
 *
 * The normal store already uses the browser vault. This wraps the secret a
 * second time with PBKDF2-SHA-256 and AES-GCM so someone with access to the
 * device vault still needs the passphrase. The passphrase itself is never
 * stored; losing it makes the wrapped key unrecoverable by design.
 */
export const VAULT_PREFIX = 'vault:v1:';
export const PBKDF2_ITERATIONS = 310_000;

export interface VaultCrypto {
  subtle: SubtleCrypto;
  random(bytes: number): Uint8Array;
}

export const webVaultCrypto: VaultCrypto = {
  get subtle() {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable');
    return subtle;
  },
  random(bytes: number): Uint8Array {
    const out = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(out);
    return out;
  },
};

interface Envelope {
  salt: string;
  iv: string;
  data: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function passphraseKey(
  passphrase: string,
  salt: Uint8Array,
  cryptoImpl: VaultCrypto,
): Promise<CryptoKey> {
  const material = await cryptoImpl.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return cryptoImpl.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isVaultValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(VAULT_PREFIX);
}

export async function sealSecret(
  secret: string,
  passphrase: string,
  cryptoImpl: VaultCrypto = webVaultCrypto,
): Promise<string> {
  if (!passphrase) throw new Error('A passphrase is required');
  const salt = cryptoImpl.random(16);
  const iv = cryptoImpl.random(12);
  const key = await passphraseKey(passphrase, salt, cryptoImpl);
  const encrypted = await cryptoImpl.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(secret) as BufferSource,
  );
  const envelope: Envelope = {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
  return VAULT_PREFIX + JSON.stringify(envelope);
}

export async function openSecret(
  value: string,
  passphrase: string,
  cryptoImpl: VaultCrypto = webVaultCrypto,
): Promise<string> {
  if (!isVaultValue(value)) throw new Error('Not a passphrase vault');
  if (!passphrase) throw new Error('A passphrase is required');
  let envelope: Envelope;
  try {
    envelope = JSON.parse(value.slice(VAULT_PREFIX.length)) as Envelope;
  } catch {
    throw new Error('The passphrase vault is damaged');
  }
  if (!envelope.salt || !envelope.iv || !envelope.data) {
    throw new Error('The passphrase vault is damaged');
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await passphraseKey(passphrase, salt, cryptoImpl);
  const plain = await cryptoImpl.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    base64ToBytes(envelope.data) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
