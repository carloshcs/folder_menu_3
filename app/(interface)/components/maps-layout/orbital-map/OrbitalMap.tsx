'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { buildHierarchy, getVisibleNodesAndLinks } from './dataUtils';
import { drag } from './renderUtils';
import { createSimulation } from './physics';
import { renderNodes } from './renderNodes';
import type { FolderItem } from '../../right-sidebar/data';

interface OrbitalMapProps {
  folders: FolderItem[];
  colorPaletteId?: string;
}

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders, colorPaletteId }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = size.width;
    const height = size.height;

    const root = buildHierarchy(folders);
    const { visibleNodes, visibleLinks } = getVisibleNodesAndLinks(root, expanded);

    svg
      .attr('viewBox', [-width / 2, -height / 2, width, height])
      .attr('style', 'width:100%; height:100%; background:none; display:block;')
      .on('dblclick.zoom', null);

    const g = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.4, 3]).on('zoom', e => g.attr('transform', e.transform)));

    const orbitRadiusStep = 220;
    const maxDepth = d3.max(visibleNodes, d => d.depth) || 1;

    const orbitGroup = g.append('g').attr('class', 'orbits');
    for (let depth = 1; depth <= maxDepth; depth++) {
      orbitGroup
        .append('circle')
        .attr('r', orbitRadiusStep * depth)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(180,180,180,0.08)')
        .attr('stroke-dasharray', '4,4');
    }

    const simulation = createSimulation(visibleNodes, visibleLinks, orbitRadiusStep);

    const link = g
      .append('g')
      .attr('stroke', 'rgba(200,200,200,0.25)')
      .attr('stroke-width', 1.2)
      .selectAll('line')
      .data(visibleLinks)
      .join('line');

    const node = renderNodes(svg, g, visibleNodes, colorPaletteId).call(drag(simulation) as any);

    node.on('dblclick', function (event, d) {
      event.stopPropagation();
      if (d.children && d.children.length > 0) {
        const newSet = new Set(expanded);
        if (newSet.has(d.data.name)) newSet.delete(d.data.name);
        else newSet.add(d.data.name);
        setExpanded(newSet);
      }
    });

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [folders, size, colorPaletteId, expanded]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef}></svg>
    </div>
  );
};
