/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/playlistArt.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

/**
 * Unique generated art for a playlist, drawn from its name: the same name always gives the same picture, and two
 * names rarely give the same one. Returned as an SVG string so every surface can use it as it is (a page shows it
 * as an image, the bot rasterises it for a Discord message), with no model, no upload and nothing to moderate.
 *
 * Twelve patterns, each coloured by the gradient `playlistCover()` already picks for the name, so the art and the
 * letter cover of the same playlist are the same colours. Which pattern, and its shapes, come from the hash.
 *
 * Imports only `playlistCover.js`; copied verbatim into `website/lib/generated/` by `scripts/sync-web-shared.js`
 * together with it.
 */

import { playlistCover } from "./playlistCover.js";

/** The viewBox's side. Everything is drawn in these units and scaled by the SVG's own width and height. */
const BOX = 256;

export const ART_PATTERNS = Object.freeze([
  "waves", "orbits", "bars", "rings", "burst", "blocks",
  "vinyl", "mesh", "halftone", "peaks", "arches", "waveform",
]);

/** FNV-1a, the same as the cover's: a name seeds both. */
function hash(text) {
  let h = 0x811c9dc5;
  for (const char of text) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A small seeded generator (mulberry32): the same seed gives the same run of numbers on every runtime. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (value) => Math.round(value * 10) / 10;

/** `#rrggbb` mixed toward white by `amount` (0-1), for the highlights. */
function lighten(hex, amount) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels.map((c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0")).join("")}`;
}

/** Overlapping bands of a sine wave, nearest the bottom brightest. */
function waves(r, light) {
  const bands = 4 + Math.floor(r() * 2);
  const out = [];
  for (let i = 0; i < bands; i++) {
    const base = BOX * (0.3 + (i / bands) * 0.62);
    const amplitude = 10 + r() * 18;
    const length = 90 + r() * 110;
    const phase = r() * Math.PI * 2;
    const points = [];
    for (let x = 0; x <= BOX; x += 8) points.push(`${x},${n(base + Math.sin((x / length) * Math.PI * 2 + phase) * amplitude)}`);
    out.push(`<polygon points="${points.join(" ")} ${BOX},${BOX} 0,${BOX}" fill="${light}" fill-opacity="${n(0.1 + i * 0.07)}"/>`);
  }
  return out.join("");
}

/** A few large translucent circles and one ring. */
function orbits(r, light) {
  const out = [];
  const count = 4 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    const radius = 34 + r() * 70;
    out.push(`<circle cx="${n(r() * BOX)}" cy="${n(r() * BOX)}" r="${n(radius)}" fill="${light}" fill-opacity="${n(0.1 + r() * 0.14)}"/>`);
  }
  out.push(`<circle cx="${n(60 + r() * 136)}" cy="${n(60 + r() * 136)}" r="${n(40 + r() * 40)}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="5"/>`);
  return out.join("");
}

/** An equaliser: rounded bars from the bottom edge. */
function bars(r, light) {
  const count = 6 + Math.floor(r() * 3);
  const gap = 8;
  const width = (BOX - gap * (count + 1)) / count;
  const out = [];
  for (let i = 0; i < count; i++) {
    const height = BOX * (0.22 + r() * 0.58);
    const x = gap + i * (width + gap);
    out.push(`<rect x="${n(x)}" y="${n(BOX - height)}" width="${n(width)}" height="${n(height + width)}" rx="${n(width / 2)}" fill="${i % 3 === 0 ? "#fff" : light}" fill-opacity="${i % 3 === 0 ? 0.92 : 0.5}"/>`);
  }
  return out.join("");
}

/** Concentric rings around a point near a corner, and a dot at the middle of them. */
function rings(r, light) {
  const cx = BOX * (0.2 + r() * 0.6);
  const cy = BOX * (0.2 + r() * 0.6);
  const out = [];
  for (let i = 1; i <= 6; i++) {
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(i * 24 + r() * 6)}" fill="none" stroke="${i % 2 ? "#fff" : light}" stroke-opacity="${n(0.55 - i * 0.06)}" stroke-width="${n(3 + r() * 5)}"/>`);
  }
  out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(10 + r() * 8)}" fill="#fff" fill-opacity="0.92"/>`);
  return out.join("");
}

