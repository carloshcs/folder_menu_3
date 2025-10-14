export const DEFAULT_MAP_PALETTE = 'blue';

export const MAP_COLOR_PALETTES: Record<string, string[]> = {
  blue: ['#1d4ed8', '#2563eb', '#60a5fa', '#0ea5e9', '#312e81', '#1e40af', '#38bdf8', '#6366f1'],
  magenta: ['#c026d3', '#db2777', '#f472b6', '#f43f5e', '#a21caf', '#f97316', '#ec4899', '#fb7185'],
  grayscale: ['#0f172a', '#1f2937', '#334155', '#475569', '#64748b', '#94a3b8', '#e2e8f0', '#cbd5f5'],
  minimal: ['#0f172a', '#1e293b', '#334155', '#64748b', '#94a3b8', '#cbd5f5', '#e2e8f0', '#f1f5f9'],
  teal: ['#0f766e', '#115e59', '#14b8a6', '#0ea5e9', '#2dd4bf', '#5eead4', '#134e4a', '#0f172a'],
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

const hexToRgb = (hex: string): RGBColor | null => {
  const normalized = hex.trim().replace(/^#/, '').toLowerCase();

  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }
    return { r, g, b };
  }

  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }
    return { r, g, b };
  }

  return null;
};

const rgbStringToRgb = (value: string): RGBColor | null => {
  const match = value
    .trim()
    .match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([01]?\.\d+|1))?\)$/i);

  if (!match) {
    return null;
  }

  const [, rRaw, gRaw, bRaw] = match;
  const r = Number(rRaw);
  const g = Number(gRaw);
  const b = Number(bRaw);

  if ([r, g, b].some(channel => Number.isNaN(channel))) {
    return null;
  }

  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
  };
};

const parseColor = (value: string): RGBColor | null =>
  hexToRgb(value) ?? rgbStringToRgb(value);

const toRgbString = ({ r, g, b }: RGBColor): string =>
  `rgb(${clamp(Math.round(r), 0, 255)}, ${clamp(Math.round(g), 0, 255)}, ${clamp(Math.round(b), 0, 255)})`;

const mixChannel = (channel: number, target: number, ratio: number) =>
  channel + (target - channel) * ratio;

const mixColor = (color: RGBColor, amount: number, targetChannel: number): RGBColor => {
  const ratio = clamp(Math.abs(amount), 0, 1);
  const destination = clamp(targetChannel, 0, 255);

  return {
    r: mixChannel(color.r, destination, ratio),
    g: mixChannel(color.g, destination, ratio),
    b: mixChannel(color.b, destination, ratio),
  };
};

export const shiftColor = (value: string, amount: number): string => {
  if (amount === 0) {
    return value;
  }

  const parsed = parseColor(value);
  if (!parsed) {
    return value;
  }

  const target = amount > 0 ? 255 : 0;
  return toRgbString(mixColor(parsed, amount, target));
};

export const getPaletteColors = (paletteId?: string | null): string[] => {
  if (!paletteId) {
    return MAP_COLOR_PALETTES[DEFAULT_MAP_PALETTE];
  }

  return MAP_COLOR_PALETTES[paletteId] ?? MAP_COLOR_PALETTES[DEFAULT_MAP_PALETTE];
};

export const getPaletteColor = (paletteId: string | null | undefined, index: number): string => {
  const colors = getPaletteColors(paletteId);
  if (!colors.length) {
    return '#475569';
  }

  return colors[((index % colors.length) + colors.length) % colors.length];
};

export const getReadableTextColor = (color: string): string => {
  const parsed = parseColor(color);
  if (!parsed) {
    return '#f8fafc';
  }

  const brightness = (parsed.r * 299 + parsed.g * 587 + parsed.b * 114) / 1000;
  return brightness > 160 ? '#0f172a' : '#f8fafc';
};
