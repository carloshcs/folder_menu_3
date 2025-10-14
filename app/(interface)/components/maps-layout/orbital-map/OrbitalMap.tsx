import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  D3ZoomEvent,
  Selection,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  select,
  zoom,
  type ForceLink,
  type Simulation,
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
const ORBITAL_RADIUS_STEP = 150;
const NODE_RADIUS_BY_DEPTH = [60, 42, 30, 24, 20];
const ZOOM_EXTENT: [number, number] = [0.35, 2.4];

interface OrbitalMapProps {
  folders: FolderItem[];
  colorPaletteId?: string;
}

interface OrbitalSimulationNode extends BubbleTreeNode {
  orbitRadius: number;
  radius: number;
  parentId: string | null;
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

const getOrbitRadiusForDepth = (depth: number) => (depth === 0 ? 0 : depth * ORBITAL_RADIUS_STEP);

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
      parentId: parent?.id ?? null,
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

const createOrbitForce = (
  nodeLookup: Map<string, OrbitalSimulationNode>,
  getRadius: (node: OrbitalSimulationNode) => number,
) => {
  const strength = 0.2;

  const force = (alpha: number) => {
    nodeLookup.forEach(node => {
      if (!node.parentId) {
        return;
      }

      const parent = nodeLookup.get(node.parentId);
      if (!parent) {
        return;
      }

      const parentX = parent.x ?? 0;
      const parentY = parent.y ?? 0;
      const nodeX = node.x ?? parentX;
      const nodeY = node.y ?? parentY;

      let dx = nodeX - parentX;
      let dy = nodeY - parentY;
      let distance = Math.sqrt(dx * dx + dy * dy);

      if (distance === 0) {
        const angle = Math.random() * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }

      const targetRadius = getRadius(node);
      if (!targetRadius) {
        return;
      }

      const delta = distance - targetRadius;
      const adjustment = (delta / distance) * strength * alpha;

      node.vx = (node.vx ?? 0) - dx * adjustment;
      node.vy = (node.vy ?? 0) - dy * adjustment;
    });
  };

  force.initialize = () => {};

  return force;
};

export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders, colorPaletteId }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomGroupRef = useRef<SVGGElement | null>(null);
  const orbitRingGroupRef = useRef<SVGGElement | null>(null);
  const linkGroupRef = useRef<SVGGElement | null>(null);
  const nodeGroupRef = useRef<SVGGElement | null>(null);
  const simulationRef = useRef<Simulation<OrbitalSimulationNode, OrbitalLink> | null>(null);
  const nodeStoreRef = useRef<Map<string, OrbitalSimulationNode>>(new Map());

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
      .translateExtent([
        [-Infinity, -Infinity],
        [Infinity, Infinity],
      ])
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

    const svgSelection = select(svgElement);
    svgSelection
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('overflow', 'visible');

    const orbitRingGroup = select(orbitRingGroupElement);
    const linkGroup = select(linkGroupElement);
    const nodeGroup = select(nodeGroupElement);

    const nodeLookup = nodeStoreRef.current;

    const visibleIds = new Set(visibleNodes.map(node => node.id));
    nodeLookup.forEach((_node, id) => {
      if (!visibleIds.has(id)) {
        nodeLookup.delete(id);
      }
    });

    visibleNodes.forEach(node => {
      const parent = node.parentId ? nodeLookup.get(node.parentId) : null;
      const radius = getNodeRadiusForDepth(node.depth);
      const depthRadius = getOrbitRadiusForDepth(node.depth);
      const localOrbitBase = (parent?.radius ?? 0) + getOrbitRadiusForDepth(1);
      const orbitRadius = node.parentId ? Math.max(depthRadius, localOrbitBase) : 0;
      const existing = nodeLookup.get(node.id);

      if (existing) {
        existing.name = node.name;
        existing.size = node.size;
        existing.depth = node.depth;
        existing.parentId = node.parentId;
        existing.children = node.children;
        existing.radius = radius;
        existing.orbitRadius = orbitRadius;
        return;
      }

      const parentX = parent?.x ?? width / 2;
      const parentY = parent?.y ?? height / 2;
      const angle = Math.random() * Math.PI * 2;
      const distance = node.parentId ? orbitRadius || ORBITAL_BASE_RADIUS : 0;
      const initialX = node.parentId ? parentX + Math.cos(angle) * distance : width / 2;
      const initialY = node.parentId ? parentY + Math.sin(angle) * distance : height / 2;

      nodeLookup.set(node.id, {
        ...node,
        radius,
        orbitRadius,
        x: initialX,
        y: initialY,
        fx: node.parentId ? null : width / 2,
        fy: node.parentId ? null : height / 2,
        vx: 0,
        vy: 0,
      });
    });

    const nodesData = Array.from(nodeLookup.values());

    if (!nodesData.length) {
      orbitRingGroup.selectAll('*').remove();
      linkGroup.selectAll('*').remove();
      nodeGroup.selectAll('*').remove();
      simulationRef.current?.stop();
      simulationRef.current = null;
      return;
    }

    const linkData: OrbitalLink[] = visibleLinks
      .map(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        const sourceNode = nodeLookup.get(sourceId);
        const targetNode = nodeLookup.get(targetId);

        if (!sourceNode || !targetNode) {
          return null;
        }

        return {
          source: sourceNode,
          target: targetNode,
        } as OrbitalLink;
      })
      .filter((link): link is OrbitalLink => !!link);

    const getParentCoordinate = (
      node: OrbitalSimulationNode,
      axis: 'x' | 'y',
      fallback: number,
    ) => {
      if (!node.parentId) {
        return fallback;
      }

      const parent = nodeLookup.get(node.parentId);
      return parent?.[axis] ?? fallback;
    };

    let simulation = simulationRef.current;

    if (!simulation) {
      simulation = forceSimulation<OrbitalSimulationNode>(nodesData)
        .force(
          'link',
          forceLink<OrbitalSimulationNode, OrbitalLink>(linkData)
            .id(node => node.id)
            .distance(link => {
              const targetNode =
                typeof link.target === 'object'
                  ? (link.target as OrbitalSimulationNode)
                  : nodeLookup.get(link.target);
              const parent = targetNode?.parentId ? nodeLookup.get(targetNode.parentId) : null;
              const depth = targetNode?.depth ?? 1;
              const depthRadius = getOrbitRadiusForDepth(depth);
              const localOrbitBase = (parent?.radius ?? 0) + getOrbitRadiusForDepth(1);
              return Math.max(depthRadius, localOrbitBase, ORBITAL_BASE_RADIUS);
            })
            .strength(0.85),
        )
        .force('charge', forceManyBody().strength(-260))
        .force('center', forceCenter(width / 2, height / 2))
        .force(
          'parent-x',
          forceX<OrbitalSimulationNode>(node => getParentCoordinate(node, 'x', width / 2)).strength(node =>
            node.parentId ? 0.12 : 0.4,
          ),
        )
        .force(
          'parent-y',
          forceY<OrbitalSimulationNode>(node => getParentCoordinate(node, 'y', height / 2)).strength(node =>
            node.parentId ? 0.12 : 0.4,
          ),
        )
        .force('collision', forceCollide<OrbitalSimulationNode>().radius(node => node.radius + 12).strength(0.95))
        .force('orbit', createOrbitForce(nodeLookup, node => node.orbitRadius))
        .velocityDecay(0.28)
        .alphaDecay(0.055);

      simulationRef.current = simulation;
    } else {
      simulation.nodes(nodesData);

      const linkForce = simulation.force<ForceLink<OrbitalSimulationNode, OrbitalLink>>('link');
      if (linkForce) {
        linkForce.links(linkData);
      }

      const parentXForce = simulation.force('parent-x') as ReturnType<typeof forceX> | undefined;
      const parentYForce = simulation.force('parent-y') as ReturnType<typeof forceY> | undefined;

      if (parentXForce) {
        parentXForce.x(node => getParentCoordinate(node, 'x', width / 2));
      }

      if (parentYForce) {
        parentYForce.y(node => getParentCoordinate(node, 'y', height / 2));
      }

      simulation.force('center', forceCenter(width / 2, height / 2));
    }

    nodesData.forEach(node => {
      if (node.parentId) {
        node.fx = null;
        node.fy = null;
        return;
      }

      node.fx = width / 2;
      node.fy = height / 2;
    });

    simulation.alpha(0.9).restart();

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
      .data(linkData, linkKey);

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

    mergedNodes.select('circle').attr('r', node => node.radius);

    mergedNodes.select('text').text(node => node.name);

    mergedNodes.on('dblclick', (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      handleNodeDoubleClick(node, setExpandedNodes);
    });

    enableNodeDrag(simulation, mergedNodes);

    simulation.on('tick', null);
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
        .attr('r', node => {
          const depthRadius = getOrbitRadiusForDepth(node.depth + 1);
          const localOrbitBase = node.radius + getOrbitRadiusForDepth(1);
          return Math.max(depthRadius, localOrbitBase, ORBITAL_BASE_RADIUS);
        });
    });
  }, [visibleNodes, visibleLinks, dimensions, expandedNodes]);

  useEffect(() => {
    return () => {
      simulationRef.current?.stop();
      simulationRef.current = null;
    };
  }, []);

  useEffect(() => {
    const nodeGroupElement = nodeGroupRef.current;
    if (!nodeGroupElement) {
      return;
    }

    const nodeSelection = select(nodeGroupElement)
      .selectAll<SVGGElement, OrbitalSimulationNode>('g.orbital-node');

    nodeSelection.select('circle').each(function (node) {
      const baseColor = getPaletteColor(colorPaletteId, node.depth);
      const strokeColor = shiftColor(baseColor, -0.2);
      select(this).attr('fill', baseColor).attr('stroke', strokeColor);
    });

    nodeSelection
      .select('text')
      .attr('fill', node => getReadableTextColor(getPaletteColor(colorPaletteId, node.depth)));
  }, [colorPaletteId, visibleNodes]);

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
