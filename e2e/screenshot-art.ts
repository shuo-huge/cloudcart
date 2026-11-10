/**
 * Inline SVG artwork used by the README screenshot capture.
 *
 * Demo products reference picsum.photos URLs so the data looks like a real
 * catalog. During capture those requests are intercepted and answered with
 * these deterministic illustrations instead of relying on the network.
 */

interface Palette {
  bg1: string;
  bg2: string;
  shape: string;
  dark: string;
  accent: string;
  light: string;
  floor: string;
}

const PALETTES: Palette[] = [
  { bg1: "#f2ece2", bg2: "#ddcbb4", shape: "#b06a4c", dark: "#7d4633", accent: "#8f9b7a", light: "#f6efe4", floor: "#e5d8c6" },
  { bg1: "#eef0e9", bg2: "#cfd6c4", shape: "#6f7f63", dark: "#4c5a43", accent: "#c08a63", light: "#f4f3ea", floor: "#dfe3d5" },
  { bg1: "#f3ece7", bg2: "#e2c9c1", shape: "#9d5f5a", dark: "#70413e", accent: "#c9a66b", light: "#f8efe9", floor: "#ead8d1" },
  { bg1: "#eef1f2", bg2: "#cfd9dd", shape: "#4f6b74", dark: "#374d55", accent: "#c19a64", light: "#f2f5f5", floor: "#dde4e6" },
  { bg1: "#f4efe3", bg2: "#e5d5a9", shape: "#a98548", dark: "#74592e", accent: "#7d8a6a", light: "#f8f2e3", floor: "#e8dcc0" },
  { bg1: "#f1ede9", bg2: "#d8d2cc", shape: "#6d6560", dark: "#4a4440", accent: "#b47a57", light: "#f6f2ee", floor: "#e1dbd5" },
];

function paletteFor(seed: string): Palette {
  let value = 0;
  for (const char of seed) value = (value * 31 + char.charCodeAt(0)) % 997;
  return PALETTES[value % PALETTES.length]!;
}

function motif(seed: string, palette: Palette): string {
  const s = palette.shape;
  const d = palette.dark;
  const a = palette.accent;
  const l = palette.light;
  const key = seed.toLowerCase();

  if (key.includes("lamp")) {
    return `
      <g filter="url(#soft)">
        <circle cx="450" cy="355" r="152" fill="${l}"/>
        <circle cx="450" cy="355" r="152" fill="none" stroke="${a}" stroke-width="12" opacity=".55"/>
        <rect x="436" y="490" width="28" height="190" rx="14" fill="${s}"/>
        <ellipse cx="450" cy="696" rx="132" ry="24" fill="${d}"/>
      </g>`;
  }

  if (key.includes("throw") || key.includes("linen")) {
    return `
      <g filter="url(#soft)">
        <rect x="250" y="270" width="400" height="430" rx="30" fill="${l}"/>
        <rect x="250" y="270" width="400" height="24" rx="12" fill="${d}" opacity=".35"/>
        <path d="M250 390 Q 320 350 400 390 T 550 390 T 650 390" stroke="${s}" stroke-width="26" fill="none" stroke-linecap="round"/>
        <path d="M250 480 Q 320 440 400 480 T 550 480 T 650 480" stroke="${a}" stroke-width="22" fill="none" stroke-linecap="round" opacity=".8"/>
        <path d="M250 570 Q 320 530 400 570 T 550 570 T 650 570" stroke="${s}" stroke-width="26" fill="none" stroke-linecap="round" opacity=".7"/>
        <path d="M250 660 Q 320 620 400 660 T 550 660 T 650 660" stroke="${a}" stroke-width="18" fill="none" stroke-linecap="round" opacity=".55"/>
      </g>`;
  }

  if (key.includes("vase")) {
    return `
      <g filter="url(#soft)">
        <path d="M390 300 Q 380 382 350 442 Q 308 540 340 642 Q 372 722 450 722 Q 528 722 560 642 Q 592 540 550 442 Q 520 382 510 300 Z" fill="${s}"/>
        <rect x="378" y="268" width="144" height="42" rx="20" fill="${d}"/>
        <path d="M452 402 Q 470 298 542 248" stroke="${a}" stroke-width="14" fill="none" stroke-linecap="round"/>
        <circle cx="548" cy="242" r="27" fill="${a}"/>
        <circle cx="585" cy="286" r="17" fill="${a}" opacity=".7"/>
      </g>`;
  }

  if (key.includes("journal") || key.includes("notes")) {
    return `
      <g filter="url(#soft)">
        <rect x="275" y="270" width="370" height="440" rx="26" fill="${s}"/>
        <rect x="300" y="295" width="320" height="390" rx="14" fill="${l}"/>
        <rect x="275" y="270" width="26" height="440" fill="${d}" opacity=".4"/>
        <rect x="336" y="366" width="176" height="16" rx="8" fill="${a}" opacity=".6"/>
        <rect x="336" y="414" width="248" height="10" rx="5" fill="${s}" opacity=".35"/>
        <rect x="336" y="446" width="230" height="10" rx="5" fill="${s}" opacity=".35"/>
        <rect x="336" y="478" width="248" height="10" rx="5" fill="${s}" opacity=".35"/>
        <rect x="336" y="510" width="196" height="10" rx="5" fill="${s}" opacity=".35"/>
        <circle cx="540" cy="636" r="26" fill="${a}" opacity=".65"/>
      </g>`;
  }

  if (key.includes("apron")) {
    return `
      <g filter="url(#soft)">
        <path d="M330 300 Q 450 268 570 300 L 602 424 L 540 446 L 540 700 Q 450 732 360 700 L 360 446 L 298 424 Z" fill="${s}"/>
        <path d="M392 300 Q 450 238 508 300" stroke="${a}" stroke-width="15" fill="none" stroke-linecap="round"/>
        <rect x="392" y="522" width="116" height="92" rx="12" fill="${l}" opacity=".6"/>
        <path d="M360 446 L 298 424" stroke="${d}" stroke-width="8" opacity=".4"/>
        <path d="M540 446 L 602 424" stroke="${d}" stroke-width="8" opacity=".4"/>
      </g>`;
  }

  // Tote / default.
  return `
    <g filter="url(#soft)">
      <path d="M302 432 Q 302 296 450 296 Q 598 296 598 432" fill="none" stroke="${s}" stroke-width="34" stroke-linecap="round"/>
      <rect x="250" y="412" width="400" height="330" rx="36" fill="${s}"/>
      <rect x="250" y="412" width="400" height="76" rx="36" fill="${d}" opacity=".22"/>
      <rect x="344" y="560" width="212" height="14" rx="7" fill="${l}" opacity=".55"/>
      <rect x="380" y="602" width="140" height="12" rx="6" fill="${l}" opacity=".35"/>
    </g>`;
}

export function productArt(seed: string): string {
  const palette = paletteFor(seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.bg1}"/>
      <stop offset="1" stop-color="${palette.bg2}"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="26" stdDeviation="24" flood-color="#2b241e" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect width="900" height="900" fill="url(#bg)"/>
  <circle cx="706" cy="208" r="186" fill="${palette.accent}" opacity=".13"/>
  <circle cx="170" cy="720" r="120" fill="${palette.light}" opacity=".35"/>
  <path d="M0 722 Q 250 668 480 714 T 900 700 L900 900 L0 900Z" fill="${palette.floor}" opacity=".6"/>
  ${motif(seed, palette)}
</svg>`;
}
