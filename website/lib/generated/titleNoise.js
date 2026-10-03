/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/titleNoise.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

// @ts-check

/**
 * The words an uploader puts beside a song's name that say nothing about the song, in every language
 * but English (English has its own, older rules in `track.js`). All lowercase; a space inside a phrase
 * matches any run of whitespace.
 *
 * **Why this is not just more words in the English pattern.** That pattern's `\b` is ASCII-only in a
 * JavaScript regex: it treats `í`, `é`, `ü` and every letter outside Latin as a non-word character, so
 * `\bvídeo oficial\b` never matches at all, and for Chinese, Japanese or Korean, which have no spaces
 * between words, a boundary means nothing. And an English-style "the bracket contains the word" rule
 * is too eager in languages this list cannot check line by line: `(Letra de Amor)` is a title, not
 * noise. So these are used only where a **whole** bracket is made of nothing but noise words, years
 * and quality marks (`(Video Oficial 2011)`, `【官方MV】`), or as a clear dash-or-pipe suffix of the
 * official-video kind (`SUFFIX_PHRASES`).
 *
 * Each list is the phrases that actually appear on uploads, not a translation of the English ones.
 * Extending one is safe if it is a word that is never a song's name by itself.
 */
const NOISE = {
  spanish: [
    "video oficial", "vídeo oficial", "audio oficial", "videoclip oficial", "videoclip", "video clip",
    "vídeo clip", "video musical", "vídeo musical", "letra", "letras", "con letra", "oficial",
    "remasterizado", "remasterizada", "versión remasterizada", "version remasterizada",
  ],
  portuguese: [
    "vídeo oficial", "video oficial", "clipe oficial", "clipe", "videoclipe", "áudio oficial",
    "audio oficial", "áudio", "letra", "letras", "legendado", "oficial", "remasterizado", "remasterizada",
  ],
  french: [
    "clip officiel", "vidéo officielle", "video officielle", "audio officiel", "officiel", "officielle",
    "paroles", "avec paroles", "clip", "remasterisé", "remasterisée", "version remasterisée",
  ],
  german: [
    "offizielles video", "offizielles musikvideo", "offizielles lyric video", "offizielles audio",
    "offizielles", "offizieller", "offiziell", "musikvideo", "songtext", "mit text",
  ],
  italian: [
    "video ufficiale", "audio ufficiale", "videoclip ufficiale", "videoclip", "ufficiale", "testo",
    "con testo", "rimasterizzato", "rimasterizzata",
  ],
  turkish: [
    "resmi video", "resmi klip", "resmî video", "resmî klip", "resmi müzik videosu", "resmi ses", "resmi",
    "resmî", "resmı",
    "müzik videosu", "klip", "şarkı sözleri", "sözler", "sözleriyle",
  ],
  russian: [
    "официальное видео", "официальный клип", "официальное аудио", "официальное лирик видео",
    "официальный", "видеоклип", "клип", "текст песни", "текст", "со словами", "ремастер", "ремастеринг",
    "аудио", "лирик видео",
  ],
  arabic: [
    "الفيديو الرسمي", "فيديو رسمي", "الكليب الرسمي", "كليب رسمي", "فيديو كليب رسمي", "فيديو كليب", "كليب",
    "الرسمي", "رسمي", "كلمات الأغنية", "مع الكلمات", "كلمات",
  ],
  urdu: [
    "آفیشل میوزک ویڈیو", "آفیشل ویڈیو", "آفیشل آڈیو", "آفیشل", "سرکاری ویڈیو", "میوزک ویڈیو", "ویڈیو",
    "آڈیو", "لیرکس", "بولوں کے ساتھ", "بول",
  ],
  hindi: [
    "ऑफिशियल म्यूजिक वीडियो", "ऑफिशियल वीडियो", "ऑफिशियल ऑडियो", "आधिकारिक वीडियो", "ऑफिशियल",
    "आधिकारिक", "म्यूजिक वीडियो", "लिरिकल वीडियो", "लिरिकल", "वीडियो", "ऑडियो", "लिरिक्स", "गीत के बोल",
  ],
  indonesian: [
    "video klip resmi", "video musik resmi", "audio resmi", "video resmi", "klip resmi", "video klip",
    "klip video", "video musik", "lirik lagu", "dengan lirik", "lirik", "resmi",
  ],
  chinese: [
    "官方mv", "官方版mv", "官方版", "官方音频", "官方音頻", "官方视频", "官方視頻", "官方歌词版", "官方歌詞版",
    "官方", "动态歌词", "動態歌詞", "歌词版", "歌詞版", "歌词", "歌詞", "中文字幕", "字幕", "音乐视频",
    "音樂視頻", "高清", "超清", "无损", "無損", "完整版", "重制版", "重製版", "mv",
  ],
  japanese: [
    "公式ミュージックビデオ", "公式mv", "公式ビデオ", "公式pv", "公式音源", "公式", "リリックビデオ",
    "ミュージックビデオ", "歌詞付き", "歌詞", "高画質", "リマスター", "音源", "mv", "pv",
  ],
  korean: [
    "공식 뮤직비디오", "공식 mv", "공식 오디오", "공식", "뮤직비디오", "가사 포함", "가사", "오디오",
    "리마스터", "고화질",
  ],
};

