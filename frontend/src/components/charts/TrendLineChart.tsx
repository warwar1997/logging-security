export default function TrendLineChart({
  points,
  height = 120,
  color = "#4f46e5",
}: {
  points: number[];
  height?: number;
  color?: string;
}) {
  const width = 600;
  const max = Math.max(...points, 1);
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const y = (v: number) => height - (v / max) * height;
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${y(v)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      {points.map((v, i) => (
        <circle key={i} cx={i * stepX} cy={y(v)} r={2} fill={color} />
      ))}
    </svg>
  );
}
