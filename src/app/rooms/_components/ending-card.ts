/**
 * "Download image" for the ending screen.
 *
 * Builds a share card out of the sprites already on the page rather than
 * redrawing them: the portraits in the DOM are SVG, so they can be cloned
 * straight into a new document, which guarantees the picture matches what the
 * room actually saw and keeps the parts catalog out of the client bundle.
 *
 * Rasterised through a canvas so the file people get is a PNG — the thing a
 * chat window will show inline, rather than an SVG it offers to download again.
 */

const WIDTH = 1200;
const HEIGHT = 630;

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type EndingCard = {
  storyTitle: string;
  endingTitle: string;
  /** In seat order, matching the sprites handed in. */
  names: string[];
  awards: { title: string; who: string }[];
};

/**
 * Compose the card. `sprites` are the live `<svg>` portraits, in the same
 * order as `names`.
 */
function buildSvg(card: EndingCard, sprites: SVGSVGElement[]): string {
  const size = 150;
  const gap = 28;
  const total = sprites.length * size + (sprites.length - 1) * gap;
  const left = (WIDTH - total) / 2;

  const cast = sprites
    .map((sprite, i) => {
      const clone = sprite.cloneNode(true) as SVGSVGElement;
      clone.removeAttribute("style");
      clone.setAttribute("width", String(size));
      clone.setAttribute("height", String(size));
      clone.setAttribute("x", String(left + i * (size + gap)));
      clone.setAttribute("y", "250");
      const name = `<text x="${left + i * (size + gap) + size / 2}" y="440" fill="#e8e8ea"
        font-family="sans-serif" font-size="22" text-anchor="middle">${escapeXml(card.names[i] ?? "")}</text>`;
      return clone.outerHTML + name;
    })
    .join("");

  const awards = card.awards
    .slice(0, 4)
    .map(
      (award, i) =>
        `<text x="${WIDTH / 2}" y="${absoluteAwardY(i)}" fill="#a8a8b0" font-family="sans-serif"
          font-size="20" text-anchor="middle">${escapeXml(`${award.title}: ${award.who}`)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#101014"/>
    <text x="${WIDTH / 2}" y="86" fill="#8a8a92" font-family="sans-serif" font-size="24"
      letter-spacing="6" text-anchor="middle">${escapeXml(card.storyTitle.toUpperCase())}</text>
    <text x="${WIDTH / 2}" y="168" fill="#f2f2f4" font-family="sans-serif" font-size="54"
      font-weight="bold" text-anchor="middle">${escapeXml(card.endingTitle)}</text>
    ${cast}
    ${awards}
  </svg>`;
}

const absoluteAwardY = (index: number) => 500 + index * 30;

/** Rasterise and hand the browser a file. */
export async function downloadEndingCard(
  card: EndingCard,
  sprites: SVGSVGElement[],
): Promise<void> {
  const svg = buildSvg(card, sprites);
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("could not render the card"));
    image.src = source;
  });

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(image, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("could not encode the card");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${card.storyTitle.toLowerCase().replace(/\W+/g, "-")}-ending.png`;
  link.click();
  URL.revokeObjectURL(url);
}
