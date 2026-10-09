/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/track.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

import { stripNoiseBrackets, stripNoiseSuffix } from "./titleNoise.js";

/**
 * YouTube title noise. Only bracketed or clearly-suffixed patterns: anything cleverer starts
 * eating real titles, which is worse than "(Official Video)" surviving.
 *
 * These are the English rules. Every other language is in `titleNoise.js`, which is stricter on
 * purpose: this pattern lets a bracket go if it merely *contains* one of its words, and that is only
 * safe in a language whose every word here is known.
 */
const TITLE_NOISE = [
  // The same words as an unbracketed suffix after a dash or pipe (the full-width `｜` too).
  /\s*[-–—|｜]\s*(?:official\s*)?(?:music\s*)?(?:video|audio|lyric video|lyrics|visualizer|visualiser)\s*$/gi,
  // "Official …" ends a title with no separator at all (`YOASOBI「アイドル」 Official Music Video`): the word
  // "official" is what makes it safe, where a bare "video" or "audio" after a space could be the title.
  /\s+official\s+(?:music\s*)?(?:video|audio|lyric video|lyrics|visualizer|visualiser|mv|m\/v)\s*$/gi,
  /\s*[-–—|｜]?\s*\b(?:hd|hq|4k|8k)\b\s*$/gi,
  // YouTube's auto-generated artist channels: "Artist - Topic".
  /\s*[-–—|｜]\s*topic\s*$/gi,
];

/**
 * (Official Video), [Official Music Video], (Lyrics), [4K Remaster], (HD)... A bracket is removed when
 * it holds one of these words. Two steps rather than one pattern with a word list between two
 * `[^)\]]*` runs: with no closing bracket that pattern is cubic in the title's length, and a title is
 * whatever a file's tags say.
 */
const NOISE_BRACKET = /[([]([^)\]]{0,80})[)\]]/g;
const NOISE_WORD =
  /\b(?:official|lyric|lyrics|audio|visualizer|visualiser|music\s*video|hd|hq|4k|8k|full\s*hd|remaster(?:ed)?|explicit|clean|mv|m\/v)\b/i;

/**
 * Longer than any real title. Lavalink's HTTP source passes a file's own tags through, so the length
 * is not up to the uploader's good sense; everything below is bounded by this.
 */
const MAX_TITLE_LENGTH = 200;

/** One removal can expose another (`Song - Video Oficial - HD`), so the rules run until nothing changes. */
const MAX_PASSES = 4;

function stripNoise(title) {
  let cleaned = title;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const before = cleaned;
    cleaned = cleaned.replace(NOISE_BRACKET, (bracket, inner) => (NOISE_WORD.test(inner) ? "" : bracket));
    for (const pattern of TITLE_NOISE) cleaned = cleaned.replace(pattern, "");
    cleaned = stripNoiseSuffix(stripNoiseBrackets(cleaned)).trimEnd();
    if (cleaned === before) break;
  }
  return cleaned;
}

/** Safe on any source. Never returns empty: a title that is only noise is kept as it was. */
export function cleanTrackTitle(title) {
  if (!title) return title ?? "";
  if (title.length > MAX_TITLE_LENGTH) title = title.slice(0, MAX_TITLE_LENGTH);

  const cleaned = stripNoise(title)
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—|｜]\s*$/, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .trim();

  return cleaned || title;
}

/**
 * The author without YouTube's "- Topic" suffix, which auto-generated artist channels carry ("Artist - Topic").
 * Only at the very end, and never when it would leave nothing.
 * @param {?string} [author]
 * @returns {string}
 */
export function cleanTrackAuthor(author) {
  if (!author) return author ?? "";
  const cleaned = author.replace(/\s*[-–—|｜]\s*topic\s*$/i, "").trim();
  return cleaned || author;
}

/** The cleaned title and the author apart, for a list that sets them differently. `artist` is "" when there is none. */
export function splitTrackTitle(track) {
  return { title: cleanTrackTitle(track.title), artist: cleanTrackAuthor(track.author) };
}

/** "Author - Title" with the title cleaned; the bare title when there is no author. */
export function formatTrackTitle(track) {
  const title = cleanTrackTitle(track.title);
  const author = cleanTrackAuthor(track.author);
  return author ? `${author} - ${title}` : title;
}
