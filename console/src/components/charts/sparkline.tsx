/*
 * Dependency-free sparkline: small enough that pulling Recharts into every
 * route (e.g. the promote dialog) isn't worth it.
 */
export function Sparkline({
  points,
  width = 160,
  height = 36,
  stroke = "var(--warning)",
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const stepX = width / Math.max(points.length - 1, 1);
  const path = points
    .map((value, i) => {
      const x = i * stepX;
      const y = height - 3 - (value / max) * (height - 6);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} role="img" aria-label="trend sparkline">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}
