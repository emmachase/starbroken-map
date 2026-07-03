import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "src", "assets", "navcom");

mkdirSync(outDir, { recursive: true });

const svg = (width, height, body, defs = "") => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${defs}</defs>
  ${body}
</svg>
`;

const diagonalModuloBands = (period, height, bands) => {
  const repeats = [-2, -1, 0, 1, 2];
  return repeats.flatMap((repeat) => bands.map((band) => {
    const start = band.start + repeat * period;
    const end = band.end + repeat * period;
    return `<polygon points="${start},0 ${end},0 ${end + height},${height} ${start + height},${height}" fill="${band.fill}" opacity="${band.opacity}"/>`;
  })).join("\n    ");
};

const stripeAsset = (bands) => svg(
  96,
  96,
  `<rect width="96" height="96" fill="#100408"/>
  <g opacity=".94">
    ${diagonalModuloBands(96, 96, bands)}
  </g>
  <rect width="96" height="96" fill="url(#shadow)"/>`,
  `<linearGradient id="shadow" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity=".08"/>
      <stop offset="1" stop-color="#000000" stop-opacity=".36"/>
    </linearGradient>`
);

const assets = {
  "noise-blue.svg": svg(
    512,
    512,
    `<rect width="512" height="512" fill="#020814"/>
  <rect width="512" height="512" filter="url(#noise)" opacity=".74"/>
  <rect width="512" height="512" fill="url(#coolWash)" opacity=".55"/>`,
    `<filter id="noise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".86" numOctaves="4" seed="19"/>
      <feColorMatrix type="matrix" values="0 0 0 .18 0  0 0 0 .58 0  0 0 0 1 0  0 0 0 .75 0"/>
    </filter>
    <radialGradient id="coolWash" cx="48%" cy="44%" r="72%">
      <stop offset="0" stop-color="#7bdcff" stop-opacity=".28"/>
      <stop offset=".48" stop-color="#1b4468" stop-opacity=".12"/>
      <stop offset="1" stop-color="#020814" stop-opacity=".85"/>
    </radialGradient>`
  ),

  "noise-red.svg": svg(
    512,
    512,
    `<rect width="512" height="512" fill="#120309"/>
  <rect width="512" height="512" filter="url(#noise)" opacity=".88"/>
  <rect width="512" height="512" fill="url(#alarmFalloff)" opacity=".54"/>`,
    `<filter id="noise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.18 .72" numOctaves="5" seed="47"/>
      <feColorMatrix type="matrix" values="1 0 0 .62 0  0 0 0 .18 0  0 0 0 .28 0  0 0 0 .82 0"/>
    </filter>
    <radialGradient id="alarmFalloff" cx="50%" cy="48%" r="74%">
      <stop offset="0" stop-color="#ff5571" stop-opacity=".22"/>
      <stop offset=".48" stop-color="#7a1328" stop-opacity=".12"/>
      <stop offset="1" stop-color="#120309" stop-opacity=".8"/>
    </radialGradient>`
  ),

  "scanline-mask.svg": svg(
    8,
    8,
    `<rect width="8" height="8" fill="transparent"/>
  <rect y="0" width="8" height="1" fill="#eef7ff" opacity=".24"/>
  <rect y="2" width="8" height="1" fill="#71d5ff" opacity=".12"/>
  <rect y="5" width="8" height="1" fill="#000000" opacity=".30"/>`
  ),

  "panel-edge-gradient.svg": svg(
    512,
    32,
    `<rect width="512" height="32" fill="transparent"/>
  <rect y="14" width="512" height="2" fill="#eef7ff" opacity=".52"/>
  <rect y="10" width="512" height="10" fill="url(#edge)" opacity=".9"/>
  <rect y="4" width="512" height="24" fill="url(#fade)" opacity=".72"/>`,
    `<linearGradient id="edge" x1="0" x2="1">
      <stop offset="0" stop-color="#71d5ff" stop-opacity="0"/>
      <stop offset=".18" stop-color="#71d5ff" stop-opacity=".72"/>
      <stop offset=".5" stop-color="#eef7ff" stop-opacity=".95"/>
      <stop offset=".82" stop-color="#71d5ff" stop-opacity=".72"/>
      <stop offset="1" stop-color="#71d5ff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#71d5ff" stop-opacity="0"/>
      <stop offset=".5" stop-color="#71d5ff" stop-opacity=".35"/>
      <stop offset="1" stop-color="#71d5ff" stop-opacity="0"/>
    </linearGradient>`
  ),

  "warning-stripe.svg": stripeAsset([
    { start: 0, end: 18, fill: "#ff6b3d", opacity: ".78" },
    { start: 38, end: 58, fill: "#ff3f5f", opacity: ".88" },
    { start: 78, end: 90, fill: "#7d1829", opacity: ".72" }
  ]),

  "critical-stripe.svg": stripeAsset([
    { start: 6, end: 28, fill: "#ff284f", opacity: ".95" },
    { start: 40, end: 48, fill: "#ff86a0", opacity: ".48" },
    { start: 66, end: 88, fill: "#8a0f24", opacity: ".84" }
  ]),

  "caution-stripe.svg": stripeAsset([
    { start: 2, end: 20, fill: "#ffb65c", opacity: ".82" },
    { start: 36, end: 58, fill: "#c56f33", opacity: ".72" },
    { start: 76, end: 88, fill: "#5b341d", opacity: ".7" }
  ]),

  "stripe-falloff-horizontal.svg": svg(
    512,
    96,
    `<rect width="512" height="96" fill="url(#falloff)"/>`,
    `<linearGradient id="falloff" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".08" stop-color="#ffffff" stop-opacity=".2"/>
      <stop offset=".18" stop-color="#ffffff" stop-opacity=".82"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset=".82" stop-color="#ffffff" stop-opacity=".82"/>
      <stop offset=".92" stop-color="#ffffff" stop-opacity=".2"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>`
  ),

  "stripe-falloff-vertical.svg": svg(
    96,
    512,
    `<rect width="96" height="512" fill="url(#falloff)"/>`,
    `<linearGradient id="falloff" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".08" stop-color="#ffffff" stop-opacity=".2"/>
      <stop offset=".18" stop-color="#ffffff" stop-opacity=".82"/>
      <stop offset=".5" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset=".82" stop-color="#ffffff" stop-opacity=".82"/>
      <stop offset=".92" stop-color="#ffffff" stop-opacity=".2"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>`
  ),

  "spark-dot.svg": svg(
    64,
    64,
    `<rect width="64" height="64" fill="transparent"/>
  <circle cx="32" cy="32" r="29" fill="url(#glow)"/>
  <circle cx="32" cy="32" r="7" fill="#eef7ff"/>
  <circle cx="32" cy="32" r="3" fill="#ffffff"/>`,
    `<radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#eef7ff" stop-opacity="1"/>
      <stop offset=".18" stop-color="#71d5ff" stop-opacity=".86"/>
      <stop offset=".5" stop-color="#71d5ff" stop-opacity=".24"/>
      <stop offset="1" stop-color="#71d5ff" stop-opacity="0"/>
    </radialGradient>`
  ),

  "ring-soft.svg": svg(
    256,
    256,
    `<rect width="256" height="256" fill="transparent"/>
  <circle cx="128" cy="128" r="104" fill="none" stroke="url(#ring)" stroke-width="12"/>
  <circle cx="128" cy="128" r="74" fill="none" stroke="#71d5ff" stroke-width="2" opacity=".28"/>
  <circle cx="128" cy="128" r="16" fill="url(#core)" opacity=".35"/>`,
    `<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#71d5ff" stop-opacity="0"/>
      <stop offset=".22" stop-color="#71d5ff" stop-opacity=".78"/>
      <stop offset=".58" stop-color="#eef7ff" stop-opacity=".62"/>
      <stop offset="1" stop-color="#c49cff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#eef7ff" stop-opacity=".8"/>
      <stop offset="1" stop-color="#71d5ff" stop-opacity="0"/>
    </radialGradient>`
  ),

  "glass-smudge.svg": svg(
    1024,
    1024,
    `<rect width="1024" height="1024" fill="transparent"/>
  <rect width="1024" height="1024" filter="url(#smudge)" opacity=".34"/>
  <rect width="1024" height="1024" fill="url(#softReflection)" opacity=".18"/>`,
    `<filter id="smudge" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".026 .038" numOctaves="5" seed="73"/>
      <feColorMatrix type="matrix" values="0 0 0 .8 0  0 0 0 .9 0  0 0 0 1 0  0 0 0 .18 0"/>
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
    <radialGradient id="softReflection" cx="52%" cy="18%" r="82%">
      <stop offset="0" stop-color="#eef7ff" stop-opacity=".22"/>
      <stop offset=".32" stop-color="#71d5ff" stop-opacity=".07"/>
      <stop offset="1" stop-color="#eef7ff" stop-opacity="0"/>
    </radialGradient>`
  ),

  "bracket-corner.svg": svg(
    96,
    96,
    `<rect width="96" height="96" fill="transparent"/>
  <path d="M14 74 V22 Q14 14 22 14 H74" fill="none" stroke="#71d5ff" stroke-width="5" stroke-linecap="square"/>
  <path d="M26 64 V30 Q26 26 30 26 H64" fill="none" stroke="#eef7ff" stroke-width="2" opacity=".68"/>
  <circle cx="14" cy="74" r="4" fill="#71d5ff"/>
  <circle cx="74" cy="14" r="3" fill="#eef7ff"/>`
  ),

  "reticle-ping.svg": svg(
    192,
    192,
    `<rect width="192" height="192" fill="transparent"/>
  <circle cx="96" cy="96" r="70" fill="none" stroke="#71d5ff" stroke-width="2" opacity=".55"/>
  <circle cx="96" cy="96" r="44" fill="none" stroke="#eef7ff" stroke-width="1" opacity=".32"/>
  <path d="M96 12 V46 M96 146 V180 M12 96 H46 M146 96 H180" stroke="#71d5ff" stroke-width="4" opacity=".72"/>
  <path d="M40 40 L58 58 M152 40 L134 58 M40 152 L58 134 M152 152 L134 134" stroke="#c49cff" stroke-width="2" opacity=".46"/>
  <circle cx="96" cy="96" r="5" fill="#eef7ff" opacity=".85"/>`
  ),

  "holo-grid.svg": svg(
    128,
    128,
    `<rect width="128" height="128" fill="#020814"/>
  <path d="M0 32 H128 M0 64 H128 M0 96 H128 M32 0 V128 M64 0 V128 M96 0 V128" stroke="#71d5ff" stroke-width="1" opacity=".16"/>
  <path d="M0 0 H128 V128 H0 Z" fill="none" stroke="#71d5ff" stroke-width="2" opacity=".24"/>
  <circle cx="64" cy="64" r="2" fill="#eef7ff" opacity=".35"/>`
  )
};

for (const [name, source] of Object.entries(assets)) {
  writeFileSync(join(outDir, name), source, "utf8");
}

const manifest = {
  name: "navcom-material-kit",
  version: 1,
  generatedBy: "map/scripts/generate-navcom-assets.mjs",
  assets: [
    { file: "noise-blue.svg", role: "cool display noise and passive glass grain", tileable: true },
    { file: "noise-red.svg", role: "hostile-space and alert interference noise", tileable: true },
    { file: "scanline-mask.svg", role: "repeatable CRT/display scanline overlay", tileable: true },
    { file: "panel-edge-gradient.svg", role: "cyan edge bloom strip for control surfaces", tileable: false },
    { file: "warning-stripe.svg", role: "general alert hatch for route warnings and panel rails", tileable: true },
    { file: "critical-stripe.svg", role: "critical red hatch for NULL exposure, failed routes, and system alarms", tileable: true },
    { file: "caution-stripe.svg", role: "amber hatch for Frontier exposure and non-critical caution states", tileable: true },
    { file: "stripe-falloff-horizontal.svg", role: "alpha falloff mask for horizontal alert rails", tileable: false },
    { file: "stripe-falloff-vertical.svg", role: "alpha falloff mask for vertical alert rails", tileable: false },
    { file: "spark-dot.svg", role: "route packet, gate glint, and pulse core", tileable: false },
    { file: "ring-soft.svg", role: "sensor ping, range ring, and selection pulse", tileable: false },
    { file: "glass-smudge.svg", role: "low-opacity screen grime and reflection texture", tileable: false },
    { file: "bracket-corner.svg", role: "targeting corner and panel lock bracket", tileable: false },
    { file: "reticle-ping.svg", role: "hover reticle and lock-on pulse", tileable: false },
    { file: "holo-grid.svg", role: "fine recessed display grid", tileable: true }
  ]
};

writeFileSync(join(outDir, "navcom-assets.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const contactSheet = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NAVCOM Asset Contact Sheet</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #02040a;
      --ink: #eef7ff;
      --muted: #8da4b8;
      --line: rgba(113, 213, 255, .24);
      --cyan: #71d5ff;
      --hot: #ff5571;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font: 13px/1.4 Inter, Segoe UI, system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 50% 20%, rgba(27, 68, 104, .34), transparent 34%),
        linear-gradient(180deg, #040814, var(--bg));
    }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 6px; font-size: 18px; letter-spacing: .08em; text-transform: uppercase; }
    p { margin: 0 0 20px; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .card {
      border: 1px solid var(--line);
      background: rgba(4, 8, 17, .76);
      clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
      padding: 12px;
    }
    .preview {
      display: grid;
      place-items: center;
      height: 164px;
      overflow: hidden;
      border: 1px solid rgba(113, 213, 255, .12);
      background:
        linear-gradient(90deg, rgba(113, 213, 255, .06) 1px, transparent 1px),
        linear-gradient(rgba(113, 213, 255, .06) 1px, transparent 1px),
        #030612;
      background-size: 18px 18px;
    }
    .preview img {
      max-width: 92%;
      max-height: 92%;
      object-fit: contain;
      image-rendering: auto;
    }
    .tile img {
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      object-fit: cover;
    }
    .label {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
    }
    .sample {
      margin-top: 22px;
      border: 1px solid rgba(113, 213, 255, .26);
      min-height: 260px;
      position: relative;
      overflow: hidden;
      background:
        url("holo-grid.svg"),
        url("noise-blue.svg"),
        #030612;
      background-size: 128px 128px, cover, auto;
    }
    .sample::before {
      content: "";
      position: absolute;
      inset: 0;
      background: url("scanline-mask.svg"), url("glass-smudge.svg");
      background-size: 8px 8px, cover;
      opacity: .42;
      pointer-events: none;
    }
    .sample::after {
      content: "";
      position: absolute;
      inset: 24px 48px;
      border: 1px solid rgba(113, 213, 255, .38);
      box-shadow: 0 0 28px rgba(113, 213, 255, .14), inset 0 0 36px rgba(113, 213, 255, .06);
      clip-path: polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px);
    }
    .edge {
      position: absolute;
      left: 80px;
      right: 80px;
      top: 72px;
      height: 32px;
      background: url("panel-edge-gradient.svg") center / 100% 100% no-repeat;
    }
    .ring {
      position: absolute;
      width: 170px;
      height: 170px;
      left: calc(50% - 85px);
      top: 72px;
      background: url("ring-soft.svg") center / contain no-repeat;
      mix-blend-mode: screen;
    }
    .warn {
      position: absolute;
      right: 70px;
      bottom: 58px;
      width: 190px;
      height: 20px;
      background: url("critical-stripe.svg") center / 48px 48px repeat;
      mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.2) 8%, black 18%, black 82%, rgba(0,0,0,.2) 92%, transparent 100%);
      -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.2) 8%, black 18%, black 82%, rgba(0,0,0,.2) 92%, transparent 100%);
      opacity: .72;
    }
  </style>
</head>
<body>
  <main>
    <h1>NAVCOM Asset Contact Sheet</h1>
    <p>Generated material textures for the HTML-in-canvas/Pixi diegetic UI pass.</p>
    <section class="grid">
      ${Object.keys(assets).map((name) => `<article class="card">
        <div class="preview ${name.includes("noise") || name.includes("grid") || name.includes("stripe") || name.includes("scanline") || name.includes("smudge") ? "tile" : ""}">
          <img src="${name}" alt="${name}">
        </div>
        <div class="label"><span>${name}</span><span>svg</span></div>
      </article>`).join("\n")}
    </section>
    <section class="sample" aria-label="Composite sample">
      <div class="edge"></div>
      <div class="ring"></div>
      <div class="warn"></div>
    </section>
  </main>
</body>
</html>
`;

