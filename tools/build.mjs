#!/usr/bin/env node
/**
 * Zero-dependency build script: renders index.html from
 * data/courses.json + src/template.html.
 *
 * Usage:  node tools/build.mjs
 * Output: index.html (committed - the site is served fully static)
 *
 * Template tokens consumed:
 *   {{COURSE_CARDS}}   rendered course card grid
 *   {{TRACKS}}         learning path steps (from data)
 *   {{COURSE_COUNT}}   number of courses
 *   {{TRACK_COUNT}}    number of tracks
 *   {{JSON_LD}}        Organization + ItemList of Course
 *   {{BUILD_YEAR}}     current year (footer copyright)
 *   {{BUILD_DATE}}     ISO date (sitemap lastmod helper, comment only)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TRACK_NAMES = {
  foundations: "Foundations",
  wrangling: "Wrangling",
  "text-web": "Text & Web",
  applied: "Applied Analytics",
  tooling: "Tooling",
};

const LEVEL_NAMES = { beg: "Beginner", int: "Intermediate", adv: "Advanced" };

const LINK_ICONS = {
  course: "bi-book",
  video: "bi-play-btn",
  guide: "bi-file-earmark-text",
  ebook: "bi-journal-richtext",
  slides: "bi-easel",
  code: "bi-github",
  lab: "bi-cloud",
};

/** One link per card is promoted to the primary call to action; ranked by type. */
const PRIMARY_RANK = ["course", "video", "guide", "lab", "ebook", "slides", "code"];
const CTA_LABELS = { course: "Start the course", video: "Watch the playlist" };

/** [singular, plural] labels for the grouped resource rows. */
const GROUP_LABELS = {
  video: ["Video", "Videos"],
  guide: ["Guide", "Guides"],
  ebook: ["eBook", "eBooks"],
  slides: ["Slides", "Slides"],
  code: ["Code", "Code"],
  lab: ["Lab", "Labs"],
};

/** Stable top-to-bottom order for the resource rows, regardless of data order. */
const GROUP_ORDER = ["video", "guide", "ebook", "slides", "code", "lab"];

/** The row label already names the type, so "Blog: X" / "Slides: X" repeats it. */
const REDUNDANT_PREFIX = /^(blog|slides|ebook|video)\s*:\s*/i;

const ORIGIN = "courses.rsquaredacademy.com";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** First-party subdomains open in the same tab; everything else in a new tab. */
function isInternal(href) {
  try {
    const u = new URL(href);
    return u.hostname === ORIGIN || u.hostname.endsWith(".rsquaredacademy.com");
  } catch {
    return true; // relative or malformed - treat as internal
  }
}

function renderLink(link, modifier = "") {
  const internal = isInternal(link.href);
  const icon = `<i class="${LINK_ICONS[link.type] || "bi-link-45deg"}" aria-hidden="true"></i>`;
  const ext = internal
    ? ""
    : `<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>`;
  const attrs = internal
    ? ""
    : ' target="_blank" rel="noopener noreferrer"';
  return (
    `<a class="labtn${modifier}" href="${esc(link.href)}"${attrs}>` +
    `${icon}<span>${esc(link.label)}</span>${ext}</a>`
  );
}

/** The link the card heading and the main button both point at. */
function primaryLink(links) {
  for (const type of PRIMARY_RANK) {
    const link = links.find((l) => l.type === type);
    if (link) return link;
  }
  return links[0];
}

function renderPrimary(link) {
  const cta = { ...link, label: CTA_LABELS[link.type] || link.label };
  return renderLink(cta, " primary lcta");
}

/** Remaining links, grouped by resource type into one compact row per type. */
function renderResources(links, primary) {
  const groups = new Map();
  for (const link of links) {
    if (link === primary) continue;
    if (!groups.has(link.type)) groups.set(link.type, []);
    groups.get(link.type).push(link);
  }

  const ordered = [
    ...GROUP_ORDER.filter((type) => groups.has(type)),
    ...[...groups.keys()].filter((type) => !GROUP_ORDER.includes(type)),
  ];

  const rows = ordered
    .map((type) => {
      const items = groups.get(type);
      const labels = GROUP_LABELS[type] || [type, type];
      const icon = `<i class="${LINK_ICONS[type] || "bi-link-45deg"}" aria-hidden="true"></i>`;
      const label = `<span class="lres-label">${esc(
        labels[items.length > 1 ? 1 : 0]
      )}</span>`;
      const anchors = items
        .map((item) => {
          const internal = isInternal(item.href);
          const cls = internal ? "" : ' class="ext"';
          const attrs = internal
            ? ""
            : ' target="_blank" rel="noopener noreferrer"';
          return `<a href="${esc(item.href)}"${cls}${attrs}>${esc(
            item.label.replace(REDUNDANT_PREFIX, "")
          )}</a>`;
        })
        .join('<span class="lres-sep" aria-hidden="true">&middot;</span>');
      return (
        `<li class="lres-group">${icon}${label}` +
        `<span class="lres-links">${anchors}</span></li>`
      );
    })
    .join("\n              ");

  if (!rows) return "";
  return `<ul class="lres">\n              ${rows}\n            </ul>`;
}

