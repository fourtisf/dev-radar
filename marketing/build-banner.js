const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const DIR = __dirname; // marketing/

// ── Brand tokens (from reference/devradar-site.html) ──────────────
const C = {
  black: '#060607', black2: '#0A0A0C', panel: '#101013', panel2: '#15151A',
  hair: 'rgba(255,255,255,0.09)', hair2: 'rgba(255,255,255,0.16)',
  gold: '#E2B65B', goldHi: '#F4D789', goldDeep: '#B9893A',
  white: '#F4F2EC', grey: '#9C9A93', grey2: '#5F5D58',
  win: '#5CDD94', rug: '#F2555C',
};

const W = 1600, H = 900;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goldtx" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="${C.goldHi}"/>
      <stop offset="0.5" stop-color="${C.gold}"/>
      <stop offset="1" stop-color="${C.goldDeep}"/>
    </linearGradient>
    <linearGradient id="goldbtn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.goldHi}"/>
      <stop offset="0.55" stop-color="${C.gold}"/>
      <stop offset="1" stop-color="${C.goldDeep}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.gold}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sweep" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.gold}" stop-opacity="0"/>
      <stop offset="1" stop-color="${C.gold}" stop-opacity="0.85"/>
    </radialGradient>
    <linearGradient id="cardbg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#121216"/>
      <stop offset="1" stop-color="#0B0B0E"/>
    </linearGradient>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>

  <!-- base -->
  <rect width="${W}" height="${H}" fill="${C.black}"/>
  <!-- ambient gold glow top-right -->
  <rect x="780" y="-260" width="1080" height="1080" fill="url(#glow)"/>

  <!-- radar rings behind card -->
  <g stroke="${C.gold}" fill="none">
    <circle cx="1245" cy="470" r="150" stroke-opacity="0.10"/>
    <circle cx="1245" cy="470" r="250" stroke-opacity="0.07"/>
    <circle cx="1245" cy="470" r="360" stroke-opacity="0.05"/>
    <circle cx="1245" cy="470" r="480" stroke-opacity="0.035"/>
  </g>

  <!-- grain overlay -->
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.05"/>

  <!-- ── top bar ──────────────────────────────────────────────── -->
  <!-- radar glyph -->
  <g transform="translate(96,84)">
    <circle r="22" fill="${C.gold}" fill-opacity="0.06" stroke="${C.gold}" stroke-opacity="0.35"/>
    <circle r="13" fill="none" stroke="${C.gold}" stroke-opacity="0.22"/>
    <path d="M0 0 L19 -10 A22 22 0 0 1 19 10 Z" fill="url(#sweep)" opacity="0.65"/>
    <line x1="-22" y1="0" x2="22" y2="0" stroke="${C.gold}" stroke-opacity="0.14"/>
    <line x1="0" y1="-22" x2="0" y2="22" stroke="${C.gold}" stroke-opacity="0.14"/>
    <circle r="3" fill="${C.goldHi}" filter="url(#soft)"/>
    <circle r="2.6" fill="${C.goldHi}"/>
  </g>
  <text x="134" y="93" font-family="Geist" font-weight="600" font-size="27" letter-spacing="3" fill="${C.white}">DEV<tspan fill="${C.gold}">RADAR</tspan></text>
  <text x="${W-96}" y="91" text-anchor="end" font-family="Geist Mono" font-weight="500" font-size="15" letter-spacing="2.5" fill="${C.grey}">DEPLOYER INTELLIGENCE <tspan fill="${C.gold}">·</tspan> SOLANA</text>

  <!-- top hairline -->
  <line x1="96" y1="138" x2="${W-96}" y2="138" stroke="${C.white}" stroke-opacity="0.08"/>

  <!-- ── left column ─────────────────────────────────────────── -->
  <!-- kicker -->
  <circle cx="102" cy="243" r="4.5" fill="${C.gold}"/>
  <text x="118" y="249" font-family="Geist Mono" font-weight="500" font-size="16" letter-spacing="3.5" fill="${C.gold}">PUMP.FUN DEPLOYER RADAR</text>

  <!-- headline -->
  <text x="93" y="360" font-family="Geist" font-weight="700" font-size="92" letter-spacing="-2.5" fill="${C.white}">Know the dev</text>
  <text x="93" y="452" font-family="Geist" font-weight="700" font-size="92" letter-spacing="-2.5" fill="${C.white}">before <tspan fill="url(#goldtx)">you ape.</tspan></text>

  <!-- subhead -->
  <g font-family="Geist" font-weight="400" font-size="24" fill="${C.grey}">
    <text x="96" y="532">Every deployer wallet carries a record — launches, rugs,</text>
    <text x="96" y="568">bundles, funding. DevRadar compiles it into one dossier</text>
    <text x="96" y="604">in under two seconds. <tspan fill="${C.white}">Before your entry, not after.</tspan></text>
  </g>

  <!-- stats -->
  <g font-family="Geist Mono" font-weight="500" font-size="17" letter-spacing="0.5">
    <text x="96" y="680" fill="${C.grey}"><tspan fill="${C.white}">184,302</tspan> indexed   <tspan fill="${C.grey2}">·</tspan>   <tspan fill="${C.rug}">61,448</tspan> rugs flagged   <tspan fill="${C.grey2}">·</tspan>   <tspan fill="${C.win}">1.8s</tspan> median trace</text>
  </g>

  <!-- CTA -->
  <rect x="96" y="724" width="290" height="58" rx="29" fill="url(#goldbtn)"/>
  <text x="241" y="761" text-anchor="middle" font-family="Geist Mono" font-weight="600" font-size="16" letter-spacing="2" fill="#1A1305">TRACE ANY WALLET</text>
  <rect x="402" y="724" width="250" height="58" rx="29" fill="none" stroke="${C.hair2}"/>
  <text x="527" y="761" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="15" letter-spacing="1.5" fill="${C.white}">devradar.org</text>

  <!-- ── dossier alert card (right) ──────────────────────────── -->
  <g transform="translate(978,236)">
    <rect width="526" height="430" rx="22" fill="url(#cardbg)" stroke="${C.hair2}"/>
    <rect width="526" height="430" rx="22" fill="none" stroke="${C.gold}" stroke-opacity="0.10"/>

    <!-- header -->
    <circle cx="40" cy="50" r="5" fill="${C.gold}" filter="url(#soft)"/>
    <circle cx="40" cy="50" r="4.5" fill="${C.goldHi}"/>
    <text x="56" y="56" font-family="Geist Mono" font-weight="600" font-size="15" letter-spacing="1.8" fill="${C.gold}">PROVEN DEPLOYER LIVE</text>
    <circle cx="442" cy="50" r="4" fill="${C.win}"/>
    <text x="486" y="55" text-anchor="end" font-family="Geist Mono" font-weight="500" font-size="12" letter-spacing="1.5" fill="${C.win}">LIVE</text>

    <!-- token -->
    <text x="40" y="106" font-family="Geist" font-weight="600" font-size="30" fill="${C.gold}">$NORTH <tspan font-weight="400" font-size="22" fill="${C.white}">— North Road Dog</tspan></text>

    <line x1="40" y1="134" x2="486" y2="134" stroke="${C.white}" stroke-opacity="0.08"/>

    <!-- record -->
    <g font-family="Geist" font-size="20">
      <text x="40" y="178" fill="${C.grey}">Dev <tspan font-family="Geist Mono" font-size="18" fill="${C.white}">7xKp····9fQm</tspan>  <tspan fill="${C.grey2}">·</tspan>  <tspan fill="${C.win}" font-weight="500">Serial Winner</tspan></text>
      <text x="40" y="216" fill="${C.grey}"><tspan fill="${C.white}">14</tspan> launches  <tspan fill="${C.grey2}">·</tspan>  <tspan fill="${C.white}">0</tspan> rugs  <tspan fill="${C.grey2}">·</tspan>  best ATH <tspan fill="${C.white}">$4.2M</tspan></text>
      <text x="40" y="254" fill="${C.grey}">Bundle <tspan fill="${C.white}">4.1%</tspan>  <tspan fill="${C.grey2}">·</tspan>  Snipers <tspan fill="${C.win}">low</tspan></text>
    </g>

    <!-- DR score badge -->
    <g transform="translate(486,210)">
      <circle r="50" cx="-50" cy="0" fill="${C.win}" fill-opacity="0.06" stroke="${C.win}" stroke-opacity="0.35"/>
      <text x="-50" y="6" text-anchor="middle" font-family="Geist" font-weight="700" font-size="40" fill="${C.win}">92</text>
      <text x="-50" y="32" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="10" letter-spacing="2" fill="${C.grey2}">DR SCORE</text>
    </g>

    <line x1="40" y1="300" x2="486" y2="300" stroke="${C.white}" stroke-opacity="0.08"/>

    <!-- links -->
    <text x="40" y="338" font-family="Geist Mono" font-weight="400" font-size="15" letter-spacing="0.5" fill="${C.gold}">dossier  <tspan fill="${C.grey2}">·</tspan>  chart  <tspan fill="${C.grey2}">·</tspan>  dev history</text>

    <!-- delivered note -->
    <text x="40" y="390" font-family="Geist" font-size="15" fill="${C.grey2}">Delivered <tspan fill="${C.grey}" font-weight="500">1.8s</tspan> after deploy — before your buy would confirm.</text>
  </g>
</svg>`;

fs.writeFileSync(path.join(DIR, 'devradar-x-banner.svg'), svg);

const fontsDir = path.join(DIR, 'fonts');
const fontFiles = fs.readdirSync(fontsDir).map((f) => path.join(fontsDir, f));
const resvg = new Resvg(svg, {
  background: C.black,
  fitTo: { mode: 'width', value: W },
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' },
});
const png = resvg.render().asPng();
fs.writeFileSync(path.join(DIR, 'devradar-x-banner.png'), png);
console.log('rendered', png.length, 'bytes');
