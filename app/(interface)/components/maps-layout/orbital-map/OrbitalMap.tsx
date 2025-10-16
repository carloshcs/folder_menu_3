// ===== UPDATED OrbitalMap.tsx =====
'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface FolderItem {
  name: string;
  children?: FolderItem[];
}

interface D3HierarchyNode {
  data: any;
  depth: number;
  parent?: D3HierarchyNode;
  children?: D3HierarchyNode[];
}

interface D3Link {
  source: D3HierarchyNode;
  target: D3HierarchyNode;
}

type D3GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

interface OrbitalMapProps {
  folders: FolderItem[];
}

// Configurable orbital radii for each level
const ORBITAL_RADII: Record<number, number> = {
  0: 0,        // Center (Folder Fox)
  1: 200,      // Level 1: Integrations around center
  2: 150,      // Level 2: Folders around integrations
  3: 80,       // Level 3 and beyond: fixed radius
};

// Get radius for a given depth
function getOrbitalRadius(depth: number): number {
  if (depth === 0) return 0;
  if (depth === 1) return ORBITAL_RADII[1];
  if (depth === 2) return ORBITAL_RADII[2];
  // Level 3 and beyond use the same base radius
  return ORBITAL_RADII[3];
}

// ===== Data Utils =====
function mapFolderToHierarchy(folder: FolderItem): any {
  const children = folder.children ? folder.children.map(mapFolderToHierarchy) : [];
  return { name: folder.name, children };
}

function buildHierarchy(folders: FolderItem[]) {
  const integrations = ['Google Drive', 'Dropbox', 'OneDrive', 'Notion'];
  const folderFox = {
    name: 'Folder Fox',
    children: folders.filter(f => integrations.includes(f.name)).map(mapFolderToHierarchy),
  };
  return d3.hierarchy(folderFox);
}

function getVisibleNodesAndLinks(root: D3HierarchyNode, expanded: Set<string>) {
  const allNodes = root.descendants();
  const allLinks = root.links();

  const visibleNodes = allNodes.filter(d => {
    if (d.depth <= 1) return true;
    const parent = d.parent;
    if (!parent) return false;
    return expanded.has(parent.data.name);
  });

  const visibleLinks = allLinks.filter(
    d => visibleNodes.includes(d.source) && visibleNodes.includes(d.target),
  );

  return { visibleNodes, visibleLinks };
}

