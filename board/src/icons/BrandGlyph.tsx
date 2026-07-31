import { AGENT_ICON_DATA } from "./agent-icon-data.js";

/**
 * How one brand is drawn. Three honest sources, in order of preference:
 *  - `vector`: the vendor's own SVG path (simple-icons, or a path copied from
 *    the vendor's published mark).
 *  - `raster`: the vendor's own favicon, inlined as a data URI.
 *  - `letter`: no official mark is bundled for this product. A lettermark in
 *    the theme accent, never a stock robot or terminal glyph.
 */
export type Brand =
  | { kind: "vector"; path: string; hex: string; title: string }
  | { kind: "raster"; asset: keyof typeof AGENT_ICON_DATA | string; title: string }
  | { kind: "letter"; text: string; title: string };

/**
 * Every Swarm theme is dark. A brand whose mark is near-black (Cursor,
 * OpenCode, Kimi all publish a black glyph) would vanish, so it falls back to
 * the theme's own text colour. That is the vendor's own dark-mode treatment,
 * not us recolouring their brand.
 */
const MIN_LUMINANCE = 0.06;

export function brandColor(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < MIN_LUMINANCE ? "currentColor" : `#${hex.replace("#", "")}`;
}

interface Props {
  brand: Brand;
  size?: number;
  className?: string;
  /** Force the theme's colour instead of the brand's (menus, dim states). */
  mono?: boolean;
}

/** The lettermark box, shared by declared lettermarks and the raster fallback. */
function Letter({ text, size, className }: { text: string; size: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // Cap the glyph well inside the box: a 1px border plus a full-height
        // cap makes the letter kiss the frame at 12px and read as a smudge.
        fontSize: Math.round(size * 0.58),
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        borderRadius: Math.max(3, Math.round(size * 0.22)),
        border: "1px solid currentColor",
        opacity: 0.9,
      }}
    >
      {text}
    </span>
  );
}

export default function BrandGlyph({ brand, size = 14, className, mono }: Props) {
  if (brand.kind === "raster") {
    const src = AGENT_ICON_DATA[brand.asset];
    if (src) {
      return (
        <img
          src={src}
          width={size}
          height={size}
          alt=""
          aria-hidden
          className={className}
          style={{ objectFit: "contain", flexShrink: 0 }}
        />
      );
    }
    // Asset missing (a brand added to the catalogue before its favicon was
    // inlined). Falling through would hit the vector branch below and paint an
    // empty <svg> — a silent hole in the strip. Show its initial instead.
    return <Letter text={brand.title.slice(0, 1).toUpperCase()} size={size} className={className} />;
  }

  if (brand.kind === "letter") {
    return <Letter text={brand.text} size={size} className={className} />;
  }

  const vector = brand as Extract<Brand, { kind: "vector" }>;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill={mono ? "currentColor" : brandColor(vector.hex)}
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <path d={vector.path} />
    </svg>
  );
}
