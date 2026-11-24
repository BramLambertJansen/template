// Contrast tussen twee oklch()-kleuren (WCAG 2.2), zoals in test/ui/contrast.test.ts: OKLCH → lineaire sRGB (Björn
// Ottosson), geknipt op het sRGB-bereik, dan de relatieve luminantie.
function linearRgb(oklch: string): [number, number, number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(oklch);
  if (match === null) throw new Error(`geen oklch(): ${oklch}`);
  const [l, c, h] = [Number(match[1]), Number(match[2]), (Number(match[3]) * Math.PI) / 180];
  const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3);
  const [L = 0, M = 0, S = 0] = lms;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

export function contrast(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = linearRgb(color);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}
