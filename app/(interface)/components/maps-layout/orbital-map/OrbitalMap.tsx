import React, { useEffect, useMemo, useRef, useState } from 'react';
import { select, type Selection } from 'd3-selection';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
} from 'd3-force';
import { scaleSqrt } from 'd3-scale';

import type { FolderItem } from '../../right-sidebar/data';
import {
  buildBubbleNodes,
  buildBubbleTree,
  type BubbleTree,
  type BubbleTreeNode,
} from '@/lib/mapData';
import { enableNodeDrag, handleNodeDoubleClick } from '@/app/(interface)/lib/mapUtils/interactions';

const ORBITAL_BASE_RADIUS = 80;
const ORBITAL_RADIUS_STEP = 120;
const NODE_MIN_RADIUS = 18;
const NODE_MAX_RADIUS = 52;

const colorPalette = [
  ['#60a5fa', '#2563eb'],
  ['#34d399', '#0f766e'],
  ['#fbbf24', '#d97706'],
  ['#f472b6', '#c026d3'],
  ['#a78bfa', '#6d28d9'],
  ['#f97316', '#b45309'],
];

interface OrbitalMapProps {
  folders: FolderItem[];
}

interface OrbitalSimulationNode extends BubbleTreeNode {
  orbitRadius: number;
  radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

type OrbitalLink = SimulationLinkDatum<OrbitalSimulationNode> & {
  source: string | OrbitalSimulationNode;
  target: string | OrbitalSimulationNode;
};

const computeVisibleGraph = (
  rootNode: BubbleTreeNode | null,
  expandedNodes: Set<string>,
): { nodes: OrbitalSimulationNode[]; links: OrbitalLink[] } => {
  if (!rootNode) {
    return { nodes: [], links: [] };
  }

  const nodes: OrbitalSimulationNode[] = [];
  const links: OrbitalLink[] = [];

  const traverse = (node: BubbleTreeNode, depth: number, parent: BubbleTreeNode | null) => {
    const orbitRadius = ORBITAL_BASE_RADIUS + depth * ORBITAL_RADIUS_STEP;
    const simulationNode: OrbitalSimulationNode = {
      ...node,
      orbitRadius,
      radius: NODE_MIN_RADIUS,
    };

    nodes.push(simulationNode);

    if (parent) {
      links.push({ source: parent.id, target: node.id });
    }

    if (!expandedNodes.has(node.id)) {
      return;
    }

    node.children.forEach(child => traverse(child, depth + 1, node));
  };

  traverse(rootNode, 0, null);

  return { nodes, links };
};

const findRootNode = (tree: BubbleTree): BubbleTreeNode | null => {
  if (!tree.roots.length) {
    return null;
  }

  const sorted = [...tree.roots].sort((first, second) => {
    if (first.depth !== second.depth) {
      return first.depth - second.depth;
    }

    return second.size - first.size;
  });

  return sorted[0];
};

const resolveCoordinate = (
  value: string | OrbitalSimulationNode,
  axis: 'x' | 'y',
  fallback: number,
  nodeLookup: Map<string, OrbitalSimulationNode>,
): number => {
  if (typeof value === 'object') {
    return (value[axis] ?? fallback) as number;
  }

  return nodeLookup.get(value)?.[axis] ?? fallback;
};

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const linkGroupRef = useRef<SVGGElement | null>(null);
  const nodeGroupRef = useRef<SVGGElement | null>(null);

  const [dimensions, setDimensions] = useState({ width: 960, height: 720 });

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;

