# DevRadar API — curl walkthrough

Wire format reference + proof-of-life for every endpoint (handoff
Section 8). All routes are rate-limited per IP (240 req/min). Examples
assume `http://localhost:3000` and a worker running with replayed
fixtures (`pnpm replay`).

## Feed

```bash
curl -s 'localhost:3000/api/feed?filter=all'
# → { "tier":"SCOUT", "delaySeconds":300, "rows":[ { "token":{...}, "dev":{...} } ], "nextCursor":"…" }
#   SCOUT (and anonymous) sees rows ≥5 min old only; OPERATOR/SYNDICATE realtime.
curl -s 'localhost:3000/api/feed?filter=win&cursor=<nextCursor>'   # filters: all|win|rug|fresh
```

## Live SSE

```bash
curl -N localhost:3000/api/feed/live
# data: {"type":"hello","tier":"SCOUT","delaySeconds":300}
# data: {"type":"deploy","token":{…},"dev":{…}}          ← delayed 5 min for SCOUT
# data: {"type":"dossier-update","wallet":"…","drScore":46,…}
# : hb 1781258…                                           ← heartbeat every 25s
```

## Dossiers

```bash
# Known dev → 200 full dossier
curl -s localhost:3000/api/dev/7xKpW9fQmDEVWALLETxxxxxxxxxxxxxxxxxxxxx9fQm
# → { "dev":{ wallet, verdict, confidence, launchCount, rugCount, cleanCount,
#             bestAthUsd, medianLifespanS, fundingType, fundingPath, flagged,
#             backfilled, rugRatePct }, "drScore":46, "tokens":[…] }

# Never-seen wallet → backfill enqueued, poll until 200
curl -s -w '%{http_code}' localhost:3000/api/dev/<unseen-wallet>
# → {"status":"tracing","wallet":"…"} 202

# SCOUT quota: 11th unique dossier in a day →
# → {"error":"dossier_quota","used":11,"limit":10,"tier":"SCOUT"} 429
```

## Token + trace

```bash
curl -s localhost:3000/api/token/GiGABRA1NM1NTxxxxxxxxxxxxxxxxxxxxxxxxxxx1111
# → { "token":{…}, "dossier":{…} }   (404 if unknown mint)

curl -s -X POST localhost:3000/api/trace -H 'content-type: application/json' \
  -d '{"q":"GiGABRA1NM1NTxxxxxxxxxxxxxxxxxxxxxxxxxxx1111"}'
# known mint   → {"kind":"token","mint":"…","dossier":{…}}
# known wallet → {"kind":"dev","dossier":{…}}
# cold         → {"status":"tracing","query":"…"} 202   (client re-POSTs ~2.5s)
# unresolvable → {"error":"not_found"} 404
# not base58   → {"error":"invalid_query"} 400
```

## Leaderboard

```bash
curl -s 'localhost:3000/api/leaderboard?type=winners'   # or type=ruggers
# → { "type":"winners", "rows":[ { "dev":{…}, "drScore":91 } ] }  (top 20)
```

## Auth (Sign-In With Solana)

```bash
# 1) nonce (5-min TTL, single use)
curl -s -X POST localhost:3000/api/auth/nonce -H 'content-type: application/json' \
  -d '{"wallet":"<base58>"}'
# → { "nonce":"…", "message":"DevRadar wants you to sign in…\nNonce: …" }

# 2) wallet signs `message` (ed25519) → verify sets httpOnly JWT cookie
curl -s -c jar.txt -X POST localhost:3000/api/auth/verify -H 'content-type: application/json' \
  -d '{"wallet":"<base58>","signature":"<base58 sig>"}'
# → { "user": { "id":"…", "wallet":"…", "tier":"SCOUT" } }

curl -s -b jar.txt localhost:3000/api/me
# → { "authenticated":true, "id", "wallet", "tier", "tierExpires", "alertPrefs", "telegramLinked" }

curl -s -X POST localhost:3000/api/auth/logout
```

## Watchlist (auth required)

```bash
curl -s -b jar.txt -X POST localhost:3000/api/watchlist \
  -H 'content-type: application/json' -d '{"devWallet":"<base58>"}'   # → {"ok":true}
curl -s -b jar.txt localhost:3000/api/watchlist
# → { "rows":[ { "wallet":"…", "dev":{…}|null, "lastLaunch":{mint,symbol,createdAt}|null } ] }
curl -s -b jar.txt -X DELETE 'localhost:3000/api/watchlist?devWallet=<base58>'
# unauthenticated → 401
```

## Telegram link (auth required)

```bash
curl -s -b jar.txt -X POST localhost:3000/api/telegram/link
# → { "code":"…", "command":"/start <code>", "botUrl":"https://t.me/DevRadarBot?start=…", "linked":false }
```

## Payments

```bash
curl -s -b jar.txt localhost:3000/api/pay
# → { "treasury":"…", "memo":"DR-<userId>",
#     "tiers": { "OPERATOR":{"sol":2,"url":"solana:…"}, "SYNDICATE":{"sol":8,"url":"solana:…"} } }
# 503 if TREASURY_WALLET is unset. Tier flips ≤60s after the on-chain
# payment with the memo lands (worker payment watcher).
```
