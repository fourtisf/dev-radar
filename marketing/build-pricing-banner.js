const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

// ── Brand tokens ──────────────────────────────────────────────────
const C = {
  black: '#060607', panel: '#101013',
  hair: 'rgba(255,255,255,0.08)', hair2: 'rgba(255,255,255,0.16)',
  gold: '#E2B65B', goldHi: '#F4D789', goldDeep: '#B9893A',
  white: '#F4F2EC', grey: '#9C9A93', grey2: '#5F5D58',
  win: '#5CDD94',
};
const W = 1600, H = 900;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Tier card ─────────────────────────────────────────────────────
function check(x, y, color) {
  return `<g transform="translate(${x},${y})" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M0 5 L4 9 L11 0"/></g>`;
}

function card(x, t) {
  const w = 460, h = 566, top = 274;
  const pad = 34;
  const featured = t.featured;
  const accent = featured ? C.gold : C.grey;
  const cardStroke = featured ? `stroke="${C.gold}" stroke-opacity="0.55"` : `stroke="${C.hair2}"`;
  const parts = [];

  // body
  parts.push(`<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="22" fill="${featured ? '#15130E' : 'url(#cardbg)'}" ${cardStroke}/>`);
  if (featured) {
    parts.push(`<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="22" fill="none" stroke="${C.gold}" stroke-opacity="0.14"/>`);
    // MOST DEPLOYED badge
    const bw = 168, bx = x + (w - bw) / 2, by = top - 18;
    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="34" rx="17" fill="url(#goldbtn)"/>`);
    parts.push(`<text x="${x + w / 2}" y="${by + 22}" text-anchor="middle" font-family="Geist Mono" font-weight="600" font-size="12" letter-spacing="2" fill="#1A1305">MOST DEPLOYED</text>`);
  }

  const cx = x + pad;
  // tier name
  parts.push(`<text x="${cx}" y="${top + 56}" font-family="Geist Mono" font-weight="600" font-size="15" letter-spacing="3.5" fill="${accent}">${t.name}</text>`);
  // price
  parts.push(`<text x="${cx}" y="${top + 116}" font-family="Geist" font-weight="700" font-size="52" letter-spacing="-1.5" fill="${C.white}">${t.price}${t.per ? `<tspan font-family="Geist Mono" font-weight="500" font-size="15" letter-spacing="1" fill="${C.grey2}">  ${t.per}</tspan>` : ''}</text>`);
  // tagline
  parts.push(`<text x="${cx}" y="${top + 150}" font-family="Geist" font-weight="400" font-size="16" fill="${C.grey}">${esc(t.tagline)}</text>`);
  // hairline
  parts.push(`<line x1="${cx}" y1="${top + 176}" x2="${x + w - pad}" y2="${top + 176}" stroke="${C.white}" stroke-opacity="0.08"/>`);
  // features
  let fy = top + 214;
  for (const f of t.features) {
    parts.push(check(cx, fy - 11, featured ? C.win : C.gold));
    parts.push(`<text x="${cx + 24}" y="${fy}" font-family="Geist" font-size="18" fill="${C.grey}"><tspan font-weight="600" fill="${C.white}">${esc(f.b)}</tspan>${f.t ? ` ${esc(f.t)}` : ''}</text>`);
    fy += 40;
  }
  // CTA
  const by = top + h - 74, bw = w - pad * 2;
  if (featured) {
    parts.push(`<rect x="${cx}" y="${by}" width="${bw}" height="54" rx="27" fill="url(#goldbtn)"/>`);
    parts.push(`<text x="${x + w / 2}" y="${by + 34}" text-anchor="middle" font-family="Geist Mono" font-weight="600" font-size="15" letter-spacing="2" fill="#1A1305">${t.cta}</text>`);
  } else {
    parts.push(`<rect x="${cx}" y="${by}" width="${bw}" height="54" rx="27" fill="none" stroke="${C.hair2}"/>`);
    parts.push(`<text x="${x + w / 2}" y="${by + 34}" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="14" letter-spacing="2" fill="${C.white}">${t.cta}</text>`);
  }
  return parts.join('\n');
}

const TIERS = [
  {
    name: 'SCOUT', price: 'Free', tagline: 'For checking before you ape.', cta: 'START SCANNING',
    features: [
      { b: '10 dossiers', t: 'per day' },
      { b: 'Classification', t: '& core history' },
      { b: 'Live feed', t: '· real time' },
      { b: 'Community', t: 'Telegram channel' },
    ],
  },
  {
    name: 'OPERATOR', price: '2 SOL', per: '/ MONTH', tagline: 'For the trenches, at full speed.', cta: 'GO OPERATOR', featured: true,
    features: [
      { b: 'Unlimited', t: 'dossiers & DR Scores' },
      { b: 'Real-time', t: 'Telegram alerts' },
      { b: 'Bundle & sniper', t: 'detection' },
      { b: 'Ghost Match', t: '+ funding trace' },
      { b: 'Custom', t: 'dev watchlists' },
    ],
  },
  {
    name: 'SYNDICATE', price: '8 SOL', per: '/ MONTH', tagline: 'For groups, bots and builders.', cta: 'REQUEST ACCESS',
    features: [
      { b: 'Everything', t: 'in Operator' },
      { b: 'API', t: '+ webhooks' },
      { b: '5 seats', t: 'included' },
      { b: 'Priority', t: 'trace queue' },
      { b: 'Direct line', t: 'to the team' },
    ],
  },
];

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goldtx" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="${C.goldHi}"/><stop offset="0.5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/>
    </linearGradient>
    <linearGradient id="goldbtn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.goldHi}"/><stop offset="0.55" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.gold}" stop-opacity="0.16"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cardbg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#121216"/><stop offset="1" stop-color="#0B0B0E"/>
    </linearGradient>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${C.black}"/>
  <rect x="400" y="-360" width="800" height="800" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.05"/>

  <!-- top bar -->
  <g transform="translate(122,84) scale(0.30)">
    <path d="M -100 0 C -55 -42 55 -42 100 0 C 55 42 -55 42 -100 0 Z" fill="none" stroke="url(#goldbtn)" stroke-width="11" stroke-linejoin="round"/>
    <circle r="40" fill="${C.gold}" fill-opacity="0.06" stroke="url(#goldbtn)" stroke-width="6" stroke-opacity="0.7"/>
    <circle r="27" fill="url(#goldbtn)"/>
    <circle cx="11" cy="-11" r="7" fill="${C.black}"/>
  </g>
  <text x="164" y="93" font-family="Geist" font-weight="600" font-size="27" letter-spacing="3" fill="${C.white}">DEV<tspan fill="${C.gold}">RADAR</tspan></text>
  <text x="${W - 96}" y="91" text-anchor="end" font-family="Geist Mono" font-weight="500" font-size="15" letter-spacing="2" fill="${C.grey}">@DevRadarS <tspan fill="${C.gold}">·</tspan> t.me/devradars</text>
  <line x1="96" y1="132" x2="${W - 96}" y2="132" stroke="${C.white}" stroke-opacity="0.08"/>

  <!-- headline -->
  <text x="${W / 2}" y="196" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="15" letter-spacing="4" fill="${C.gold}">ACCESS</text>
  <text x="${W / 2}" y="244" text-anchor="middle" font-family="Geist" font-weight="700" font-size="38" letter-spacing="-1" fill="${C.white}">Priced in SOL. Paid for by <tspan fill="url(#goldtx)">one avoided rug.</tspan></text>

  ${card(80, TIERS[0])}
  ${card(570, TIERS[1])}
  ${card(1060, TIERS[2])}
</svg>`;

fs.writeFileSync(path.join(__dirname, 'devradar-pricing-banner.svg'), svg);
const fontDir = path.join(__dirname, 'fonts');
const fontFiles = fs.readdirSync(fontDir).map((f) => path.join(fontDir, f));
const resvg = new Resvg(svg, {
  background: C.black,
  fitTo: { mode: 'width', value: W },
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' },
});
fs.writeFileSync(path.join(__dirname, 'devradar-pricing-banner.png'), resvg.render().asPng());
console.log('rendered devradar-pricing-banner.png');
