import React, { useMemo } from 'react';

import type { FolderItem } from '../right-sidebar/data';
import { buildBubbleNodes, type BubbleNode } from '@/lib/mapData';

interface PositionedBubble extends BubbleNode {
  radius: number;
  x: number;
  y: number;
}

interface BubbleLayoutResult {
  bubbles: PositionedBubble[];
  width: number;
  height: number;
}

const MIN_RADIUS = 48;
const MAX_RADIUS = 160;
const BUBBLE_SPACING = 12;
const CONTAINER_PADDING = 48;

const colorPalette = [
  ['#60a5fa', '#2563eb'],
  ['#34d399', '#0f766e'],
  ['#fbbf24', '#d97706'],
  ['#f472b6', '#c026d3'],
  ['#a78bfa', '#6d28d9'],
  ['#f97316', '#b45309']
];

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;

const formatSize = (bytes: number): string => {
  if (bytes <= 0) {
    return '0 KB';
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted = size >= 10 ? Math.round(size) : Number(size.toFixed(1));
  return `${formatted} ${units[unitIndex]}`;
};

const computeRadiusScale = (data: BubbleNode[]): ((size: number) => number) => {
  const sizes = data.map(item => item.size).filter(size => size > 0);
  if (sizes.length === 0) {
    return () => MIN_RADIUS * 0.6;
  }

  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);

  if (minSize === maxSize) {
    return () => (MIN_RADIUS + MAX_RADIUS) / 2;
  }

  return (size: number) => {
    if (size <= 0) {
      return MIN_RADIUS * 0.6;
    }
    const normalized = (size - minSize) / (maxSize - minSize);
    return MIN_RADIUS + normalized * (MAX_RADIUS - MIN_RADIUS);
  };
};

const placeBubbles = (data: BubbleNode[]): BubbleLayoutResult => {
  const sorted = [...data].sort((a, b) => b.size - a.size);
  const scaleRadius = computeRadiusScale(sorted);
  const placed: PositionedBubble[] = [];

  sorted.forEach(item => {
    const radius = scaleRadius(item.size);

    if (placed.length === 0) {
      placed.push({
        ...item,
        radius,
        x: 0,
        y: 0,
      });
      return;
    }

    let angle = 0;
    let distance = radius + placed[0].radius + BUBBLE_SPACING;
    const angleStep = degToRad(15);
    const maxIterations = 1000;
    let iterations = 0;
    let positionFound = false;
    let x = 0;
    let y = 0;

    while (!positionFound && iterations < maxIterations) {
      x = Math.cos(angle) * distance;
      y = Math.sin(angle) * distance;

      const hasCollision = placed.some(other => {
        const dx = x - other.x;
        const dy = y - other.y;
        const distanceBetween = Math.sqrt(dx * dx + dy * dy);
        return distanceBetween < radius + other.radius + BUBBLE_SPACING;
      });

      if (!hasCollision) {
        positionFound = true;
        break;
      }

      angle += angleStep;
      iterations++;

      if (angle >= Math.PI * 2) {
        angle -= Math.PI * 2;
        distance += 12;
      }
    }

    if (!positionFound) {
      const fallbackAngle = (placed.length * angleStep) % (Math.PI * 2);
      distance += placed.length * 4;
      x = Math.cos(fallbackAngle) * distance;
      y = Math.sin(fallbackAngle) * distance;
    }

    placed.push({
      ...item,
      radius,
      x,
      y,
    });
  });

  if (placed.length === 0) {
    return { bubbles: [], width: 0, height: 0 };
  }

  const minX = Math.min(...placed.map(bubble => bubble.x - bubble.radius));
  const maxX = Math.max(...placed.map(bubble => bubble.x + bubble.radius));
  const minY = Math.min(...placed.map(bubble => bubble.y - bubble.radius));
  const maxY = Math.max(...placed.map(bubble => bubble.y + bubble.radius));

  const width = maxX - minX + CONTAINER_PADDING * 2;
  const height = maxY - minY + CONTAINER_PADDING * 2;

  const normalized = placed.map(bubble => ({
    ...bubble,
    x: bubble.x - minX + CONTAINER_PADDING,
    y: bubble.y - minY + CONTAINER_PADDING,
  }));

  return {
    bubbles: normalized,
    width,
    height,
  };
};

interface BubbleSizeMapProps {
  folders: FolderItem[];
}

export const BubbleSizeMap: React.FC<BubbleSizeMapProps> = ({ folders }) => {
  const layout = useMemo(() => {
    if (!folders || folders.length === 0) {
      return { bubbles: [], width: 0, height: 0 };
    }

    const selected = buildBubbleNodes(folders)
      .filter(item => item.size > 0 && item.depth > 0);

    return placeBubbles(selected);
  }, [folders]);

  if (!layout.bubbles.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        Select folders with storage data to generate the bubble map.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        className="relative"
        style={{ width: layout.width, height: layout.height }}
      >
        {layout.bubbles.map((bubble, index) => {
          const palette = colorPalette[index % colorPalette.length];
          const gradient = `radial-gradient(circle at 30% 30%, ${palette[0]} 0%, ${palette[1]} 100%)`;

          return (
            <div
              key={bubble.id}
              className="absolute rounded-full shadow-lg flex flex-col items-center justify-center text-center text-white"
              style={{
                width: bubble.radius * 2,
                height: bubble.radius * 2,
                left: bubble.x - bubble.radius,
                top: bubble.y - bubble.radius,
                background: gradient,
              }}
            >
              <div className="px-4">
                <div className="text-sm font-semibold leading-tight break-words">
                  {bubble.name}
                </div>
                <div className="text-xs text-white/80 mt-1">
                  {formatSize(bubble.size)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
