import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  D3ZoomEvent,
  Selection,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  select,
  zoom,
  type SimulationLinkDatum,
  type ZoomBehavior,
} from 'd3';

import type { FolderItem } from '../../right-sidebar/data';
import {
  buildBubbleNodes,
  buildBubbleTree,
  type BubbleTree,
  type BubbleTreeNode,
} from '@/lib/mapData';
import { enableNodeDrag, handleNodeDoubleClick } from '@/app/(interface)/lib/mapUtils/interactions';
import {
  getPaletteColor,
  getReadableTextColor,
  shiftColor,
} from '@/app/(interface)/lib/utils/colors';

const ORBITAL_BASE_RADIUS = 140;
const ORBITAL_RADIUS_STEP = 160;
const NODE_RADIUS_BY_DEPTH = [60, 42, 30, 24, 20];
const ZOOM_EXTENT: [number, number] = [0.35, 2.4];

interface OrbitalMapProps {
  folders: FolderItem[];
  colorPaletteId?: string;
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

const getOrbitRadiusForDepth = (depth: number) =>
  depth === 0 ? 0 : ORBITAL_BASE_RADIUS + (depth - 1) * ORBITAL_RADIUS_STEP;

const getNodeRadiusForDepth = (depth: number) =>
  NODE_RADIUS_BY_DEPTH[Math.min(depth, NODE_RADIUS_BY_DEPTH.length - 1)];

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
    const orbitRadius = getOrbitRadiusForDepth(depth);
    const simulationNode: OrbitalSimulationNode = {
      ...node,
      orbitRadius,
      radius: getNodeRadiusForDepth(depth),
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

  const [root] = [...tree.roots].sort((first, second) => {
    if (first.depth !== second.depth) {
      return first.depth - second.depth;
    }

    return second.size - first.size;
  });

  return root;
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

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders, colorPaletteId }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomGroupRef = useRef<SVGGElement | null>(null);
  const orbitRingGroupRef = useRef<SVGGElement | null>(null);
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

  useEffect(() => {
    const svgElement = svgRef.current;
    const zoomGroupElement = zoomGroupRef.current;

    if (!svgElement || !zoomGroupElement) {
      return;
    }

    const svgSelection = select(svgElement);
    const zoomGroupSelection = select(zoomGroupElement);

    const zoomBehaviour: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
      .scaleExtent(ZOOM_EXTENT)
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomGroupSelection.attr('transform', event.transform.toString());
      });

    svgSelection.call(zoomBehaviour as any);
    svgSelection.on('dblclick.zoom', null);

