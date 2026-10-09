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

function renderLink(link) {
  const internal = isInternal(link.href);
  const icon = `<i class="${LINK_ICONS[link.type] || "bi-link-45deg"}" aria-hidden="true"></i>`;
  const ext = internal
    ? ""
    : `<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>`;
  const attrs = internal
    ? ""
    : ' target="_blank" rel="noopener noreferrer"';
  const primary = link.type === "course" ? " primary" : "";
  return (
    `<a class="labtn${primary}" href="${esc(link.href)}"${attrs}>` +
    `${icon}<span>${esc(link.label)}</span>${ext}</a>`
  );
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

  const actions = course.links.map(renderLink).join("\n              ");

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
              <h2><a href="${esc(
                course.links.find((l) => l.type === "course")?.href ||
                  course.links[0].href
              )}"${
    isInternal(
      course.links.find((l) => l.type === "course")?.href ||
        course.links[0].href
    )
      ? ""
      : ' target="_blank" rel="noopener noreferrer"'
  }>${esc(course.title)}</a></h2>
              <p class="lout">${esc(course.blurb)}</p>
              ${details}
              <p class="lactions">
              ${actions}
              </p>
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
        `<button type="button" class="chip" data-filter="${key}" aria-pressed="${
          key === "foundations" ? "true" : "false"
        }">${esc(name)} (${counts[key]})</button>`
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

  writeFileSync(join(root, "index.html"), out, "utf8");
  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
  console.log(`Built index.html: ${courses.length} courses, ${kb} KB`);
}

main();
