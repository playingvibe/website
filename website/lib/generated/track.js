/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/track.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

/**
 * YouTube title noise. Only bracketed or clearly-suffixed patterns: anything cleverer starts
 * eating real titles, which is worse than "(Official Video)" surviving.
 */
const TITLE_NOISE = [
  // (Official Video), [Official Music Video], (Lyrics), [4K Remaster], (HD)...
  /[([][^)\]]*\b(?:official|lyric|lyrics|audio|visualizer|visualiser|music\s*video|hd|hq|4k|8k|full\s*hd|remaster(?:ed)?|explicit|clean|mv|m\/v)\b[^)\]]*[)\]]/gi,
  // The same words as an unbracketed suffix after a dash or pipe.
  /\s*[-|]\s*(?:official\s*)?(?:music\s*)?(?:video|audio|lyric video|lyrics|visualizer|visualiser)\s*$/gi,
  /\s*[-|]?\s*\b(?:hd|hq|4k|8k)\b\s*$/gi,
];

/** Safe on any source. Never returns empty: a title that is only noise is kept as it was. */
export function cleanTrackTitle(title) {
  if (!title) return title ?? "";

  let cleaned = title;
  for (const pattern of TITLE_NOISE) cleaned = cleaned.replace(pattern, "");

  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-|]\s*$/, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .trim();

  return cleaned || title;
}

/** "Author - Title" with the title cleaned; the bare title when there is no author. */
export function formatTrackTitle(track) {
  const title = cleanTrackTitle(track.title);
  return track.author ? `${track.author} - ${title}` : title;
}
