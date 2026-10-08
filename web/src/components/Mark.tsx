const CROSSHAIR = [
  ".......##.......", ".......##.......", ".......##.......", ".....######.....",
  "....#..##..#....", "...#........#...", "...#........#...", "#####..##..#####",
  "#####..##..#####", "...#........#...", "...#........#...", "....#..##..#....",
  ".....######.....", ".......##.......", ".......##.......", ".......##.......",
];

const rects = CROSSHAIR.flatMap((row, y) => {
  const out: { x: number; y: number; w: number; accent: boolean }[] = [];
  for (let x = 0; x < 16; ) {
    if (row[x] !== "#") { x++; continue; }
    const s = x;
    while (x < 16 && row[x] === "#") x++;
    out.push({ x: s, y, w: x - s, accent: (y === 7 || y === 8) && s >= 7 && x <= 9 });
  }
  return out;
});

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.accent ? "var(--accent)" : "currentColor"} />
      ))}
    </svg>
  );
}
