/**
 * Sign-In With Solana message. Built identically on client and server —
 * the wallet signs this exact string, the server verifies it against
 * the Redis-stored nonce. No gas, no transaction.
 */
export function buildSiwsMessage(wallet: string, nonce: string): string {
  return [
    'DevRadar wants you to sign in with your Solana account:',
    wallet,
    '',
    'No transaction will be made. This is proof of key ownership only.',
    `Nonce: ${nonce}`,
  ].join('\n');
}

export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