// ===== Physics Engine =====
export function createManualPhysics(
  nodes: any[],
  onTick: () => void,
) {
  const folderFox = nodes.find(n => n?.data?.name === 'Folder Fox');

  if (folderFox) {
    folderFox.x = 0;
    folderFox.y = 0;
    folderFox.isPrimary = true;
  }

  // --- Setup integrations (depth 1) ---
  const integrations = nodes.filter(
    n =>
      n?.parent === folderFox &&
      ['Google Drive', 'Dropbox', 'OneDrive', 'Notion'].includes(n?.data?.name)
  );

  const integrationsCount = integrations.length || 1;
  const integrationAngleStep = (2 * Math.PI) / integrationsCount;

  integrations.forEach((node, i) => {
    const angle = i * integrationAngleStep - Math.PI / 2;
    node.orbitAngle = angle;
    node.depth = 1;
    node.isInOrbit = true;

    const cx = folderFox ? folderFox.x : 0;
    const cy = folderFox ? folderFox.y : 0;
    const radius = getOrbitalRadius(1);
    
    node.targetX = cx + Math.cos(angle) * radius;
    node.targetY = cy + Math.sin(angle) * radius;
    node.x = node.targetX;
    node.y = node.targetY;
  });

  // --- Setup all deeper levels (depth 2+) ---
  const depthGroups = new Map<number, any[]>();
  nodes.forEach(node => {
    if (node.depth >= 2) {
      if (!depthGroups.has(node.depth)) {
        depthGroups.set(node.depth, []);
      }
      depthGroups.get(node.depth)!.push(node);
    }
  });

  // Sort depths ascending
  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

  sortedDepths.forEach(depth => {
    const nodesAtDepth = depthGroups.get(depth)!;

    // Group by parent
    const byParent = new Map<any, any[]>();
    nodesAtDepth.forEach(node => {
      const parent = node.parent;
      if (!byParent.has(parent)) {
        byParent.set(parent, []);
      }
      byParent.get(parent)!.push(node);
    });

    // Position children radially outward from each parent
    byParent.forEach((children, parent) => {
      const childCount = children.length;
      const nodeRadius = getNodeRadius(depth);
      const minNodeSpacing = nodeRadius * 3; // 3x diameter for comfortable spacing
      
      // Fixed spread angle at 135°
      const spreadAngle = Math.PI * 0.75; // 135°
      
      if (childCount === 1) {
        // Single child: place straight out
        const baseRadius = getOrbitalRadius(depth);
        const child = children[0];
        child.parentNode = parent;
        child.orbitAngle = parent.orbitAngle;
        child.offsetAngle = 0;
        child.isInOrbit = true;

        const px = parent.x ?? 0;
        const py = parent.y ?? 0;
        const angle = parent.orbitAngle;

        child.targetX = px + Math.cos(angle) * baseRadius;
        child.targetY = py + Math.sin(angle) * baseRadius;
        child.x = child.targetX;
        child.y = child.targetY;
      } else {
        // Multiple children: find minimum radius to prevent overlap
        let radius = getOrbitalRadius(depth);
        const maxIterations = 50;
        let foundValidLayout = false;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
          const startOffset = -spreadAngle / 2;
          const positions: {x: number, y: number}[] = [];
          
          // Calculate positions for current radius
          const px = parent.x ?? 0;
          const py = parent.y ?? 0;
          
          for (let idx = 0; idx < childCount; idx++) {
            const offsetAngle = startOffset + (idx / (childCount - 1)) * spreadAngle;
            const angle = parent.orbitAngle + offsetAngle;
            positions.push({
              x: px + Math.cos(angle) * radius,
              y: py + Math.sin(angle) * radius
            });
          }
          
          // Check if any siblings are too close
          let minDistance = Infinity;
          for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
              const dx = positions[i].x - positions[j].x;
              const dy = positions[i].y - positions[j].y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              minDistance = Math.min(minDistance, distance);
            }
          }
          
          // Check if layout is valid
          if (minDistance >= minNodeSpacing) {
            foundValidLayout = true;
            break;
          }
          
          // Increase radius to create more space
          radius += 10; // Increment by 10px each iteration
        }

        // Apply final positions
        const startOffset = -spreadAngle / 2;
        children.forEach((child, idx) => {
          child.parentNode = parent;
          child.orbitAngle = parent.orbitAngle;
          child.offsetAngle = startOffset + (idx / (childCount - 1)) * spreadAngle;
          child.isInOrbit = true;
          child.calculatedRadius = radius; // Store the calculated radius

          const px = parent.x ?? 0;
          const py = parent.y ?? 0;
          const angle = parent.orbitAngle + child.offsetAngle;

          child.targetX = px + Math.cos(angle) * radius;
          child.targetY = py + Math.sin(angle) * radius;
          child.x = child.targetX;
          child.y = child.targetY;
        });
      }
    });
  });

  const RETURN_SPEED = 0.12;
  let animationId: number;

  function animate() {
    nodes.forEach(node => {
      if (node.depth === 0 || node.isDragging || !node.isInOrbit) return;

      if (node.depth === 1) {
        // Secondary: orbits around center (Folder Fox)
        const cx = folderFox ? folderFox.x : 0;
        const cy = folderFox ? folderFox.y : 0;
        const radius = getOrbitalRadius(1);

        const targetX = cx + Math.cos(node.orbitAngle) * radius;
        const targetY = cy + Math.sin(node.orbitAngle) * radius;

        node.targetX = targetX;
        node.targetY = targetY;
        node.x += (node.targetX - node.x) * RETURN_SPEED;
        node.y += (node.targetY - node.y) * RETURN_SPEED;
      } else {
        // Tertiary and beyond: spreads within 135° arc from parent
        const parent = node.parentNode;
        if (!parent) return;

        const px = parent.x ?? 0;
        const py = parent.y ?? 0;
        const radius = node.calculatedRadius || getOrbitalRadius(node.depth);
        const angle = parent.orbitAngle + node.offsetAngle;

        const targetX = px + Math.cos(angle) * radius;
        const targetY = py + Math.sin(angle) * radius;

        node.targetX = targetX;
        node.targetY = targetY;
        node.x += (node.targetX - node.x) * RETURN_SPEED;
        node.y += (node.targetY - node.y) * RETURN_SPEED;
      }
    });

    onTick();
    animationId = requestAnimationFrame(animate);
  }

  animate();

  function onDragStart(node: any) {
    if (node.depth === 0) return;
    node.isDragging = true;
  }

  function onDrag(node: any, x: number, y: number) {
    if (node.depth === 0) return;
    node.x = x;
    node.y = y;
  }

  function onDragEnd(node: any) {
    if (node.depth === 0) return;
    node.isDragging = false;

    if (node.depth === 1) {
      // Return to primary orbit
      const cx = folderFox ? folderFox.x : 0;
      const cy = folderFox ? folderFox.y : 0;
      const radius = getOrbitalRadius(1);

      node.targetX = cx + Math.cos(node.orbitAngle) * radius;
      node.targetY = cy + Math.sin(node.orbitAngle) * radius;
    } else {
      // Return to arc spread from parent
      const parent = node.parentNode;
      if (!parent) return;

      const px = parent.x ?? 0;
      const py = parent.y ?? 0;
      const radius = node.calculatedRadius || getOrbitalRadius(node.depth);
      const angle = parent.orbitAngle + node.offsetAngle;

      node.targetX = px + Math.cos(angle) * radius;
      node.targetY = py + Math.sin(angle) * radius;
    }
  }

  return {
    stop: () => cancelAnimationFrame(animationId),
    dragHandlers: { onDragStart, onDrag, onDragEnd },
  };
}

