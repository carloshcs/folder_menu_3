import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select, type Selection } from 'd3-selection';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
} from 'd3-force';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import 'd3-transition';

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
} from '@/app/(interface)/lib/mapUtils/palettes';

const NODE_RADIUS_BY_DEPTH = [64, 44, 32, 26, 20];
const ORBIT_DISTANCE_BY_DEPTH = [0, 220, 150, 110, 90];
const ORBIT_STRENGTH_BY_DEPTH = [0, 0.18, 0.14, 0.12, 0.1];
const CHARGE_BY_DEPTH = [-480, -360, -220, -160, -120];
const ORBIT_RING_STROKE = 'rgba(148, 163, 184, 0.18)';
const ORBIT_RING_DASH = '6 10';

interface OrbitalMapProps {
  folders: FolderItem[];
  colorPaletteId?: string;
}

interface OrbitalSimulationNode extends BubbleTreeNode {
  radius: number;
  orbitRadius: number;
  childOrbitRadius: number;
  targetAngle: number;
  groupIndex: number;
  siblingIndex: number;
  siblingCount: number;
  fillColor?: string;
  strokeColor?: string;
  textColor?: string;
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

const depthIndex = (depth: number) => Math.min(depth, NODE_RADIUS_BY_DEPTH.length - 1);

const computeVisibleGraph = (
  rootNode: BubbleTreeNode | null,
  expandedNodes: Set<string>,
): { nodes: OrbitalSimulationNode[]; links: OrbitalLink[] } => {
  if (!rootNode) {
    return { nodes: [], links: [] };
  }

  const nodes: OrbitalSimulationNode[] = [];
  const links: OrbitalLink[] = [];

  const traverse = (
    node: BubbleTreeNode,
    depth: number,
    parent: BubbleTreeNode | null,
    groupIndex: number,
    siblingIndex: number,
    siblingCount: number,
  ) => {
    const depthIdx = depthIndex(depth);
    const radius = NODE_RADIUS_BY_DEPTH[depthIdx];
    const orbitRadius =
      depth === 0
        ? 0
        : ORBIT_DISTANCE_BY_DEPTH[Math.min(depth, ORBIT_DISTANCE_BY_DEPTH.length - 1)];
    const childOrbitRadius = node.children.length
      ? ORBIT_DISTANCE_BY_DEPTH[Math.min(depth + 1, ORBIT_DISTANCE_BY_DEPTH.length - 1)]
      : 0;

    const angleCount = siblingCount > 0 ? siblingCount : 1;
    const baseAngle = -Math.PI / 2;
    const targetAngle = depth === 0 ? 0 : baseAngle + (siblingIndex / angleCount) * Math.PI * 2;

    nodes.push({
      ...node,
      radius,
      orbitRadius,
      childOrbitRadius,
      targetAngle,
      groupIndex,
      siblingIndex,
      siblingCount,
    });

    if (parent) {
      links.push({ source: parent.id, target: node.id });
    }

    if (!expandedNodes.has(node.id)) {
      return;
    }

    node.children.forEach((child, index) => {
      traverse(
        child,
        depth + 1,
        node,
        depth === 0 ? index : groupIndex,
        index,
        node.children.length,
      );
    });
  };

  traverse(rootNode, 0, null, 0, 0, rootNode.children.length);

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

const ensurePosition = (
  node: OrbitalSimulationNode,
  nodeLookup: Map<string, OrbitalSimulationNode>,
  cache: Map<string, { x: number; y: number }>,
  width: number,
  height: number,
): { x: number; y: number } => {
  if (!node.parentId) {
    const center = { x: width / 2, y: height / 2 };
    node.x = center.x;
    node.y = center.y;
    cache.set(node.id, center);
    return center;
  }

  const cached = cache.get(node.id);
  if (cached) {
    node.x = cached.x;
    node.y = cached.y;
    return cached;
  }

  if (node.x != null && node.y != null) {
    return { x: node.x, y: node.y };
  }

  const parent = nodeLookup.get(node.parentId);
  const parentPosition = parent
    ? ensurePosition(parent, nodeLookup, cache, width, height)
    : { x: width / 2, y: height / 2 };

  const orbitRadius = node.orbitRadius || 0;
  const angle = (node.targetAngle ?? 0) + (Math.random() - 0.5) * 0.2;
  const position = {
    x: parentPosition.x + Math.cos(angle) * orbitRadius,
    y: parentPosition.y + Math.sin(angle) * orbitRadius,
  };

  node.x = position.x;
  node.y = position.y;
  cache.set(node.id, position);

  return position;
};

const createOrbitForce = (
  nodeLookup: Map<string, OrbitalSimulationNode>,
  width: number,
  height: number,
) => {
  let nodes: OrbitalSimulationNode[] = [];

  const force = () => {
    nodes.forEach(node => {
      if (!node.parentId) {
        const centerX = width / 2;
        const centerY = height / 2;
        node.vx = (node.vx ?? 0) + (centerX - (node.x ?? centerX)) * 0.08;
        node.vy = (node.vy ?? 0) + (centerY - (node.y ?? centerY)) * 0.08;
        return;
      }

      const parent = nodeLookup.get(node.parentId);
      if (!parent) {
        return;
      }

      const parentX = parent.x ?? width / 2;
      const parentY = parent.y ?? height / 2;
      const targetAngle = node.targetAngle ?? 0;
      const orbitRadius = node.orbitRadius || 0;
      const desiredX = parentX + Math.cos(targetAngle) * orbitRadius;
      const desiredY = parentY + Math.sin(targetAngle) * orbitRadius;

      const currentX = node.x ?? desiredX;
      const currentY = node.y ?? desiredY;

      const strength =
        ORBIT_STRENGTH_BY_DEPTH[Math.min(node.depth, ORBIT_STRENGTH_BY_DEPTH.length - 1)];

      node.vx = (node.vx ?? 0) + (desiredX - currentX) * strength;
      node.vy = (node.vy ?? 0) + (desiredY - currentY) * strength;
    });
  };

  (force as any).initialize = (nodesArray: OrbitalSimulationNode[]) => {
    nodes = nodesArray;
  };

  return force;
};

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders, colorPaletteId }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomGroupRef = useRef<SVGGElement | null>(null);
  const orbitGroupRef = useRef<SVGGElement | null>(null);
  const linkGroupRef = useRef<SVGGElement | null>(null);
  const nodeGroupRef = useRef<SVGGElement | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const zoomBehaviourRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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
        if (previous.width === width && previous.height === height) {
          return previous;
        }

