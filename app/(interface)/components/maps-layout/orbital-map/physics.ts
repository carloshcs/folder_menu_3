import * as d3 from 'd3';
import { getRadiusByDepth } from './renderUtils';

/**
 * Structured orbital physics — each parent defines its own angular zone.
 */
export function createSimulation(nodes: any[], links: any[], orbitRadiusStep: number) {
  const angleMap = new Map<string, number>();
  const zoneMap = new Map<string, [number, number]>(); // angular limits per node

  // Get top-level branches (depth=1)
  const topBranches = nodes.filter(n => n.depth === 1);
  const zoneWidth = (2 * Math.PI) / topBranches.length;

  // Assign angular zones for top branches
  topBranches.forEach((branch, i) => {
    const start = i * zoneWidth;
    const end = (i + 1) * zoneWidth;
    zoneMap.set(branch.id, [start, end]);
    angleMap.set(branch.id, (start + end) / 2);
  });

  // Assign children recursively inside parent's zone
  const assignAngles = (node: any) => {
    const [start, end] = zoneMap.get(node.id) || zoneMap.get(node.parent?.id) || [0, 2 * Math.PI];
    const children = node.children || [];
    if (!children.length) return;

    const spread = (end - start) * 0.6; // inner spread for children
    const center = (start + end) / 2;
    const step = spread / (Math.max(children.length - 1, 1));

    children.forEach((child: any, i: number) => {
      const angle = center - spread / 2 + i * step;
      angleMap.set(child.id, angle);
      const childStart = angle - step / 2;
      const childEnd = angle + step / 2;
      zoneMap.set(child.id, [childStart, childEnd]);
      assignAngles(child);
    });
  };

  nodes.filter(n => n.depth === 1).forEach(assignAngles);

  // Compute orbit radius per depth
  const getOrbitRadius = (depth: number) => orbitRadiusStep * 0.6 * depth;

  // Initialize positions
  nodes.forEach((d: any) => {
    const angle = angleMap.get(d.id) ?? Math.random() * 2 * Math.PI;
    const radius = getOrbitRadius(d.depth || 1);
    d.x = (d.parent?.x ?? 0) + radius * Math.cos(angle);
    d.y = (d.parent?.y ?? 0) + radius * Math.sin(angle);
  });

  // Force setup
  const linkForce = d3
    .forceLink(links)
    .id((d: any) => d.id)
    .distance(d => getOrbitRadius(d.target.depth) * 0.7)
    .strength(1);

  const simulation = d3
    .forceSimulation(nodes)
    .force('link', linkForce)
    .force('charge', d3.forceManyBody().strength(-20))
    .force('collision', d3.forceCollide().radius(d => getRadiusByDepth(d.depth) + 4))
    .force('center', d3.forceCenter(0, 0))
    .alphaDecay(0.05);

  // Containment — keep nodes in their angular + radial zone
  const containmentForce = () => {
    nodes.forEach((d: any) => {
      if (!d.parent) return;
      const [zoneStart, zoneEnd] = zoneMap.get(d.id) || [0, 2 * Math.PI];
      const centerAngle = angleMap.get(d.id) ?? (zoneStart + zoneEnd) / 2;
      const targetRadius = getOrbitRadius(d.depth);
      const parent = d.parent;
      const px = parent.x;
      const py = parent.y;
      const targetX = px + targetRadius * Math.cos(centerAngle);
      const targetY = py + targetRadius * Math.sin(centerAngle);

      // attraction
      const k = 0.08;
      d.vx += (targetX - d.x) * k;
      d.vy += (targetY - d.y) * k;

      // radial boundary: prevent orbits crossing
      const dx = d.x - parent.x;
      const dy = d.y - parent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = getOrbitRadius(d.depth) * 0.8;
      if (dist < minDist) {
        d.vx += (dx / dist) * 0.05;
        d.vy += (dy / dist) * 0.05;
      }
    });
  };

  simulation.on('tick', containmentForce);
  return simulation;
}