// ===== Render Nodes =====
const LOGO_MAP: Record<string, string> = {
  'Folder Fox': '/assets/folder-fox.png',
  'Google Drive': '/assets/google-drive-logo.png',
  Dropbox: '/assets/dropbox-logo.png',
  OneDrive: '/assets/onedrive-logo.png',
  Notion: '/assets/notion-logo.png',
};

const INTEGRATION_NAMES = ['Google Drive', 'Dropbox', 'OneDrive', 'Notion'];

function getNodeId(d: any): string {
  if (d?.id) return String(d.id);
  if (d?.data?.name) {
    const name = d.data.name;
    const depth = d.depth;
    const parentName = d.parent?.data?.name || '';
    return `${depth}_${parentName}_${name}`.replace(/\s+/g, '_');
  }
  return 'node_' + Math.random().toString(36).slice(2);
}

function getNodeRadius(depth: number): number {
  if (depth === 0) return 30;
  if (depth === 1) return 25;
  if (depth === 2) return 28;
  // Level 3 and beyond: same size
  return 24;
}

function getNodeColor(depth: number): string {
  const colors: Record<number, string> = {
    0: '#fff',
    1: '#fff',
    2: '#a8d8a8',
    3: '#ffeb99',
    4: '#ffb3ba',
    5: '#bae1ff',
  };
  return colors[depth] || '#e0e0e0';
}

