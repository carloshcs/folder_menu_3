'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { buildHierarchy, getVisibleNodesAndLinks } from './dataUtils';
import { drag } from './renderUtils';
import { createSimulation, getNodeId, OrbitLayout, OrbitLayoutInfo } from './physics';
import { renderNodes } from './renderNodes';
import type { FolderItem } from '../../right-sidebar/data';

interface OrbitalMapProps {
  folders: FolderItem[];
  colorPaletteId?: string;
}

interface OrbitRing {
  id: string;
  node: any;
}

const BASE_ORBIT_RADIUS = 160;
const LEVEL_SPACING = 120;
const DENSITY_PADDING = 26;
const MAX_DENSITY_PADDING = 180;
const EXPANSION_MULTIPLIER = 1.18;
const ANGLE_OFFSET = -Math.PI / 2;

type D3GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

const computeOrbitLayout = (nodes: any[], expanded: Set<string>) => {
  const layout: OrbitLayout = new Map<string, OrbitLayoutInfo>();
  const rings: OrbitRing[] = [];

  const getId = (node: any) => node.data?.name ?? node.id;

  const assignPositions = (node: any, x: number, y: number) => {
    const nodeId = getId(node);
    const existing = layout.get(nodeId);
    layout.set(nodeId, {
      targetX: x,
      targetY: y,
      orbitRadius: existing?.orbitRadius ?? (node.parent ? layout.get(getId(node.parent))?.childOrbitRadius ?? 0 : 0),
      angle: existing?.angle,
      childOrbitRadius: existing?.childOrbitRadius,
    });

    const children = nodes.filter(n => n.parent === node);
    if (!children.length) return;

    const depth = node.depth || 0;
    const childCount = children.length;
    const baseRadius = BASE_ORBIT_RADIUS + depth * LEVEL_SPACING;
    const densityBoost = Math.min(MAX_DENSITY_PADDING, Math.max(0, childCount - 1) * DENSITY_PADDING);
    let orbitRadius = baseRadius + densityBoost;
    if (expanded.has(nodeId) || depth === 0) {
      orbitRadius *= EXPANSION_MULTIPLIER;
    }

    rings.push({ id: nodeId, node });

    const angleStep = (2 * Math.PI) / childCount;
    children.forEach((child, index) => {
      const angle = ANGLE_OFFSET + index * angleStep;
      const childId = getId(child);
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
  const simulationRef = useRef<d3.Simulation<any, undefined> | null>(null);

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
    if (
      !svgRef.current ||
      !gRef.current ||
      !orbitLayerRef.current ||
      !linkLayerRef.current ||
      !nodeLayerRef.current
    ) {
      return;
    }

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    const width = size.width;
    const height = size.height;

    svg
      .attr('viewBox', [-width / 2, -height / 2, width, height])
      .attr('width', width)
      .attr('height', height)
      .style('max-width', '100%')
      .style('height', '100%')
      .style('background', 'none')
      .style('overflow', 'visible');

    const root = buildHierarchy(folders);
    const { visibleNodes, visibleLinks } = getVisibleNodesAndLinks(root, expanded);

    const { layout: orbitLayout, rings } = computeOrbitLayout(visibleNodes, expanded);

    const orbitSelection = orbitLayerRef.current
      .selectAll<SVGCircleElement, OrbitRing>('circle.orbit-ring')
      .data(rings, d => d.id)
      .join(
        enter =>
          enter
            .append('circle')
            .attr('class', 'orbit-ring')
            .attr('fill', 'none')
            .attr('stroke', 'rgba(180,180,180,0.18)')
            .attr('stroke-dasharray', '6,6')
            .attr('stroke-width', 1.4)
            .attr('opacity', 0)
            .attr('r', 0)
            .call(sel =>
              sel
                .transition()
                .duration(260)
                .attr('opacity', 1),
            ),
        update => update,
        exit =>
          exit.call(sel =>
            sel
              .transition()
              .duration(200)
              .attr('opacity', 0)
              .attr('r', 0)
              .remove(),
          ),
      )
      .attr('cx', d => ((d.node as any).x as number) ?? 0)
      .attr('cy', d => ((d.node as any).y as number) ?? 0);

    orbitSelection
      .transition()
      .duration(280)
      .attr('r', d => orbitLayout.get(d.id)?.childOrbitRadius ?? 0);

    const linkSelection = linkLayerRef.current
      .selectAll<SVGLineElement, any>('line.orbit-link')
      .data(visibleLinks, d => `${getNodeId(d.source)}-${getNodeId(d.target)}`)
      .join(
        enter =>
          enter
            .append('line')
            .attr('class', 'orbit-link')
            .attr('stroke', 'rgba(200,200,200,0.25)')
            .attr('stroke-width', 1.2)
            .attr('opacity', 0)
            .call(sel =>
              sel
                .transition()
                .duration(200)
                .attr('opacity', 1),
            ),
        update => update.attr('stroke', 'rgba(200,200,200,0.25)').attr('stroke-width', 1.2),
        exit =>
          exit.call(sel =>
            sel
              .transition()
              .duration(160)
              .attr('opacity', 0)
              .remove(),
          ),
      );

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const simulation = createSimulation(visibleNodes, visibleLinks, orbitLayout);
    simulationRef.current = simulation;

    const nodeSelection = renderNodes(svg, nodeLayerRef.current, visibleNodes, colorPaletteId)
      .on('dblclick', (event: any, d: any) => {
        event.stopPropagation();
        event.preventDefault();
        if (d.children && d.children.length > 0) {
          setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(d.data.name)) {
              next.delete(d.data.name);
            } else {
              next.add(d.data.name);
            }
            return next;
          });
        }
      })
      .call(drag(simulation) as any);

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', d => ((d.source as any).x as number) ?? 0)
        .attr('y1', d => ((d.source as any).y as number) ?? 0)
        .attr('x2', d => ((d.target as any).x as number) ?? 0)
        .attr('y2', d => ((d.target as any).y as number) ?? 0);

      nodeSelection.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      orbitSelection
        .attr('cx', d => ((d.node as any).x as number) ?? 0)
        .attr('cy', d => ((d.node as any).y as number) ?? 0);
    });

    simulation.alpha(1).restart();

    return () => {
      simulation.stop();
    };
  }, [folders, size, colorPaletteId, expanded]);

  return (
    <div ref={containerRef} className="relative z-10 w-full h-full">
      <svg ref={svgRef}></svg>
    </div>
  );
};
