export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const chamferPoints = (x: number, y: number, w: number, h: number, r: number): number[] => {
  const c = Math.min(r, w / 2, h / 2);
  return [
    x + c, y,
    x + w - c * 0.55, y,
    x + w, y + c * 0.55,
    x + w, y + h - c,
    x + w - c, y + h,
    x + c * 0.55, y + h,
    x, y + h - c * 0.55,
    x, y + c
  ];
};

export const fitText = (value: string, max: number): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(3, max - 3))}...`;
};