function renderNodes(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
  visibleNodes: any[],
) {
  const node = nodeLayer
    .selectAll<SVGGElement, any>('g.node')
    .data(visibleNodes, d => getNodeId(d))
    .join(
      enter => {
        const group = enter
          .append('g')
          .attr('class', 'node')
          .style('cursor', 'pointer')
          .style('opacity', 0)
          .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);

        group.each(function (d: any) {
          const selection = d3.select(this);
          const name = d.data?.name ?? 'Node';
          const isFolderFox = d.depth === 0 && name === 'Folder Fox';
          const isIntegration = d.depth === 1 && INTEGRATION_NAMES.includes(name);

          if ((isFolderFox || isIntegration) && LOGO_MAP[name]) {
            const radius = getNodeRadius(d.depth);
            selection
              .append('circle')
              .attr('r', radius)
              .attr('fill', '#fff')
              .attr('stroke', '#ccc')
              .attr('stroke-width', 2);

            selection
              .append('image')
              .attr('href', LOGO_MAP[name])
              .attr('x', -radius * 0.6)
              .attr('y', -radius * 0.6)
              .attr('width', radius * 1.2)
              .attr('height', radius * 1.2)
              .style('pointer-events', 'none');
          } else {
            const radius = getNodeRadius(d.depth);
            const color = getNodeColor(d.depth);

            selection
              .append('circle')
              .attr('r', radius)
              .attr('fill', color)
              .attr('stroke', '#333')
              .attr('stroke-width', 1);

            const maxChars = Math.max(8, Math.floor(radius * 0.8));
            let displayText = name;
            
            if (displayText.length > maxChars) {
              displayText = displayText.slice(0, maxChars - 1) + '…';
            }

            const fontSize = Math.max(7, Math.min(12, radius * 0.55));
            
            selection
              .append('text')
              .attr('text-anchor', 'middle')
              .attr('dy', '0.35em')
              .attr('font-size', fontSize)
              .attr('fill', '#000')
              .attr('pointer-events', 'none')
              .style('word-wrap', 'break-word')
              .style('white-space', 'normal')
              .text(displayText);
          }
        });

        group.append('title').text(d => d.data?.name ?? 'Node');

        return group.transition().duration(300).style('opacity', 1);
      },
      update => update,
      exit => exit.transition().duration(200).style('opacity', 0).remove(),
    );

  node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  return node;
}

// ===== Main Component =====
export const OrbitalMap: React.FC<OrbitalMapProps> = ({ folders }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const gRef = useRef<D3GroupSelection | null>(null);
  const linkLayerRef = useRef<D3GroupSelection | null>(null);
  const nodeLayerRef = useRef<D3GroupSelection | null>(null);
  const physicsRef = useRef<any>(null);

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

  useEffect(() => {
    if (!svgRef.current || !gRef.current || !nodeLayerRef.current || !linkLayerRef.current)
      return;

    const svg = d3.select(svgRef.current);
    const { width, height } = size;

    const root = buildHierarchy(folders);
    const { visibleNodes, visibleLinks } = getVisibleNodesAndLinks(root, expanded);

    svg
      .attr('viewBox', [-width / 2, -height / 2, width, height])
      .attr('width', width)
      .attr('height', height)
      .style('background', 'none');

    const linkLayer = linkLayerRef.current!;
    const nodeLayer = nodeLayerRef.current!;

    const link = linkLayer
      .selectAll<SVGLineElement, any>('line')
      .data(visibleLinks, (d: any) => `${d.source.data.name}-${d.target.data.name}`)
      .join(
        enter => enter.append('line').attr('stroke', '#aaa').attr('stroke-width', 1.2),
        update => update,
        exit => exit.remove(),
      );

    if (physicsRef.current) physicsRef.current.stop();

    let node: any;

    const physics = createManualPhysics(visibleNodes, () => {
      link
        .attr('x1', (d: any) => (d.source as any).x)
        .attr('y1', (d: any) => (d.source as any).y)
        .attr('x2', (d: any) => (d.target as any).x)
        .attr('y2', (d: any) => (d.target as any).y);

      if (node) node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    physicsRef.current = physics;

    node = renderNodes(svg, nodeLayer, visibleNodes).style('pointer-events', 'all');

    node.call(
      d3
        .drag<SVGGElement, any>()
        .on('start', (event: any, d: any) => {
          physics.dragHandlers.onDragStart(d);
        })
        .on('drag', (event: any, d: any) => {
          const svgEl = svgRef.current!;
          const t = d3.zoomTransform(svgEl);
          const [px, py] = t.invert(d3.pointer(event, svgEl));
          physics.dragHandlers.onDrag(d, px, py);
        })
        .on('end', (event: any, d: any) => {
          physics.dragHandlers.onDragEnd(d);
        }) as any
    );

    node.on('dblclick', (event: any, d: any) => {
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

    return () => physics.stop();
  }, [folders, size, expanded]);

  return (
    <div ref={containerRef} className="relative z-10 w-full h-full">
      <svg ref={svgRef}></svg>
    </div>
  );
};