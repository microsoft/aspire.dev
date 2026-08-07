export interface FloatingIconLayoutItem<TIcon = string> {
  icon: TIcon;
  top: string;
  right: string;
  size: string;
  delay: string;
  duration: string;
}

interface FloatingIconLayoutOptions {
  minTop?: number;
  topRange?: number;
  minRight?: number;
  rightRange?: number;
  minDistance?: number;
  maxAttempts?: number;
  minSizeRem?: number;
  sizeRangeRem?: number;
  maxDelaySeconds?: number;
  minDurationSeconds?: number;
  durationRangeSeconds?: number;
}

interface NumericPosition {
  top: number;
  right: number;
}

const defaultOptions = {
  minTop: 5,
  topRange: 80,
  minRight: 3,
  rightRange: 85,
  minDistance: 22,
  maxAttempts: 50,
  minSizeRem: 1.5,
  sizeRangeRem: 0.825,
  maxDelaySeconds: 6,
  minDurationSeconds: 8.5,
  durationRangeSeconds: 6,
} satisfies Required<FloatingIconLayoutOptions>;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed: number): () => number {
  let current = seed | 0;
  return () => {
    current = (current + 0x6d2b79f5) | 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSpacedPosition(
  rand: () => number,
  placed: NumericPosition[],
  options: Required<FloatingIconLayoutOptions>
): NumericPosition {
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const top = Math.round(options.minTop + rand() * options.topRange);
    const right = Math.round(options.minRight + rand() * options.rightRange);
    const tooClose = placed.some(
      (position) => Math.hypot(position.top - top, position.right - right) < options.minDistance
    );

    if (!tooClose) {
      const nextPosition = { top, right };
      placed.push(nextPosition);
      return nextPosition;
    }
  }

  const fallbackPosition = {
    top: Math.round(options.minTop + rand() * options.topRange),
    right: Math.round(options.minRight + rand() * options.rightRange),
  };
  placed.push(fallbackPosition);
  return fallbackPosition;
}

export function buildFloatingIconLayout<TIcon>(
  seedText: string,
  icons: readonly TIcon[],
  options: FloatingIconLayoutOptions = {}
): FloatingIconLayoutItem<TIcon>[] {
  if (icons.length === 0) {
    return [];
  }

  const resolvedOptions = { ...defaultOptions, ...options };
  const rand = createSeededRandom(hashString(seedText));
  const placed: NumericPosition[] = [];

  return icons.map((icon) => {
    const position = generateSpacedPosition(rand, placed, resolvedOptions);
    return {
      icon,
      top: `${position.top}%`,
      right: `${position.right}%`,
      size: `${(resolvedOptions.minSizeRem + rand() * resolvedOptions.sizeRangeRem).toFixed(2)}rem`,
      delay: `${(rand() * resolvedOptions.maxDelaySeconds).toFixed(1)}s`,
      duration: `${(resolvedOptions.minDurationSeconds + rand() * resolvedOptions.durationRangeSeconds).toFixed(1)}s`,
    };
  });
}