/** Rays fanning out from a corner. */
function burst(r, light) {
  const corner = [[0, 0], [BOX, 0], [0, BOX], [BOX, BOX]][Math.floor(r() * 4)];
  const rays = 10 + Math.floor(r() * 6) * 2;
  const reach = BOX * 2;
  const quarter = Math.PI / 2;
  const start = corner[0] === 0 ? (corner[1] === 0 ? 0 : -quarter) : corner[1] === 0 ? quarter : Math.PI;
  const out = [];
  for (let i = 0; i < rays; i += 2) {
    const a = start + (i / rays) * quarter;
    const b = start + ((i + 1) / rays) * quarter;
    out.push(`<polygon points="${corner[0]},${corner[1]} ${n(corner[0] + Math.cos(a) * reach)},${n(corner[1] + Math.sin(a) * reach)} ${n(corner[0] + Math.cos(b) * reach)},${n(corner[1] + Math.sin(b) * reach)}" fill="${light}" fill-opacity="0.26"/>`);
  }
  out.push(`<circle cx="${corner[0]}" cy="${corner[1]}" r="${n(46 + r() * 30)}" fill="#fff" fill-opacity="0.9"/>`);
  return out.join("");
}

/** A 3 x 3 grid of quarter circles, squares and half circles, turned at random: a Bauhaus tile. */
function blocks(r, light) {
  const cell = BOX / 3;
  const out = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = col * cell;
      const y = row * cell;
      const kind = Math.floor(r() * 4);
      const fill = r() < 0.4 ? "#fff" : light;
      const opacity = fill === "#fff" ? 0.88 : n(0.35 + r() * 0.3);
      const turn = Math.floor(r() * 4) * 90;
      const centre = `${n(x + cell / 2)} ${n(y + cell / 2)}`;
      let shape;
      if (kind === 0) shape = `<path d="M${x} ${y}h${n(cell)}a${n(cell)} ${n(cell)} 0 0 1-${n(cell)} ${n(cell)}z"/>`;
      else if (kind === 1) shape = `<circle cx="${n(x + cell / 2)}" cy="${n(y + cell / 2)}" r="${n(cell * 0.38)}"/>`;
      else if (kind === 2) shape = `<path d="M${x} ${n(y + cell)}a${n(cell / 2)} ${n(cell / 2)} 0 0 1 ${n(cell)} 0z"/>`;
      else shape = `<rect x="${n(x + cell * 0.14)}" y="${n(y + cell * 0.14)}" width="${n(cell * 0.72)}" height="${n(cell * 0.72)}" rx="${n(cell * 0.12)}"/>`;
      out.push(`<g transform="rotate(${turn} ${centre})" fill="${fill}" fill-opacity="${opacity}">${shape}</g>`);
    }
  }
  return out.join("");
}

/** A record: dark disc, grooves and a label, set off-centre so part of it runs off the edge. */
function vinyl(r, light) {
  const cx = BOX * (0.38 + r() * 0.24);
  const cy = BOX * (0.38 + r() * 0.24);
  const out = [`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(112 + r() * 10)}" fill="#000" fill-opacity="0.32"/>`];
  for (let radius = 50; radius < 108; radius += 7 + r() * 3) {
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" fill="none" stroke="#fff" stroke-opacity="${n(0.07 + r() * 0.1)}" stroke-width="1.6"/>`);
  }
  out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(32 + r() * 6)}" fill="${light}" fill-opacity="0.95"/>`);
  out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="5" fill="#000" fill-opacity="0.45"/>`);
  return out.join("");
}

/** Soft blobs of light, blended: no hard edge anywhere. */
function mesh(r, light, id) {
  const out = [];
  const count = 4 + Math.floor(r() * 2);
  for (let i = 0; i < count; i++) {
    const stop = `<stop offset="0" stop-color="${i % 2 ? "#fff" : light}" stop-opacity="${n(0.55 + r() * 0.3)}"/><stop offset="1" stop-color="${light}" stop-opacity="0"/>`;
    out.push(`<radialGradient id="${id}m${i}">${stop}</radialGradient>`);
    out.push(`<circle cx="${n(r() * BOX)}" cy="${n(r() * BOX)}" r="${n(90 + r() * 80)}" fill="url(#${id}m${i})"/>`);
  }
  return out.join("");
}

/** A grid of dots that swell toward one point, like a halftone print. */
function halftone(r, light) {
  const cells = 9;
  const size = BOX / cells;
  const fx = r() * BOX;
  const fy = r() * BOX;
  const reach = Math.hypot(BOX, BOX) * 0.7;
  const out = [];
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const x = (col + 0.5) * size;
      const y = (row + 0.5) * size;
      // Softer than a print: dots stay well inside their cell and the middle of the swell is the only bright part.
      const near = 1 - Math.min(1, Math.hypot(x - fx, y - fy) / reach);
      out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.4 + near * size * 0.34)}" fill="${near > 0.55 ? "#fff" : light}" fill-opacity="${n(0.3 + near * 0.5)}"/>`);
    }
  }
  return out.join("");
}

