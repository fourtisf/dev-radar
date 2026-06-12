/**
 * Minimal SIWS via the injected Phantom-compatible provider
 * (window.solana). No adapter dependency — the MVP needs exactly
 * connect + signMessage.
 */
interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, encoding: 'utf8'): Promise<{ signature: Uint8Array }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

function toBase58(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      const x = digits[i]! * 256 + carry;
      digits[i] = x % 58;
      carry = Math.floor(x / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = '';
  for (const byte of bytes) {
    if (byte === 0) out += ALPHABET[0];
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!];
  return out;
}

export class WalletError extends Error {}

/** Full SIWS flow: connect → nonce → signMessage → verify (sets cookie). */
export async function signInWithSolana(): Promise<{ wallet: string; tier: string }> {
  const provider = window.solana;
  if (!provider) {
    throw new WalletError('No Solana wallet found — install Phantom (or compatible).');
  }

  const { publicKey } = await provider.connect();
  const wallet = publicKey.toBase58();

  const nonceRes = await fetch('/api/auth/nonce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  if (!nonceRes.ok) throw new WalletError('Could not start sign-in.');
  const { message } = (await nonceRes.json()) as { message: string };

  const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
  const signature = toBase58(signed.signature);

  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet, signature }),
  });
  if (!verifyRes.ok) throw new WalletError('Signature rejected.');
  const data = (await verifyRes.json()) as { user: { wallet: string; tier: string } };
  return { wallet: data.user.wallet, tier: data.user.tier };
}
