'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { buildHierarchy, getVisibleNodesAndLinks } from './dataUtils';
import { drag } from './renderUtils';
import { createSimulation } from './physics';
import { renderNodes } from './renderNodes';
import type { FolderItem } from '../../right-sidebar/data';

type D3GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

interface OrbitalMapProps {
  folders: FolderItem[];
}

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const gRef = useRef<D3GroupSelection | null>(null);
  const linkLayerRef = useRef<D3GroupSelection | null>(null);
  const nodeLayerRef = useRef<D3GroupSelection | null>(null);
  const simulationRef = useRef<d3.Simulation<any, undefined> | null>(null);

  // Resize
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

  // Base SVG setup
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('class', 'orbital-root');
    gRef.current = g;

    linkLayerRef.current = g.append('g').attr('class', 'link-layer');
    nodeLayerRef.current = g.append('g').attr('class', 'node-layer');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .on('zoom', event => g.attr('transform', event.transform));

    svg.call(zoom as any);
    svg.on('dblclick.zoom', null);
  }, []);

  // Main render
  useEffect(() => {
    if (!svgRef.current || !gRef.current || !nodeLayerRef.current || !linkLayerRef.current) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = size;

    // Build hierarchy and visible nodes/links
    const root = buildHierarchy(folders);
    const { visibleNodes, visibleLinks } = getVisibleNodesAndLinks(root, expanded);

    // Setup SVG viewbox
    svg
      .attr('viewBox', [-width / 2, -height / 2, width, height])
      .attr('width', width)
      .attr('height', height)
      .style('background', 'none');

    const linkLayer = linkLayerRef.current!;
    const nodeLayer = nodeLayerRef.current!;

    // Draw links
    const link = linkLayer
      .selectAll<SVGLineElement, any>('line')
      .data(visibleLinks, d => `${d.source.data.name}-${d.target.data.name}`)
      .join(
        enter => enter.append('line').attr('stroke', '#aaa').attr('stroke-width', 1.2),
        update => update,
        exit => exit.remove(),
      );

    // Stop old simulation
    if (simulationRef.current) simulationRef.current.stop();

    // Start simulation
    const simulation = createSimulation(visibleNodes, visibleLinks);
    simulationRef.current = simulation;

    // Render nodes
    const node = renderNodes(svg, nodeLayer, visibleNodes).call(drag(simulation) as any);

    // Expand/collapse
    node.on('dblclick', (event, d) => {
      event.stopPropagation();
      const name = d.data?.name;
      if (!name) return;
      setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    });

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    simulation.alpha(1).restart();

    return () => simulation.stop();
  }, [folders, size, expanded]);

  return (
    <div ref={containerRef} className="relative z-10 w-full h-full">
      <svg ref={svgRef}></svg>
    </div>
  );
};