function renderCard(course) {
  const search = [
    course.title,
    course.blurb,
    (course.topics || []).join(" "),
    course.links.map((l) => l.label).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const topics = course.topics || [];
  const details = topics.length
    ? `<details><summary>What&rsquo;s inside</summary><ul>${topics
        .map((t) => `<li>${esc(t)}</li>`)
        .join("")}</ul></details>`
    : "";

  const primary = primaryLink(course.links);
  const resources = renderResources(course.links, primary);

  return `<article class="lcard course-card" id="${esc(course.slug)}" data-track="${esc(
    course.track
  )}" data-search="${esc(search)}">
            <img class="lcover" src="${esc(course.image)}" alt="${esc(
    course.imageAlt
  )}" width="480" height="270" loading="lazy" decoding="async">
            <div class="lbody">
              <p class="ltrack">${esc(TRACK_NAMES[course.track] || course.track)}<span class="lpill ${esc(
    course.level
  )}">${esc(LEVEL_NAMES[course.level] || course.level)}</span></p>
              <h2><a href="${esc(primary.href)}"${
    isInternal(primary.href)
      ? ""
      : ' target="_blank" rel="noopener noreferrer"'
  }>${esc(course.title)}</a></h2>
              <p class="lout">${esc(course.blurb)}</p>
              ${details}
              <div class="lactions">
              ${renderPrimary(primary)}
              ${resources}
              </div>
            </div>
          </article>`;
}

function renderTracks(courses) {
  const counts = {};
  for (const c of courses) counts[c.track] = (counts[c.track] || 0) + 1;
  return Object.entries(TRACK_NAMES)
    .filter(([key]) => counts[key])
    .map(
      ([key, name]) =>
        `<button type="button" class="chip" data-filter="${key}" aria-pressed="false">${esc(name)} (${counts[key]})</button>`
    )
    .join("\n          ");
}

function renderJsonLd(courses) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Rsquared Academy",
        url: "https://www.rsquaredacademy.com/",
        logo: "https://courses.rsquaredacademy.com/assets/images/og-card.jpg",
        sameAs: [
          "https://github.com/rsquaredacademy",
          "https://www.linkedin.com/company/rsquared-academy",
          "https://www.youtube.com/user/rsquaredin/",
        ],
      },
      {
        "@type": "ItemList",
        name: "Rsquared Academy Open Courses",
        numberOfItems: courses.length,
        itemListElement: courses.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Course",
            name: c.title,
            description: c.blurb,
            url: `https://courses.rsquaredacademy.com/#${c.slug}`,
            provider: { "@type": "Organization", name: "Rsquared Academy" },
            educationalLevel: LEVEL_NAMES[c.level],
            teaches: c.topics,
            hasCourseInstance: {
              "@type": "CourseInstance",
              courseMode: "online",
              courseWorkload: "PT2H",
            },
          },
        })),
      },
    ],
  };
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n  </script>`;
}

function main() {
  const data = JSON.parse(readFileSync(join(root, "data/courses.json"), "utf8"));
  const template = readFileSync(join(root, "src/template.html"), "utf8");

  const courses = data.courses;
  const slugs = new Set();
  for (const c of courses) {
    if (slugs.has(c.slug)) throw new Error(`Duplicate slug: ${c.slug}`);
    slugs.add(c.slug);
    if (!c.links.length) throw new Error(`No links for ${c.slug}`);
  }

  const tokens = {
    "{{COURSE_CARDS}}": courses.map(renderCard).join("\n          "),
    "{{TRACKS}}": renderTracks(courses),
    "{{COURSE_COUNT}}": String(courses.length),
    "{{TRACK_COUNT}}": String(
      Object.keys(TRACK_NAMES).filter((k) => courses.some((c) => c.track === k))
        .length
    ),
    "{{JSON_LD}}": renderJsonLd(courses),
    "{{BUILD_YEAR}}": String(new Date().getFullYear()),
    "{{BUILD_DATE}}": new Date().toISOString().slice(0, 10),
  };

  let out = template;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value);
  }

  const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(`Unreplaced template tokens: ${leftover.join(", ")}`);
  }

  const today = new Date().toISOString().slice(0, 10);

  writeFileSync(join(root, "index.html"), out, "utf8");

  writeFileSync(
    join(root, "robots.txt"),
    "User-agent: *\nAllow: /\nSitemap: https://courses.rsquaredacademy.com/sitemap.xml\n"
  );

  writeFileSync(
    join(root, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url>\n    <loc>https://courses.rsquaredacademy.com/</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n` +
      `</urlset>\n`
  );

  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
  console.log(
    `Built index.html: ${courses.length} courses, ${kb} KB (+ robots.txt, sitemap.xml)`
  );
}

main();
