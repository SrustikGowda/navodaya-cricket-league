import { monogram } from "@/lib/draw/view";

/** Team logo when one was uploaded, otherwise a monogram. Decorative: the name is always written next to it. */
export function TeamMark({ name, logoUrl, size = 28 }: { name: string; logoUrl?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (logoUrl) {
    return <img className="dr-mark dr-mark--img" src={logoUrl} alt="" width={size} height={size} style={style} loading="lazy" decoding="async" />;
  }
  return (
    <span className="dr-mark" style={style} aria-hidden="true">
      {monogram(name)}
    </span>
  );
}
