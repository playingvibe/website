import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The dashboard is two static pages (`/dashboard`, `/servers`) rendered by ES modules, with no browser
 * in the test suite. These are the cheap structural checks for what splitting it could break: a tab
 * that points nowhere, a template one page needs and the other lacks, a module that imports a file
 * that is not there, and a private page that crawlers are invited to.
 */

const WEB = path.resolve("website");
const read = (file) => readFileSync(path.join(WEB, file), "utf8");
const templates = (html) => [...html.matchAll(/<template id="([^"]+)"/g)].map((m) => m[1]);

test("both pages carry the same tabs, and each marks only itself as current", () => {
  for (const [file, current] of [["dashboard.html", "/dashboard"], ["servers.html", "/servers"]]) {
    const html = read(file);
    const tabs = [...html.matchAll(/<a href="(\/[a-z]+)"( aria-current="page")?>/g)].filter((m) =>
      ["/dashboard", "/servers"].includes(m[1])
    );

    assert.deepEqual(tabs.map((m) => m[1]), ["/dashboard", "/servers"], `${file} has both tabs, in order`);
    assert.deepEqual(tabs.filter((m) => m[2]).map((m) => m[1]), [current], `${file} marks only itself`);
  }
});

test("each page has the templates its script asks for, and the servers one is not on the profile page", () => {
  const dashboard = templates(read("dashboard.html"));
  const servers = templates(read("servers.html"));

  assert.deepEqual(dashboard.sort(), ["tpl-profile", "tpl-signed-out"]);
  assert.deepEqual(servers.sort(), ["tpl-server", "tpl-servers", "tpl-signed-out"]);
});

test("each page loads its own entry script, and that file exists", () => {
  assert.match(read("dashboard.html"), /<script type="module" src="dashboard\.js">/);
  assert.match(read("servers.html"), /<script type="module" src="servers\.js">/);
  assert.ok(existsSync(path.join(WEB, "dashboard.js")) && existsSync(path.join(WEB, "servers.js")));
});

test("every relative import in the dashboard modules resolves to a real file", () => {
  const files = ["dashboard.js", "servers.js", ...readdirSync(path.join(WEB, "dash")).map((f) => `dash/${f}`)];

  for (const file of files) {
    for (const [, spec] of read(file).matchAll(/from "(\.[^"]+)"/g)) {
      const target = path.join(WEB, path.dirname(file), spec);
      assert.ok(existsSync(target), `${file} imports ${spec}, which does not exist`);
    }
  }
});

test("neither private page is offered to crawlers", () => {
  for (const file of ["dashboard.html", "servers.html"]) {
    assert.match(read(file), /<meta name="robots" content="noindex, nofollow"/, `${file} is noindex`);
  }
  const robots = read("robots.txt");
  assert.match(robots, /^Disallow: \/dashboard$/m);
  assert.match(robots, /^Disallow: \/servers$/m);
  assert.doesNotMatch(read("sitemap.xml"), /\/(dashboard|servers)/);
});

// --- one server's settings page (/servers/<id>) -------------------------------------------

test("the settings page is rewritten from /servers/:id, and loads everything by absolute path", () => {
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(
    vercel.rewrites.some((rule) => rule.source === "/servers/:id" && rule.destination === "/server"),
    "vercel.json rewrites /servers/:id to the page"
  );

  // The page is served under /servers/<id>, so a relative asset would resolve to /servers/css/core.css.
  const html = read("server.html");
  for (const [, url] of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
    if (/^(https?:|\/)/.test(url)) continue;
    assert.fail(`server.html loads "${url}" by a relative path`);
  }
  assert.match(html, /<script type="module" src="\/server\.js">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.deepEqual(templates(html).sort(), ["tpl-settings", "tpl-signed-out"]);
});

test("the settings modules put other people's role and channel names in text, never in markup", () => {
  for (const file of ["server.js", "dash/serverSettings.js", "dash/controls.js", "dash/servers.js"]) {
    assert.doesNotMatch(read(file), /innerHTML|insertAdjacentHTML|outerHTML/, `${file} builds markup from data`);
  }
});

test("the servers list is a list: each server has one action and no settings of its own", () => {
  const html = read("servers.html");
  assert.match(html, /class="btn btn-ghost server-action"/);
  assert.doesNotMatch(html, /server-body/);
  assert.doesNotMatch(read("dash/servers.js"), /PATCH|announcements/);
});

test("every page's nav and footer sit between generated markers, so a drift between pages is the generator's to see", () => {
  for (const page of ["index", "privacy", "terms", "dashboard", "passport", "servers", "server"]) {
    const html = read(`${page}.html`);
    for (const region of ["nav", "footer"]) {
      assert.ok(html.includes(`<!-- generated:${region} -->`) && html.includes(`<!-- /generated:${region} -->`), `${page} lacks its generated ${region}`);
    }
  }
});

test("the legal pages and the commands page link to each other, and every page of the site links to Open source", () => {
  // They reach each other from the footer, which leaves out the page you are on.
  const footer = (page) => read(`${page}.html`).match(/<footer[\s\S]*?<\/footer>/)[0];
  assert.match(footer("privacy"), /href="\/commands"[\s\S]*href="\/terms"/);
  assert.doesNotMatch(footer("privacy"), /href="\/privacy"/);
  assert.match(footer("terms"), /href="\/commands"[\s\S]*href="\/privacy"/);
  assert.match(footer("commands"), /href="\/terms"[\s\S]*href="\/privacy"/);
  for (const page of ["index", "privacy", "terms", "commands"]) assert.match(read(`${page}.html`), /Open source/, page);
});