/** Layers of mountains, the farthest palest, under a small sun. */
function peaks(r, light) {
  const out = [`<circle cx="${n(50 + r() * 156)}" cy="${n(40 + r() * 40)}" r="${n(18 + r() * 12)}" fill="#fff" fill-opacity="0.92"/>`];
  for (let layer = 0; layer < 4; layer++) {
    const base = BOX * (0.5 + layer * 0.14);
    const points = [`0,${BOX}`];
    for (let x = -20; x <= BOX + 40; x += 36 + r() * 30) {
      points.push(`${n(x)},${n(base - (layer === 3 ? 0.35 : 1) * (14 + r() * 62))}`);
    }
    points.push(`${BOX},${BOX}`);
    out.push(`<polygon points="${points.join(" ")}" fill="${layer % 2 ? "#000" : light}" fill-opacity="${n(layer % 2 ? 0.16 : 0.2 + layer * 0.08)}"/>`);
  }
  return out.join("");
}

/** Nested half rings rising from the bottom, like a rainbow in two tones. */
function arches(r, light) {
  const cx = BOX * (0.3 + r() * 0.4);
  const cy = BOX * (0.78 + r() * 0.18);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const radius = 22 + i * 24;
    out.push(`<path d="M${n(cx - radius)} ${n(cy)}A${radius} ${radius} 0 0 1 ${n(cx + radius)} ${n(cy)}" fill="none" stroke="${i % 2 ? light : "#fff"}" stroke-opacity="${i % 2 ? 0.55 : n(0.9 - i * 0.08)}" stroke-width="15"/>`);
  }
  return out.join("");
}

/** A voice-memo waveform: thin rounded bars from the middle line, swelling and fading. */
function waveform(r, light) {
  const count = 19;
  const gap = 4;
  const width = (BOX - 40 - gap * (count - 1)) / count;
  const a = 3 + r() * 4;
  const b = 5 + r() * 6;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const wave = 0.5 + 0.5 * Math.sin(t * a + r() * 0.8) * Math.sin(t * b);
    const height = 18 + (BOX * 0.62 - 18) * Math.abs(wave) * (0.45 + 0.55 * Math.sin(t * Math.PI));
    const x = 20 + i * (width + gap);
    out.push(`<rect x="${n(x)}" y="${n((BOX - height) / 2)}" width="${n(width)}" height="${n(height)}" rx="${n(width / 2)}" fill="${i % 4 === 0 ? light : "#fff"}" fill-opacity="${i % 4 === 0 ? 0.8 : 0.92}"/>`);
  }
  return out.join("");
}

const DRAW = { waves, orbits, bars, rings, burst, blocks, vinyl, mesh, halftone, peaks, arches, waveform };

/** The colours an owner can pick from: a label for the menu and the hue the gradient is built on. */
export const ART_COLOURS = Object.freeze([
  { label: "Red", hue: 355 },
  { label: "Orange", hue: 22 },
  { label: "Amber", hue: 42 },
  { label: "Lime", hue: 85 },
  { label: "Green", hue: 135 },
  { label: "Teal", hue: 172 },
  { label: "Cyan", hue: 195 },
  { label: "Blue", hue: 218 },
  { label: "Indigo", hue: 242 },
  { label: "Violet", hue: 268 },
  { label: "Magenta", hue: 308 },
  { label: "Pink", hue: 335 },
]);

/**
 * @param {string} name - The playlist's name.
 * @param {{size?: number, pattern?: ?string, hue?: ?number}} [options] - `size` in pixels (default 256); `pattern`
 *        forces one of `ART_PATTERNS` instead of the one the name picks; `hue` is the colour an owner chose
 *        (one of `ART_COLOURS`), instead of the one the name picks.
 * @returns {string} A square SVG, no rounded corners: the surface rounds it the way it rounds every cover.
 */
export function playlistArt(name, { size = BOX, pattern, hue } = {}) {
  const text = String(name ?? "").trim().toLowerCase();
  const seed = hash(text);
  const { from, to } = playlistCover(name, { hue });
  const chosen = ART_PATTERNS.includes(pattern) ? pattern : ART_PATTERNS[(seed >>> 4) % ART_PATTERNS.length];
  const r = random(seed ^ 0x9e3779b9);
  // Ids are per picture, so several inlined in one page do not borrow each other's gradients: the name, and the
  // pattern and colour too, since two playlists can share a name and differ in what their owners chose. The colour
  // as it came out, not the hue asked for: a hue that was ignored then changes nothing, the id included.
  const id = `a${seed.toString(36)}p${ART_PATTERNS.indexOf(chosen)}c${from.slice(1)}`;
  const body = DRAW[chosen](r, lighten(from, 0.55), id);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${BOX} ${BOX}">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="${BOX}" height="${BOX}" fill="url(#${id})"/>${body}</svg>`
  );
}
