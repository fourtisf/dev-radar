const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const C = {
  black: '#060607', gold: '#E2B65B', goldHi: '#F4D789', goldDeep: '#B9893A',
  white: '#F4F2EC', grey: '#9C9A93', grey2: '#5F5D58', win: '#5CDD94',
};
const W = 1600, H = 900;

// ── EDIT THESE for your launch ────────────────────────────────────
const TICKER = 'RADAR';
const NAME = 'DevRadar';
const VENUE = 'LIVE ON PUMP.FUN';

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goldtx" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="${C.goldHi}"/><stop offset="0.5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/>
    </linearGradient>
    <linearGradient id="goldbtn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.goldHi}"/><stop offset="0.55" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${C.gold}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${C.black}"/>
  <rect x="400" y="-300" width="800" height="900" fill="url(#glow)"/>

  <!-- radar rings behind ticker -->
  <g stroke="${C.gold}" fill="none">
    <circle cx="800" cy="430" r="200" stroke-opacity="0.08"/>
    <circle cx="800" cy="430" r="320" stroke-opacity="0.06"/>
    <circle cx="800" cy="430" r="460" stroke-opacity="0.04"/>
    <circle cx="800" cy="430" r="620" stroke-opacity="0.025"/>
  </g>

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

  <!-- kicker: NOW LIVE -->
  <circle cx="650" cy="262" r="6" fill="${C.win}" filter="url(#soft)"/>
  <circle cx="650" cy="262" r="5" fill="${C.win}"/>
  <text x="672" y="268" font-family="Geist Mono" font-weight="600" font-size="17" letter-spacing="4" fill="${C.win}">NOW LIVE</text>
  <text x="${800}" y="268" font-family="Geist Mono" font-weight="500" font-size="17" letter-spacing="4" fill="${C.grey}"> · TOKEN LAUNCH</text>

  <!-- giant ticker -->
  <text x="800" y="470" text-anchor="middle" font-family="Geist" font-weight="700" font-size="156" letter-spacing="-3" fill="url(#goldtx)">$${TICKER}</text>

  <!-- name + tagline -->
  <text x="800" y="548" text-anchor="middle" font-family="Geist" font-weight="600" font-size="40" letter-spacing="-0.5" fill="${C.white}">${NAME}</text>
  <text x="800" y="600" text-anchor="middle" font-family="Geist" font-weight="400" font-size="24" fill="${C.grey}">The deployer-intelligence token. <tspan fill="${C.white}">Know the dev before you ape.</tspan></text>

  <!-- venue pill -->
  <rect x="${800 - 175}" y="680" width="350" height="58" rx="29" fill="url(#goldbtn)"/>
  <text x="800" y="717" text-anchor="middle" font-family="Geist Mono" font-weight="600" font-size="16" letter-spacing="2" fill="#1A1305">${VENUE}</text>

  <!-- links -->
  <text x="800" y="800" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="17" letter-spacing="1" fill="${C.grey}">x.com/DevRadarS   <tspan fill="${C.gold}">·</tspan>   t.me/devradars   <tspan fill="${C.gold}">·</tspan>   devradar.org</text>
</svg>`;

fs.writeFileSync(path.join(__dirname, 'devradar-launch-banner.svg'), svg);
const fontDir = path.join(__dirname, 'fonts');
const fontFiles = fs.readdirSync(fontDir).map((f) => path.join(fontDir, f));
const resvg = new Resvg(svg, {
  background: C.black,
  fitTo: { mode: 'width', value: W },
  font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Geist' },
});
fs.writeFileSync(path.join(__dirname, 'devradar-launch-banner.png'), resvg.render().asPng());
console.log('rendered devradar-launch-banner.png');
