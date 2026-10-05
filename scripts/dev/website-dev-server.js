/**
 * Serves `website/` locally so the dashboard can be worked on without Vercel, Discord or Mongo.
 *
 * The real `api/` functions need a client secret, a session secret and a database; none of that
 * belongs in a loop where the thing being changed is layout and copy. So the API is **stubbed**
 * here, from fixtures chosen to be the states that are easy to get wrong: a brand-new account
 * with zero of everything, and one far enough along to have badges and a part-filled level bar.
 *
 * This proves the page's rendering, not its auth — `tests/websiteAuth.test.js` covers the parts
 * that actually matter for security, and `vercel dev` is the way to exercise the real endpoints.
 *
 * Usage: node scripts/dev/website-dev-server.js [--port 4321] [--state full|new|signed-out|free|unsold]
 * Switch state live with ?state=new on any page; it is remembered for the session.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { STUBS } from "./website-dev-stubs.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "website");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg("port", 4321));
let state = arg("state", "full");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

const server = http.createServer(async (req, res) => {
  // A page on another site can point its own hostname at 127.0.0.1 and read this server (DNS
  // rebinding); the only legitimate Host is this machine's own name for itself.
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host ?? "")) {
    res.writeHead(403, { "Content-Type": "text/plain" }).end("Forbidden");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.searchParams.has("state")) state = url.searchParams.get("state");

  const stub = Object.hasOwn(STUBS, url.pathname) ? STUBS[url.pathname] : null;
  if (stub) return stub({ req, res, url, state, setState: (next) => (state = next), port: PORT });

  // The `/u/:token` rewrite from vercel.json. The page reads the token off the path itself, so
  // without this the link shape cannot be exercised locally at all.
  // The `/np/:token` rewrite likewise: the overlay reads its link off the path.
  if (url.pathname.startsWith("/np/")) {
    const body = await readFile(path.join(ROOT, "np.html"));
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    return res.end(body);
  }

  // The /servers/:id rewrite: the page reads the server id off the path itself.
  if (url.pathname.startsWith("/servers/")) {
    const body = await readFile(path.join(ROOT, "server.html"));
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    return res.end(body);
  }

  if (url.pathname.startsWith("/u/")) {
    const body = await readFile(path.join(ROOT, "passport.html"));
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    return res.end(body);
  }

  // cleanUrls, matching vercel.json — /dashboard has to resolve to dashboard.html here too.
  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!path.extname(file)) file += ".html";

  // A dotfile is never served: `website/.env.local` holds the dashboard's secrets, and `.vercel/` the
  // project link. `path.extname("/.env.local")` is ".local", so nothing else would have stopped it.
  if (url.pathname.split("/").some((segment) => segment.startsWith("."))) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  // Resolved and then checked to be inside ROOT, so a ../ in the path can't read the repo.
  const target = path.resolve(ROOT, `.${file}`);
  if (!target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

// Loopback only: this is a developer's machine, and the folder it serves can sit next to real secrets.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`website dev server on http://localhost:${PORT} (state: ${state})`);
  console.log(
    "states: full (default), new, signed-out, free (not entitled, for sale), unsold (not entitled, nothing for sale)"
  );
});
