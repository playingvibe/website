/**
 * The home page's one interactive piece: the scrubber under "One room, one player", which moves the
 * progress of both small screens at once. The page reads the same without it, so the control starts
 * hidden and is shown from here.
 */
const scrub = document.querySelector("[data-scrub]");
const screens = document.querySelectorAll("[data-screen]");
const positions = document.querySelectorAll("[data-pos]");

/** @param {number} seconds */
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function paint() {
  const seconds = Number(scrub.value);
  const progress = `${(seconds / Number(scrub.max)) * 100}%`;
  scrub.style.setProperty("--p", progress);
  // Announced as a time, not as "70": the number alone means nothing to a screen reader's user.
  scrub.setAttribute("aria-valuetext", clock(seconds));
  for (const screen of screens) screen.style.setProperty("--p", progress);
  for (const position of positions) position.textContent = clock(seconds);
}

if (scrub) {
  scrub.addEventListener("input", paint);
  paint();
  document.querySelector("[data-scrub-label]").hidden = false;
}