        return { width, height };
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const bubbleNodes = useMemo(() => buildBubbleNodes(folders), [folders]);
  const bubbleTree = useMemo<BubbleTree>(() => buildBubbleTree(bubbleNodes), [bubbleNodes]);
  const rootNode = useMemo(() => findRootNode(bubbleTree), [bubbleTree]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!rootNode) {
      setExpandedNodes(new Set());
      return;
    }

    setExpandedNodes(new Set([rootNode.id]));
  }, [rootNode]);

  const visibleGraph = useMemo(
    () => computeVisibleGraph(rootNode, expandedNodes),
    [rootNode, expandedNodes],
  );

  const onNodeDoubleClick = useCallback(
    (node: BubbleTreeNode) => {
      if (!node) {
        return;
      }

      if (!node.parentId) {
        setExpandedNodes(previous => {
          const next = new Set(previous);
          next.add(node.id);
          return next;
        });
        return;
      }

      handleNodeDoubleClick(node, setExpandedNodes);
    },
    [],
  );

  useEffect(() => {
    const svgElement = svgRef.current;
    const zoomGroupElement = zoomGroupRef.current;
    const orbitGroupElement = orbitGroupRef.current;
    const linkGroupElement = linkGroupRef.current;
    const nodeGroupElement = nodeGroupRef.current;

    if (
      !svgElement ||
      !zoomGroupElement ||
      !orbitGroupElement ||
      !linkGroupElement ||
      !nodeGroupElement
    ) {
      return;
    }

    const { width, height } = dimensions;
    if (width <= 0 || height <= 0) {
      return;
    }

    const { nodes: visibleNodes, links: visibleLinks } = visibleGraph;

    const nodesData = visibleNodes.map(node => ({ ...node }));
    const linksData = visibleLinks.map(link => ({ ...link }));

    const nodeLookup = new Map(nodesData.map(node => [node.id, node] as const));

    nodesData.forEach(node => {
      const paletteColor = getPaletteColor(colorPaletteId, node.groupIndex);
      const depthFactor = depthIndex(node.depth) * 0.12;
      const fillColor = shiftColor(paletteColor, 0.32 - depthFactor);
      node.fillColor = fillColor;
      node.strokeColor = shiftColor(fillColor, -0.38);
      node.textColor = getReadableTextColor(fillColor);
    });

    nodesData.forEach(node => {
      ensurePosition(node, nodeLookup, positionsRef.current, width, height);
    });

    const svgSelection = select(svgElement);
    svgSelection
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    if (!zoomBehaviourRef.current) {
      zoomBehaviourRef.current = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.45, 3])
        .on('zoom', event => {
          select(zoomGroupElement).attr('transform', event.transform.toString());
        });
      svgSelection.call(zoomBehaviourRef.current as any);
      svgSelection.on('dblclick.zoom', null);
    } else {
      svgSelection.call(zoomBehaviourRef.current as any);
    }

    const zoomGroupSelection = select(zoomGroupElement);
    if (!zoomGroupSelection.attr('transform')) {
      zoomGroupSelection.attr('transform', zoomIdentity.toString());
    }

    const orbitGroup = select(orbitGroupElement);
    const linkGroup = select(linkGroupElement);
    const nodeGroup = select(nodeGroupElement);

    if (!nodesData.length) {
      orbitGroup.selectAll('*').remove();
      linkGroup.selectAll('*').remove();
      nodeGroup.selectAll('*').remove();
      return;
    }

    const orbitData = nodesData.filter(
      node => node.childOrbitRadius > 0 && expandedNodes.has(node.id),
    );

    const orbitSelection = orbitGroup
      .selectAll<SVGCircleElement, OrbitalSimulationNode>('circle.orbit-ring')
      .data(orbitData, node => node.id);

    orbitSelection
      .exit()
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();

    const orbitEnter = orbitSelection
      .enter()
      .append('circle')
      .attr('class', 'orbit-ring')
      .attr('fill', 'none')
      .attr('stroke', ORBIT_RING_STROKE)
      .attr('stroke-dasharray', ORBIT_RING_DASH)
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'none')
      .style('opacity', 0);

    const mergedOrbits = orbitEnter
      .merge(orbitSelection as Selection<SVGCircleElement, OrbitalSimulationNode, SVGGElement, unknown>)
      .transition()
      .duration(220)
      .style('opacity', 1)
      .selection();

    const linkKey = (link: OrbitalLink) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      return `${sourceId}-${targetId}`;
    };

    const linkSelection = linkGroup
      .selectAll<SVGLineElement, OrbitalLink>('line.orbital-link')
      .data(linksData, linkKey);

    linkSelection
      .exit()
      .transition()
      .duration(180)
      .style('opacity', 0)
      .remove();

    const linkEnter = linkSelection
      .enter()
      .append('line')
      .attr('class', 'orbital-link')
      .attr('stroke', 'rgba(148, 163, 184, 0.3)')
      .attr('stroke-width', 1.4)
      .attr('stroke-linecap', 'round')
      .style('opacity', 0);

    const mergedLinks = linkEnter
      .merge(linkSelection as Selection<SVGLineElement, OrbitalLink, SVGGElement, unknown>)
      .transition()
      .duration(200)
      .style('opacity', 1)
      .selection();

    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, OrbitalSimulationNode>('g.orbital-node')
      .data(nodesData, node => node.id);

    nodeSelection
      .exit()
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'orbital-node cursor-pointer')
      .style('opacity', 0);

    nodeEnter
      .append('circle')
      .attr('stroke-width', 2.5);

    nodeEnter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .attr('font-weight', 600)
      .style('pointer-events', 'none');

    const mergedNodes = nodeEnter
      .merge(nodeSelection as Selection<SVGGElement, OrbitalSimulationNode, SVGGElement, unknown>)
      .transition()
      .duration(220)
      .style('opacity', 1)
      .selection();

    mergedNodes.select('circle').each(function (node) {
      select(this)
        .attr('r', node.radius)
        .attr('fill', node.fillColor ?? '#1d4ed8')
        .attr('stroke', node.strokeColor ?? '#0f172a');
    });

    mergedNodes
      .select('text')
      .text(node => node.name)
      .attr('font-size', node => Math.max(11, Math.min(node.radius * 0.65, 18)))
      .attr('fill', node => node.textColor ?? '#f8fafc');

    mergedNodes.on('dblclick', (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      onNodeDoubleClick(node);
    });

    const simulation = forceSimulation<OrbitalSimulationNode>(nodesData)
      .force(
        'link',
        forceLink<OrbitalSimulationNode, OrbitalLink>(linksData)
          .id(node => node.id)
          .distance(link => {
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const target = nodeLookup.get(targetId);
            if (!target) {
              return 140;
            }

            return Math.max(120, target.orbitRadius + target.radius * 1.5);
          })
          .strength(link => {
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const target = nodeLookup.get(targetId);
            return target && target.depth <= 1 ? 0.8 : 0.6;
          }),
      )
      .force(
        'charge',
        forceManyBody<OrbitalSimulationNode>().strength(node => {
          return CHARGE_BY_DEPTH[Math.min(node.depth, CHARGE_BY_DEPTH.length - 1)];
        }),
      )
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'collision',
        forceCollide<OrbitalSimulationNode>().radius(node => node.radius + (node.depth <= 1 ? 22 : 12)),
      )
      .velocityDecay(0.4);

    simulation.force('orbit', createOrbitForce(nodeLookup, width, height));
    simulation.alpha(0.9).alphaDecay(0.08);

    enableNodeDrag(simulation, mergedNodes);

    simulation.on('tick', () => {
      mergedNodes.attr('transform', node => {
        const x = node.x ?? width / 2;
        const y = node.y ?? height / 2;
        positionsRef.current.set(node.id, { x, y });
        return `translate(${x}, ${y})`;
      });

      mergedLinks
        .attr('x1', link => resolveCoordinate(link.source, 'x', width / 2, nodeLookup))
        .attr('y1', link => resolveCoordinate(link.source, 'y', height / 2, nodeLookup))
        .attr('x2', link => resolveCoordinate(link.target, 'x', width / 2, nodeLookup))
        .attr('y2', link => resolveCoordinate(link.target, 'y', height / 2, nodeLookup));

      mergedOrbits
        .attr('cx', node => node.x ?? width / 2)
        .attr('cy', node => node.y ?? height / 2)
        .attr('r', node => node.childOrbitRadius + (node.radius ?? 0) + 12);
    });

    return () => {
      simulation.stop();
    };
  }, [visibleGraph, dimensions, expandedNodes, colorPaletteId, onNodeDoubleClick]);

  if (!rootNode) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        Select folders with storage data to generate the orbital map.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      <svg ref={svgRef} className="w-full h-full select-none touch-none">
        <g ref={zoomGroupRef}>
          <g ref={orbitGroupRef} />
          <g ref={linkGroupRef} />
          <g ref={nodeGroupRef} />
        </g>
      </svg>
    </div>
  );
};
