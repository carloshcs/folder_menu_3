'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { buildHierarchy, getVisibleNodesAndLinks } from './dataUtils';
import { renderNodes } from './renderNodes';
import type { FolderItem } from '../../right-sidebar/data';
import { handleNodeDoubleClick } from '@/app/(interface)/lib/mapUtils/interactions';

type D3GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

interface OrbitalMapProps {
  folders: FolderItem[];
  colorPaletteId?: string;
}

interface OrbitRing {
  id: string;
  node: any;
}

const BASE_ORBIT_RADIUS = 150;
const LEVEL_SPACING = 110;
const EXPANSION_MULTIPLIER = 1.18;
const ANGLE_OFFSET = -Math.PI / 2;

const getNodeKey = (node: any) =>
  node.data?.path ?? node.data?.id ?? node.data?.name ?? node.id;

interface OrbitLayoutInfo {
  targetX: number;
  targetY: number;
  orbitRadius: number;
  angle?: number;
  childOrbitRadius?: number;
}

type OrbitLayout = Map<string, OrbitLayoutInfo>;

const computeOrbitLayout = (nodes: any[], expanded: Set<string>) => {
  const layout: OrbitLayout = new Map<string, OrbitLayoutInfo>();
  const rings: OrbitRing[] = [];

  const assignPositions = (node: any, x: number, y: number) => {
    const nodeId = getNodeKey(node);
    const existing = layout.get(nodeId);
    layout.set(nodeId, {
      targetX: x,
      targetY: y,
      orbitRadius:
        existing?.orbitRadius ??
        (node.parent ? layout.get(getNodeKey(node.parent))?.childOrbitRadius ?? 0 : 0),
      angle: existing?.angle,
      childOrbitRadius: existing?.childOrbitRadius,
    });

    const children = nodes.filter(n => n.parent === node);
    if (!children.length) return;

    const depth = node.depth || 0;
    const childCount = children.length;
    let orbitRadius = BASE_ORBIT_RADIUS + depth * LEVEL_SPACING;
    if (expanded.has(nodeId) || depth === 0) {
      orbitRadius *= EXPANSION_MULTIPLIER;
    }
    orbitRadius += Math.min(90, childCount * 14);

    rings.push({ id: nodeId, node });

    const angleStep = (2 * Math.PI) / childCount;
    children.forEach((child, index) => {
      const angle = ANGLE_OFFSET + index * angleStep;
      const childId = getNodeKey(child);
      const childX = x + Math.cos(angle) * orbitRadius;
      const childY = y + Math.sin(angle) * orbitRadius;

      layout.set(childId, {
        targetX: childX,
        targetY: childY,
        orbitRadius,
        angle,
      });

      assignPositions(child, childX, childY);
    });

    const nodeLayout = layout.get(nodeId);
    if (nodeLayout) {
      nodeLayout.childOrbitRadius = orbitRadius;
    }
  };

  const root = nodes.find(n => !n.parent);
  if (root) {
    assignPositions(root, 0, 0);
  }

  return { layout, rings };
};

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders, colorPaletteId }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const gRef = useRef<D3GroupSelection | null>(null);
  const orbitLayerRef = useRef<D3GroupSelection | null>(null);
  const linkLayerRef = useRef<D3GroupSelection | null>(null);
  const nodeLayerRef = useRef<D3GroupSelection | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const layoutRef = useRef<OrbitLayout>(new Map());

  // Resize observer
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({
          width: Math.max(800, width),
          height: Math.max(600, height),
        });
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('class', 'orbital-root');
    gRef.current = g;
    orbitLayerRef.current = g.append('g').attr('class', 'orbit-layer');
    linkLayerRef.current = g.append('g').attr('class', 'link-layer');
    nodeLayerRef.current = g.append('g').attr('class', 'node-layer');

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .filter(event => {
        if (event.type === 'dblclick') return false;
        if (event.type === 'mousedown' && event.button !== 0) return false;
        if (event.type === 'wheel' && event.ctrlKey) return false;
        return true;
      })
      .on('zoom', event => {
        g.attr('transform', event.transform);
      });

    svg.call(zoomBehavior as any);
    svg.on('dblclick.zoom', null);

    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current || !gRef.current || !orbitLayerRef.current || !linkLayerRef.current || !nodeLayerRef.current) {
      return;
    }

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    const width = size.width;
    const height = size.height;

    const root = buildHierarchy(folders);
    const { visibleNodes, visibleLinks } = getVisibleNodesAndLinks(root, expanded);

    const { layout: orbitLayout, rings } = computeOrbitLayout(visibleNodes, expanded);

    const previousPositions = positionsRef.current;
    const nextPositions = new Map<string, { x: number; y: number }>();
    const previousLayout = layoutRef.current;

    visibleNodes.forEach(node => {
      const nodeKey = getNodeKey(node);
      if (!nodeKey) return;
      const layoutInfo = orbitLayout.get(nodeKey);
      if (!layoutInfo) return;

      const previousPosition = previousPositions.get(nodeKey);
      let startX = previousPosition?.x;
      let startY = previousPosition?.y;

      if (startX === undefined || startY === undefined) {
        const parent = node.parent;
        if (parent) {
          const parentKey = getNodeKey(parent);
          const parentPrev = parentKey ? previousPositions.get(parentKey) : undefined;
          const parentLayout = parentKey ? orbitLayout.get(parentKey) : undefined;
          startX = parentPrev?.x ?? parentLayout?.targetX ?? layoutInfo.targetX;
          startY = parentPrev?.y ?? parentLayout?.targetY ?? layoutInfo.targetY;
        } else {
          startX = layoutInfo.targetX;
          startY = layoutInfo.targetY;
        }
      }

      node.x = startX;
      node.y = startY;
      (node as any).targetX = layoutInfo.targetX;
      (node as any).targetY = layoutInfo.targetY;

      nextPositions.set(nodeKey, { x: layoutInfo.targetX, y: layoutInfo.targetY });
    });

    positionsRef.current = nextPositions;

    svg
      .attr('viewBox', [-width / 2, -height / 2, width, height])
      .attr('width', width)
      .attr('height', height)
      .style('max-width', '100%')
      .style('height', '100%')
      .style('background', 'none')
      .style('overflow', 'visible')
      .on('dblclick.zoom', null);

    const orbitLayer = orbitLayerRef.current!;
    const linkLayer = linkLayerRef.current!;
    const nodeLayer = nodeLayerRef.current!;

    const orbit = orbitLayer
      .selectAll<SVGCircleElement, OrbitRing>('circle')
      .data(rings, d => d.id)
      .join(
        enter =>
          enter
            .append('circle')
            .attr('fill', 'none')
            .attr('stroke', 'rgba(180,180,180,0.18)')
            .attr('stroke-dasharray', '6,6')
            .attr('stroke-width', 1.4)
            .attr('opacity', 0)
            .call(sel =>
              sel
                .transition()
                .duration(300)
                .attr('opacity', 1),
            ),
        update => update,
        exit =>
          exit.call(sel =>
            sel
              .transition()
              .duration(200)
              .attr('opacity', 0)
              .remove(),
          ),
      )
      .attr('cx', d => ((d.node as any).x as number) ?? 0)
      .attr('cy', d => ((d.node as any).y as number) ?? 0)
      .attr(
        'r',
        d => previousLayout.get(d.id)?.childOrbitRadius ?? orbitLayout.get(d.id)?.childOrbitRadius ?? 0,
      );

    const link = linkLayer
      .selectAll<SVGLineElement, any>('line')
      .data(visibleLinks, d => `${getNodeKey(d.source)}-${getNodeKey(d.target)}`)
      .join(
        enter =>
          enter
            .append('line')
            .attr('stroke', 'rgba(200,200,200,0.25)')
            .attr('stroke-width', 1.2),
        update => update,
        exit =>
          exit.call(sel =>
            sel
              .transition()
              .duration(200)
              .style('opacity', 0)
              .remove(),
          ),
      )
      .attr('x1', d => ((d.source as any).x as number) ?? 0)
      .attr('y1', d => ((d.source as any).y as number) ?? 0)
      .attr('x2', d => ((d.target as any).x as number) ?? 0)
      .attr('y2', d => ((d.target as any).y as number) ?? 0);

    const node = renderNodes(svg, nodeLayer, visibleNodes, colorPaletteId);

    node.on('dblclick', function (event, d) {
      event.preventDefault();
      event.stopPropagation();
      const hasChildren = (d.children && d.children.length > 0) || (d.data?.children && d.data.children.length > 0);
      if (!hasChildren) {
        return;
      }

      handleNodeDoubleClick(d, setExpanded);
    });

    const transition = svg.transition().duration(450).ease(d3.easeCubicInOut);

    node
      .transition(transition)
      .attr('transform', d => `translate(${(d as any).targetX ?? d.x ?? 0},${(d as any).targetY ?? d.y ?? 0})`)
      .on('end', function (_, d) {
        d.x = (d as any).targetX;
        d.y = (d as any).targetY;
      });

    link
      .transition(transition)
      .attr('x1', d => ((d.source as any).targetX as number) ?? ((d.source as any).x as number) ?? 0)
      .attr('y1', d => ((d.source as any).targetY as number) ?? ((d.source as any).y as number) ?? 0)
      .attr('x2', d => ((d.target as any).targetX as number) ?? ((d.target as any).x as number) ?? 0)
      .attr('y2', d => ((d.target as any).targetY as number) ?? ((d.target as any).y as number) ?? 0);

    orbit
      .transition(transition)
      .attr('cx', d => ((d.node as any).targetX as number) ?? ((d.node as any).x as number) ?? 0)
      .attr('cy', d => ((d.node as any).targetY as number) ?? ((d.node as any).y as number) ?? 0)
      .attr('r', d => orbitLayout.get(d.id)?.childOrbitRadius ?? 0);

    layoutRef.current = orbitLayout;
  }, [folders, size, colorPaletteId, expanded]);

  return (
    <div ref={containerRef} className="relative z-10 w-full h-full">
      <svg ref={svgRef}></svg>
    </div>
  );
};