/**
 * The phrases that can end a title after a dash or pipe and still be clearly noise: the "official
 * video / audio" kind, and the compound "lyric video" ones (`歌詞あり`, `Lirik Lagu`). A bare `letra` or
 * `paroles` is left out of this list on purpose, because `Artist - Letra` could be the song.
 */
const SUFFIX_PHRASES = [
  "video oficial", "vídeo oficial", "audio oficial", "clipe oficial", "áudio oficial",
  "clip officiel", "vidéo officielle", "video officielle", "audio officiel",
  "offizielles video", "offizielles musikvideo", "offizielles audio",
  "video ufficiale", "audio ufficiale",
  "resmi video", "resmi klip", "resmî video", "resmî klip", "resmi müzik videosu",
  "официальное видео", "официальный клип", "официальное аудио",
  "الفيديو الرسمي", "فيديو رسمي", "الكليب الرسمي", "كليب رسمي",
  "آفیشل ویڈیو", "آفیشل میوزک ویڈیو",
  "ऑफिशियल वीडियो", "ऑफिशियल म्यूजिक वीडियो", "आधिकारिक वीडियो",
  "video klip resmi", "video musik resmi", "video resmi", "audio resmi",
  "官方mv", "官方版mv", "官方音频", "官方音頻", "官方视频", "官方視頻",
  "公式mv", "公式ビデオ", "公式ミュージックビデオ", "公式音源",
  "공식 뮤직비디오", "공식 mv", "공식 오디오",
  "lirik lagu", "歌詞あり", "歌詞付き", "歌詞入り", "歌词版", "歌詞版", "动态歌词", "動態歌詞", "가사 포함",
];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Longest first, so `video oficial` is tried before `oficial`. */
const alternation = (phrases) =>
  [...new Set(phrases)]
    .sort((a, b) => b.length - a.length)
    // `İ`, the Turkish capital dotted i, has no case-insensitive match with `i` in a JavaScript regex.
    .map((phrase) => escapeRegex(phrase).replace(/ /g, "\\s+").replace(/i/g, "[iİ]"))
    .join("|");

const WORDS = alternation(Object.values(NOISE).flat());
/** Between noise words inside a bracket: spaces and the usual joiners, in any script. */
const SEPARATOR = "[\\s,;:/&+·・•|｜_.\\-–—]";
/** A year, a resolution or a quality mark: noise beside a noise word, never on their own. */
const NUMERIC = "\\d{4}|\\d{3,4}p|\\d{1,2}k";

/** A bracket's whole content: noise words, years and marks, nothing else. */
const WHOLE_CONTENT = new RegExp(`^${SEPARATOR}*(?:(?:${WORDS}|${NUMERIC})${SEPARATOR}*)+$`, "iu");
const HAS_A_WORD = new RegExp(WORDS, "iu");

/** A bracket longer than this is a sentence, not a tag, and is never tested against the pattern. */
const MAX_NOISE_BRACKET = 80;

/** Every bracket pair the languages here use, including the CJK and full-width ones. */
const BRACKET = /[([【（［「『〔]([^()[\]【】（）［］「」『』〔〕]*)[)\]】）］」』〕]/gu;

/**
 * Removes every bracket whose whole content is noise in one of the supported languages.
 * @param {string} title
 * @returns {string}
 */
export function stripNoiseBrackets(title) {
  return title.replace(BRACKET, (group, content) =>
    content.length <= MAX_NOISE_BRACKET && HAS_A_WORD.test(content) && WHOLE_CONTENT.test(content) ? "" : group
  );
}

const SUFFIX = new RegExp(`\\s*[-|–—｜]\\s*(?:${alternation(SUFFIX_PHRASES)})\\s*$`, "iu");

/**
 * Removes a trailing `- Video Oficial`-style phrase, after a hyphen, en dash, em dash or pipe (the
 * full-width `｜` included).
 * @param {string} title
 * @returns {string}
 */
export function stripNoiseSuffix(title) {
  return title.replace(SUFFIX, "");
}