writeFileSync(join(outDir, "contact-sheet.html"), contactSheet, "utf8");

const stripeTileTest = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>NAVCOM Stripe Tile Test</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #02040a;
    }
    body {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      overflow: hidden;
    }
    .tile {
      position: relative;
      width: 100%;
      height: 384px;
      image-rendering: auto;
    }
    .tile.warning { background: url("warning-stripe.svg") 0 0 / 96px 96px repeat; }
    .tile.critical { background: url("critical-stripe.svg") 0 0 / 96px 96px repeat; }
    .tile.caution { background: url("caution-stripe.svg") 0 0 / 96px 96px repeat; }
    .tile::after {
      content: attr(data-label);
      position: absolute;
      left: 16px;
      top: 14px;
      color: #eef7ff;
      font: 800 13px/1.2 Inter, Segoe UI, system-ui, sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
      text-shadow: 0 1px 4px #000;
    }
    .grid {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 384px;
      background:
        linear-gradient(90deg, rgba(113, 213, 255, .8) 1px, transparent 1px),
        linear-gradient(rgba(113, 213, 255, .8) 1px, transparent 1px);
      background-size: 96px 96px;
      pointer-events: none;
      opacity: .42;
    }
  </style>
</head>
<body>
  <div class="tile warning" data-label="warning"><div class="grid"></div></div>
  <div class="tile critical" data-label="critical"><div class="grid"></div></div>
  <div class="tile caution" data-label="caution"><div class="grid"></div></div>