      setDimensions(previous => {
        const nextWidth = Math.max(Math.round(width), 640);
        const nextHeight = Math.max(Math.round(height), 520);

        if (previous.width === nextWidth && previous.height === nextHeight) {
          return previous;
        }

        return { width: nextWidth, height: nextHeight };
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const bubbleNodes = useMemo(() => buildBubbleNodes(folders), [folders]);
  const bubbleTree = useMemo(() => buildBubbleTree(bubbleNodes), [bubbleNodes]);
  const rootNode = useMemo(() => findRootNode(bubbleTree), [bubbleTree]);
  const allNodeIds = useMemo(() => Array.from(bubbleTree.nodeMap.keys()), [bubbleTree]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set(allNodeIds));

  useEffect(() => {
    setExpandedNodes(new Set(allNodeIds));
  }, [allNodeIds]);

  const { nodes: visibleNodes, links: visibleLinks } = useMemo(
    () => computeVisibleGraph(rootNode, expandedNodes),
    [rootNode, expandedNodes],
  );

  useEffect(() => {
    const svgElement = svgRef.current;
    const nodeGroupElement = nodeGroupRef.current;
    const linkGroupElement = linkGroupRef.current;

    if (!svgElement || !nodeGroupElement || !linkGroupElement) {
      return;
    }

    const { width, height } = dimensions;

    if (!width || !height) {
      return;
    }

    const nodesData = visibleNodes.map(node => ({ ...node }));
    const linksData = visibleLinks.map(link => ({ ...link }));

    const svgSelection = select(svgElement);
    svgSelection
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const nodeGroup = select(nodeGroupElement);
    const linkGroup = select(linkGroupElement);

    if (nodesData.length === 0) {
      nodeGroup.selectAll('*').remove();
      linkGroup.selectAll('*').remove();
      return;
    }

    const sizeValues = nodesData.map(node => node.size).filter(size => size > 0);
    const minSize = sizeValues.length ? Math.min(...sizeValues) : 1;
    const maxSize = sizeValues.length ? Math.max(...sizeValues) : minSize;
    const radiusScale = scaleSqrt<number, number>()
      .domain([minSize, maxSize])
      .range([NODE_MIN_RADIUS, NODE_MAX_RADIUS]);

    nodesData.forEach(node => {
      node.radius = node.size > 0 ? radiusScale(node.size) : NODE_MIN_RADIUS;
    });

    if (nodesData.length) {
      nodesData[0].x = width / 2;
      nodesData[0].y = height / 2;
    }

    const nodeLookup = new Map(nodesData.map(node => [node.id, node] as const));

    const simulation = forceSimulation<OrbitalSimulationNode>(nodesData)
      .force(
        'link',
        forceLink<OrbitalSimulationNode, OrbitalLink>(linksData)
          .id(node => node.id)
          .distance(link => {
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const target = nodeLookup.get(targetId);
            const depth = target?.depth ?? 0;
            return ORBITAL_BASE_RADIUS + depth * (ORBITAL_RADIUS_STEP * 0.6);
          })
          .strength(0.7),
      )
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'radial',
        forceRadial<OrbitalSimulationNode>(node => node.orbitRadius, width / 2, height / 2).strength(0.95),
      )
      .force('collision', forceCollide<OrbitalSimulationNode>().radius(node => node.radius + 10).strength(0.9))
      .velocityDecay(0.35);

    simulation.alpha(1).alphaDecay(0.06);

    const linkKey = (link: OrbitalLink) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return `${sourceId}-${targetId}`;
    };

    const linkSelection = linkGroup
      .selectAll<SVGLineElement, OrbitalLink>('line.orbital-link')
      .data(linksData, linkKey);

    linkSelection.exit().remove();

    const linkEnter = linkSelection
      .enter()
      .append('line')
      .attr('class', 'orbital-link')
      .attr('stroke', 'rgba(148, 163, 184, 0.55)')
      .attr('stroke-width', 1.4)
      .attr('stroke-linecap', 'round');

    const mergedLinks = linkEnter.merge(linkSelection as Selection<SVGLineElement, OrbitalLink, SVGGElement, unknown>);

    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, OrbitalSimulationNode>('g.orbital-node')
      .data(nodesData, node => node.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'orbital-node cursor-pointer');

    nodeEnter
      .append('circle')
      .attr('stroke-width', 2)
      .attr('fill-opacity', 0.92)
      .attr('stroke-opacity', 0.9);

    nodeEnter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', 500)
      .attr('fill', '#e2e8f0')
      .attr('opacity', 0.95);

    const mergedNodes = nodeEnter.merge(nodeSelection as Selection<SVGGElement, OrbitalSimulationNode, SVGGElement, unknown>);

    mergedNodes.select('circle').each(function (node) {
      const palette = colorPalette[node.depth % colorPalette.length];
      select(this)
        .attr('r', node.radius)
        .attr('fill', palette[0])
        .attr('stroke', palette[1]);
    });

    mergedNodes
      .select('text')
      .text(node => node.name)
      .attr('dy', node => node.radius + 16);

    mergedNodes.on('dblclick', (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      handleNodeDoubleClick(node, setExpandedNodes);
    });

    enableNodeDrag(simulation, mergedNodes);

    simulation.on('tick', () => {
      mergedNodes.attr('transform', node => `translate(${node.x ?? width / 2}, ${node.y ?? height / 2})`);

      mergedNodes
        .select('text')
        .attr('dy', node => node.radius + 16);

      mergedLinks
        .attr('x1', link => resolveCoordinate(link.source, 'x', width / 2, nodeLookup))
        .attr('y1', link => resolveCoordinate(link.source, 'y', height / 2, nodeLookup))
        .attr('x2', link => resolveCoordinate(link.target, 'x', width / 2, nodeLookup))
        .attr('y2', link => resolveCoordinate(link.target, 'y', height / 2, nodeLookup));
    });

    return () => {
      simulation.stop();
    };
  }, [visibleNodes, visibleLinks, dimensions, setExpandedNodes]);

  if (!rootNode) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        Select folders with storage data to generate the orbital map.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg ref={svgRef} className="w-full h-full">
        <g ref={linkGroupRef} />
        <g ref={nodeGroupRef} />
      </svg>
    </div>
  );
};
