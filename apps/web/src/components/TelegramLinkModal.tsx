'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/lib/client/toast';

interface LinkInfo {
  code: string;
  command: string;
  botUrl: string;
  linked: boolean;
}

/** "Set alert" flow: one-time /start code for the Telegram bot. */
export function TelegramLinkModal({ onClose }: { onClose: () => void }): JSX.Element {
  const { toast } = useToast();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/telegram/link', { method: 'POST' }).then(async (res) => {
      if (res.status === 401) {
        setError('Connect your wallet first to link Telegram alerts.');
        return;
      }
      if (!res.ok) {
        setError('Could not generate a link code.');
        return;
      }
      setInfo((await res.json()) as LinkInfo);
    });
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="t">Telegram alerts</span>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {error ? (
            <p className="pay-note">{error}</p>
          ) : !info ? (
            <p className="pay-note">Generating one-time code…</p>
          ) : (
            <>
              {info.linked ? (
                <p className="pay-note" style={{ marginBottom: 14 }}>
                  Already linked — sending this code re-links the chat.
                </p>
              ) : null}
              <div className="pay-row">
                <span className="k">Send</span>
                <b>{info.command}</b>
                <span
                  className="cp"
                  title="Copy command"
                  onClick={() => {
                    void navigator.clipboard?.writeText(info.command).catch(() => undefined);
                    toast('g', 'Command copied');
                  }}
                >
                  ⧉
                </span>
              </div>
              <a
                className="btn btn-gold"
                style={{ width: '100%', marginTop: 14 }}
                href={info.botUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open @DevRadarBot
              </a>
              <p className="pay-note">
                Winner-only mode · min DR Score · watchlist pings — tune with <i>/settings</i>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