    return () => {
      svgSelection.on('.zoom', null);
    };
  }, []);

  const bubbleNodes = useMemo(() => buildBubbleNodes(folders), [folders]);
  const bubbleTree = useMemo(() => buildBubbleTree(bubbleNodes), [bubbleNodes]);
  const rootNode = useMemo(() => findRootNode(bubbleTree), [bubbleTree]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!rootNode) {
      setExpandedNodes(new Set());
      return;
    }

    setExpandedNodes(previous => {
      const next = new Set(previous);
      const validIds = new Set(bubbleTree.nodeMap.keys());

      next.forEach(id => {
        if (!validIds.has(id)) {
          next.delete(id);
        }
      });

      if (!next.has(rootNode.id) || next.size === 0) {
        return new Set([rootNode.id]);
      }

      return next;
    });
  }, [rootNode, bubbleTree]);

  const { nodes: visibleNodes, links: visibleLinks } = useMemo(
    () => computeVisibleGraph(rootNode, expandedNodes),
    [rootNode, expandedNodes],
  );

  useEffect(() => {
    const svgElement = svgRef.current;
    const orbitRingGroupElement = orbitRingGroupRef.current;
    const linkGroupElement = linkGroupRef.current;
    const nodeGroupElement = nodeGroupRef.current;

    if (!svgElement || !orbitRingGroupElement || !linkGroupElement || !nodeGroupElement) {
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

    const orbitRingGroup = select(orbitRingGroupElement);
    const linkGroup = select(linkGroupElement);
    const nodeGroup = select(nodeGroupElement);

    if (nodesData.length === 0) {
      orbitRingGroup.selectAll('*').remove();
      linkGroup.selectAll('*').remove();
      nodeGroup.selectAll('*').remove();
      return;
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
            const depth = target?.depth ?? 1;
            const orbitRadius = getOrbitRadiusForDepth(depth);
            return orbitRadius || ORBITAL_BASE_RADIUS;
          })
          .strength(0.8),
      )
      .force('charge', forceManyBody().strength(-280))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'radial',
        forceRadial<OrbitalSimulationNode>(node => node.orbitRadius, width / 2, height / 2).strength(0.9),
      )
      .force('collision', forceCollide<OrbitalSimulationNode>().radius(node => node.radius + 12).strength(0.95))
      .velocityDecay(0.32);

    if (nodesData.length) {
      nodesData[0].x = width / 2;
      nodesData[0].y = height / 2;
    }

    simulation.alpha(1).alphaDecay(0.055);

    const ringData = nodesData.filter(node => node.children?.length && expandedNodes.has(node.id));

    const ringSelection = orbitRingGroup
      .selectAll<SVGCircleElement, OrbitalSimulationNode>('circle.orbit-ring')
      .data(ringData, node => node.id);

    ringSelection.exit().remove();

    const ringEnter = ringSelection
      .enter()
      .append('circle')
      .attr('class', 'orbit-ring')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(148, 163, 184, 0.2)')
      .attr('stroke-width', 1.25)
      .attr('stroke-dasharray', '2 6');

    const mergedRings = ringEnter.merge(
      ringSelection as Selection<SVGCircleElement, OrbitalSimulationNode, SVGGElement, unknown>,
    );

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
      .attr('stroke', 'rgba(148, 163, 184, 0.3)')
      .attr('stroke-width', 1.2)
      .attr('stroke-linecap', 'round');

    const mergedLinks = linkEnter.merge(
      linkSelection as Selection<SVGLineElement, OrbitalLink, SVGGElement, unknown>,
    );

    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, OrbitalSimulationNode>('g.orbital-node')
      .data(nodesData, node => node.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'orbital-node cursor-pointer select-none');

    nodeEnter
      .append('circle')
      .attr('stroke-width', 2)
      .attr('fill-opacity', 0.95);

    nodeEnter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .attr('dy', '0.35em')
      .style('pointer-events', 'none');

    const mergedNodes = nodeEnter.merge(
      nodeSelection as Selection<SVGGElement, OrbitalSimulationNode, SVGGElement, unknown>,
    );

    mergedNodes.select('circle').each(function (node) {
      const baseColor = getPaletteColor(colorPaletteId, node.depth);
      const strokeColor = shiftColor(baseColor, -0.2);
      select(this)
        .attr('r', node.radius)
        .attr('fill', baseColor)
        .attr('stroke', strokeColor);
    });

    mergedNodes
      .select('text')
      .text(node => node.name)
      .attr('fill', node => getReadableTextColor(getPaletteColor(colorPaletteId, node.depth)));

    mergedNodes.on('dblclick', (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      handleNodeDoubleClick(node, setExpandedNodes);
    });

    enableNodeDrag(simulation, mergedNodes);

    simulation.on('tick', () => {
      mergedNodes.attr('transform', node => `translate(${node.x ?? width / 2}, ${node.y ?? height / 2})`);

      mergedLinks
        .attr('x1', link => resolveCoordinate(link.source, 'x', width / 2, nodeLookup))
        .attr('y1', link => resolveCoordinate(link.source, 'y', height / 2, nodeLookup))
        .attr('x2', link => resolveCoordinate(link.target, 'x', width / 2, nodeLookup))
        .attr('y2', link => resolveCoordinate(link.target, 'y', height / 2, nodeLookup));

      mergedRings
        .attr('cx', node => node.x ?? width / 2)
        .attr('cy', node => node.y ?? height / 2)
        .attr('r', node => getOrbitRadiusForDepth(node.depth + 1));
    });

    return () => {
      simulation.stop();
    };
  }, [visibleNodes, visibleLinks, dimensions, expandedNodes, colorPaletteId]);

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
        <g ref={zoomGroupRef}>
          <g ref={orbitRingGroupRef} />
          <g ref={linkGroupRef} />
          <g ref={nodeGroupRef} />
        </g>
      </svg>
    </div>
  );
};
