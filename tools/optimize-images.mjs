#!/usr/bin/env node
/**
 * Image optimization for the course index.
 *
 *   node tools/optimize-images.mjs            everything
 *   node tools/optimize-images.mjs thumbs      course thumbnails -> WebP
 *   node tools/optimize-images.mjs favicon     favicon stack (+ manifest)
 *   node tools/optimize-images.mjs og         1200x630 og-card.jpg
 *
 * Uses the system ffmpeg (libwebp + drawtext). Source of truth for
 * thumbnails is data/courses.json; sources stay in images/.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(root, "assets/images");
const THUMB_W = 480;
const QUALITY = 78;
const BUDGET = 60 * 1024; // roadmap: <60 KB per card

const ffmpeg = (...args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });

const kb = (p) => (existsSync(p) ? Math.round(statSync(p).size / 1024) : 0);
const statSize = (p) => statSync(p).size;

/* ---------------- thumbnails ---------------- */

function thumbs() {
  const { courses } = JSON.parse(
    readFileSync(join(root, "data/courses.json"), "utf8")
  );
  const targets = [
    ...new Set(courses.map((c) => c.image.replace(/^\//, "").replace(/^assets\/images\//, ""))),
  ];
  let over = 0;
  for (const webp of targets) {
    const base = webp.replace(/\.webp$/, "");
    const src = ["png", "jpg", "jpeg"]
      .map((ext) => join(root, "images", `${base}.${ext}`))
      .find(existsSync);
    if (!src) {
      console.error(`MISSING SOURCE for ${webp} (looked for ${base}.{png,jpg})`);
      process.exitCode = 1;
      continue;
    }
    const out = join(ASSETS, webp);
    ffmpeg(
      "-i", src,
      "-vf", `scale=if(gte(iw\\,${THUMB_W})\\,${THUMB_W}\\,iw):-2:flags=lanczos`,
      "-c:v", "libwebp",
      "-quality", String(QUALITY),
      out
    );
    const size = statSize(out);
    if (size > BUDGET) {
      over++;
      console.warn(`OVER BUDGET: ${webp} ${(size / 1024).toFixed(1)} KB > 60 KB`);
    }
    console.log(
      `${webp.padEnd(38)} ${(size / 1024).toFixed(1).padStart(6)} KB  <- ${base}`
    );
  }
  console.log(
    over ? `\n${over} thumbnail(s) over budget` : `\nAll ${targets.length} thumbnails within budget`
  );
}

/* ---------------- favicon ---------------- */

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0f172a"/>
  <path d="M32 8 52 18v28L32 56 12 46V18z" fill="none" stroke="#2563eb" stroke-width="3"/>
  <text x="32" y="42" font-family="Georgia, serif" font-size="28" font-weight="700" fill="#f8fafc" text-anchor="middle">R</text>
</svg>
`;

const MANIFEST = {
  name: "Rsquared Academy Open Courses",
  short_name: "R² Courses",
  icons: [
    { src: "/assets/images/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    { src: "/assets/images/favicon-16x16.png", sizes: "16x16", type: "image/png" },
  ],
  theme_color: "#0f172a",
  background_color: "#fbfcfd",
  display: "standalone",
};

function favicon() {
  const ico = join(root, "favicon.ico");
  if (!existsSync(ico)) {
    console.error("favicon.ico not found; cannot derive PNGs");
    process.exitCode = 1;
    return;
  }
  ffmpeg("-i", ico, "-vf", "select=eq(n\\,0)", "-vsync", "0",
    "-frames:v", "1", join(ASSETS, "_fav_src.png"));
  for (const size of [180, 32, 16]) {
    const name = size === 180 ? "apple-touch-icon.png" : `favicon-${size}x${size}.png`;
    ffmpeg("-i", join(ASSETS, "_fav_src.png"),
      "-vf", `scale=${size}:${size}:flags=lanczos`, "-frames:v", "1",
      join(ASSETS, name));
  }
  rmSync(join(ASSETS, "_fav_src.png"), { force: true });
  writeFileSync(join(ASSETS, "favicon.svg"), FAVICON_SVG);
  writeFileSync(join(root, "site.webmanifest"), JSON.stringify(MANIFEST, null, 2) + "\n");
  for (const f of ["apple-touch-icon.png", "favicon-32x32.png", "favicon-16x16.png", "favicon.svg"]) {
    console.log(`${f.padEnd(24)} ${kb(join(ASSETS, f)).toString().padStart(4)} KB`);
  }
}

/* ---------------- og card ---------------- */

const FONTS = [
  "C:/Windows/Fonts/georgiab.ttf",
  "C:/Windows/Fonts/georgia.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
];

function og() {
  const serif = FONTS.find(existsSync);
  if (!serif) {
    console.error("No serif font found for og-card text; skipping");
    process.exitCode = 1;
    return;
  }
  const dir = join(root, "node_modules/.cache");
  if (!existsSync(dir)) execFileSync("mkdir", ["-p", dir]);
  const titleFile = join(dir, "og-title.txt");
  const subFile = join(dir, "og-sub.txt");
  const { courses } = JSON.parse(readFileSync(join(root, "data/courses.json"), "utf8"));
  writeFileSync(titleFile, "Open Courses");
  writeFileSync(subFile, `${courses.length} free, self-paced courses - videos, guides, ebooks, slides and code`);

  ffmpeg(
    "-f", "lavfi", "-i", "color=c=0x0f172a:s=1200x630:d=1",
    "-vf", [
      "drawbox=x=0:y=0:w=1200:h=8:color=0x2563eb:t=fill",
      `drawtext=fontfile='${serif}':textfile='${titleFile}':fontcolor=0xf8fafc:fontsize=96:x=80:y=170`,
      `drawtext=fontfile='${serif}':textfile='${subFile}':fontcolor=0xa8b6c8:fontsize=34:x=80:y=320`,
      "drawtext=fontfile='" + serif + "':fontcolor=0x7cc0ff:fontsize=28:x=80:y=520:text='RSQUARED ACADEMY'",
    ].join(","),
    "-frames:v", "1",
    "-q:v", "2",
    join(ASSETS, "og-card.jpg")
  );
  console.log(`og-card.jpg  ${kb(join(ASSETS, "og-card.jpg"))} KB  (1200x630)`);
}

/* ---------------- main ---------------- */

const steps = { thumbs, favicon, og };
const want = process.argv[2];
if (want && !steps[want]) {
  console.error(`Unknown step "${want}". Use: ${Object.keys(steps).join(", ")}`);
  process.exit(1);
}
for (const [name, fn] of Object.entries(steps)) {
  if (want && name !== want) continue;
  console.log(`\n== ${name} ==`);
  fn();
}
