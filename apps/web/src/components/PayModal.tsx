'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useToast } from '@/lib/client/toast';
import { signInWithSolana, WalletError } from '@/lib/client/wallet';
import type { MeDto } from '@/lib/client/types';

interface PayInfo {
  treasury: string;
  memo: string | null;
  tiers: Record<'OPERATOR' | 'SYNDICATE', { sol: number; url: string | null }>;
}

interface PayModalProps {
  tier: 'OPERATOR' | 'SYNDICATE';
  me: MeDto;
  refreshMe: () => Promise<MeDto>;
  onClose: () => void;
}

/**
 * SOL payment flow (handoff Section 11): "Send exactly N SOL with memo
 * DR-<userId>" + Solana Pay QR + copy buttons; polls /api/me until the
 * worker's payment watcher flips the tier (≤60s).
 */
export function PayModal({ tier, me, refreshMe, onClose }: PayModalProps): JSX.Element {
  const { toast } = useToast();
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [upgraded, setUpgraded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadInfo = useCallback(async () => {
    const res = await fetch('/api/pay');
    if (!res.ok) {
      setUnavailable(true);
      return;
    }
    setInfo((await res.json()) as PayInfo);
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo, me.authenticated]);

  useEffect(() => {
    const url = info?.tiers[tier]?.url;
    if (!url) return;
    void QRCode.toDataURL(url, { margin: 0, width: 336 }).then(setQr);
  }, [info, tier]);

  // Poll for the tier flip while the modal is open.
  useEffect(() => {
    if (!me.authenticated) return;
    pollRef.current = setInterval(() => {
      void refreshMe().then((fresh) => {
        if (fresh.tier === tier) {
          setUpgraded(true);
          toast('w', `Tier upgraded — <b>${tier}</b> active`);
          setTimeout(onClose, 1800);
        }
      });
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [me.authenticated, refreshMe, tier, onClose, toast]);

  const copy = (label: string, value: string): void => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    toast('g', `${label} copied`);
  };

  const connect = async (): Promise<void> => {
    try {
      await signInWithSolana();
      await refreshMe();
      await loadInfo();
    } catch (err) {
      toast('r', err instanceof WalletError ? err.message : 'Wallet connection failed');
    }
  };

  const sol = info?.tiers[tier]?.sol ?? (tier === 'OPERATOR' ? 2 : 8);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="t">Go {tier.toLowerCase()} · SOL payment</span>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {unavailable ? (
            <p className="pay-note">Payments are not configured on this deployment yet.</p>
          ) : !me.authenticated ? (
            <>
              <p className="pay-note" style={{ marginBottom: 18 }}>
                Connect your wallet first — the payment memo is bound to your account.
              </p>
              <button className="btn btn-gold" style={{ width: '100%' }} onClick={() => void connect()}>
                Connect wallet
              </button>
            </>
          ) : !info ? (
            <p className="pay-note">Loading…</p>
          ) : (
            <>
              <div className="pay-amount">
                Send exactly <i>{sol.toFixed(3)} SOL</i>
              </div>
              {qr ? (
                <div className="pay-qr">
                  {/* Solana Pay QR for wallet apps */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`Solana Pay QR for ${sol} SOL`} />
                </div>
              ) : null}
              <div className="pay-row">
                <span className="k">To</span>
                <b>{info.treasury}</b>
                <span className="cp" onClick={() => copy('Treasury address', info.treasury)} title="Copy address">
                  ⧉
                </span>
              </div>
              <div className="pay-row">
                <span className="k">Memo</span>
                <b>{info.memo}</b>
                <span className="cp" onClick={() => info.memo && copy('Memo', info.memo)} title="Copy memo">
                  ⧉
                </span>
              </div>
              <div className={`pay-status${upgraded ? ' ok' : ''}`}>
                <span className="dot" />
                {upgraded ? 'Tier active — welcome aboard' : 'Watching treasury · upgrades in ≤ 60s'}
              </div>
              <p className="pay-note">
                Include the memo · 30 days per payment · no <i>KYC</i>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
