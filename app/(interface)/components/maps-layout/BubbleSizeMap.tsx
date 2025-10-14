import React, { useMemo } from 'react';

import type { FolderItem } from '../right-sidebar/data';
import { buildBubbleNodes, type BubbleNode } from '@/lib/mapData';

interface PositionedBubble extends BubbleNode {
  radius: number;
  x: number;
  y: number;
}

interface BubbleConnection {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface BubbleLayoutResult {
  bubbles: PositionedBubble[];
  connections: BubbleConnection[];
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

interface TreeBubble extends BubbleNode {
  radius: number;
  x: number;
  y: number;
  children: TreeBubble[];
}

const layoutBubbles = (data: BubbleNode[]): BubbleLayoutResult => {
  const visible = data.filter(item => item.size > 0 && item.depth > 0);

  if (visible.length === 0) {
    return { bubbles: [], connections: [], width: 0, height: 0 };
  }

  const scaleRadius = computeRadiusScale(visible);
  const nodeMap = new Map<string, TreeBubble>();

  visible.forEach(item => {
    nodeMap.set(item.id, {
      ...item,
      radius: scaleRadius(item.size),
      x: 0,
      y: 0,
      children: [],
    });
  });

  const roots: TreeBubble[] = [];

  nodeMap.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortBySizeDesc = (a: TreeBubble, b: TreeBubble) => b.size - a.size;
  roots.sort(sortBySizeDesc);
  nodeMap.forEach(node => node.children.sort(sortBySizeDesc));

  const depthSpacing = MAX_RADIUS * 1.5;
  const horizontalSpacing = MAX_RADIUS + BUBBLE_SPACING * 2;

  let currentX = CONTAINER_PADDING;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const assignPositions = (node: TreeBubble, depth: number, startX: number): number => {
    node.y = CONTAINER_PADDING + depth * depthSpacing + node.radius;

    if (node.children.length === 0) {
      node.x = startX + node.radius;

      minX = Math.min(minX, node.x - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      maxY = Math.max(maxY, node.y + node.radius);

      return node.x + node.radius + horizontalSpacing;
    }

    let childStart = startX;

    node.children.forEach(child => {
      childStart = assignPositions(child, depth + 1, childStart);
    });

    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    const childrenCenter = (firstChild.x + lastChild.x) / 2;

    node.x = childrenCenter;

    minX = Math.min(minX, node.x - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);

    return Math.max(childStart, node.x + node.radius + horizontalSpacing);
  };

  roots.forEach(root => {
    currentX = assignPositions(root, 0, currentX);
  });

  const shiftX = Number.isFinite(minX) ? CONTAINER_PADDING - minX : 0;

  nodeMap.forEach(node => {
    node.x += shiftX;
  });

  const bubbles: PositionedBubble[] = Array.from(nodeMap.values()).map(({ children, ...bubble }) => bubble);
  const positionedMap = new Map(bubbles.map(bubble => [bubble.id, bubble]));

  const connections: BubbleConnection[] = [];

  bubbles.forEach(bubble => {
    if (!bubble.parentId) {
      return;
    }

    const parent = positionedMap.get(bubble.parentId);
    if (!parent) {
      return;
    }

    connections.push({
      fromX: parent.x,
      fromY: parent.y + parent.radius - 8,
      toX: bubble.x,
      toY: bubble.y - bubble.radius + 8,
    });
  });

  const width = Number.isFinite(maxX)
    ? maxX - minX + CONTAINER_PADDING * 2
    : 0;
  const height = Number.isFinite(maxY)
    ? maxY + CONTAINER_PADDING
    : 0;

  return {
    bubbles,
    connections,
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

    const bubbleNodes = buildBubbleNodes(folders);
    return layoutBubbles(bubbleNodes);
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
        <svg
          className="absolute inset-0 pointer-events-none"
          width={layout.width}
          height={layout.height}
        >
          {layout.connections.map((connection, index) => (
            <line
              key={`connection-${index}`}
              x1={connection.fromX}
              y1={connection.fromY}
              x2={connection.toX}
              y2={connection.toY}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </svg>
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
