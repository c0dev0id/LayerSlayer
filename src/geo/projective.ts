/** A plane-to-plane mapping: projective for four or more point pairs, affine for three. */
export type Transform = (point: readonly [number, number]) => [number, number];

/**
 * Fits the transform taking each `from` point to its `to` point, by least squares where
 * there are more pairs than needed. The targets are centred and scaled first, since map
 * coordinates in metres would otherwise drown the unit-square sources in the solve.
 */
export function fitTransform(from: readonly (readonly [number, number])[], to: readonly (readonly [number, number])[]): Transform {
  if (from.length !== to.length || from.length < 3) throw new Error('At least three point pairs are needed.');
  const cx = to.reduce((s, p) => s + p[0], 0) / to.length;
  const cy = to.reduce((s, p) => s + p[1], 0) / to.length;
  const scale = Math.max(...to.map((p) => Math.max(Math.abs(p[0] - cx), Math.abs(p[1] - cy)))) || 1;
  const target = to.map((p) => [(p[0] - cx) / scale, (p[1] - cy) / scale] as const);
  const projective = from.length >= 4;
  const rows: number[][] = [];
  const values: number[] = [];
  from.forEach(([u, v], i) => {
    const [x, y] = target[i]!;
    rows.push(projective ? [u, v, 1, 0, 0, 0, -u * x, -v * x] : [u, v, 1, 0, 0, 0]);
    values.push(x);
    rows.push(projective ? [0, 0, 0, u, v, 1, -u * y, -v * y] : [0, 0, 0, u, v, 1]);
    values.push(y);
  });
  const h = leastSquares(rows, values);
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, k = 0] = h;
  return ([u, v]) => {
    const w = g * u + k * v + 1;
    return [((a * u + b * v + c) / w) * scale + cx, ((d * u + e * v + f) / w) * scale + cy];
  };
}

/** Solves the normal equations of an overdetermined system by Gaussian elimination. */
function leastSquares(rows: number[][], values: number[]): number[] {
  const n = rows[0]!.length;
  const m = Array.from({ length: n }, (_, i) => {
    const row = Array.from({ length: n }, (_, j) => rows.reduce((s, r) => s + r[i]! * r[j]!, 0));
    row.push(rows.reduce((s, r, k) => s + r[i]! * values[k]!, 0));
    return row;
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) throw new Error('The points do not span a plane.');
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= factor * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}