</body>
</html>
`;

writeFileSync(join(outDir, "stripe-tile-test.html"), stripeTileTest, "utf8");

const stripeFalloffTest = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>NAVCOM Stripe Falloff Test</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #02040a;
      --ink: #eef7ff;
      --muted: #8da4b8;
      --line: rgba(113, 213, 255, .26);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font: 13px/1.4 Inter, Segoe UI, system-ui, sans-serif;
      color: var(--ink);
      background:
        url("holo-grid.svg") 0 0 / 128px 128px,
        radial-gradient(circle at 50% 46%, rgba(27, 68, 104, .32), transparent 42%),
        var(--bg);
    }
    main {
      width: min(1040px, calc(100vw - 48px));
      display: grid;
      gap: 22px;
    }
    h1 {
      margin: 0;
      font-size: 16px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .row {
      display: grid;
      grid-template-columns: 120px 1fr;
      align-items: center;
      gap: 20px;
    }
    .label {
      color: var(--muted);
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .rail {
      height: 34px;
      border: 1px solid var(--line);
      background-size: 48px 48px;
      background-position: center;
      background-repeat: repeat;
      box-shadow: 0 0 22px rgba(113, 213, 255, .06);
    }
    .warning { background-image: url("warning-stripe.svg"); }
    .critical { background-image: url("critical-stripe.svg"); }
    .caution { background-image: url("caution-stripe.svg"); }
    .masked {
      mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.2) 8%, black 18%, black 82%, rgba(0,0,0,.2) 92%, transparent 100%);
      -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0,0,0,.2) 8%, black 18%, black 82%, rgba(0,0,0,.2) 92%, transparent 100%);
      border-color: transparent;
    }
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    .caption {
      margin-bottom: 7px;
      color: var(--muted);
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <main>
    <h1>Stripe Falloff Test</h1>
    ${["warning", "critical", "caution"].map((kind) => `<section class="row">
      <div class="label">${kind}</div>
      <div class="pair">
        <div><div class="caption">raw tile</div><div class="rail ${kind}"></div></div>
        <div><div class="caption">masked placement</div><div class="rail ${kind} masked"></div></div>
      </div>
    </section>`).join("\n")}
  </main>
</body>
</html>
`;

writeFileSync(join(outDir, "stripe-falloff-test.html"), stripeFalloffTest, "utf8");

console.log(`Generated ${Object.keys(assets).length} NAVCOM assets in ${outDir}`);
