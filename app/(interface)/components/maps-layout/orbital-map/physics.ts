import * as d3 from 'd3';
import { getRadiusByDepth } from './renderUtils';

export interface OrbitLayoutInfo {
  targetX: number;
  targetY: number;
  /** Radius of the orbit this node sits on relative to its parent */
  orbitRadius: number;
  /** Angle relative to parent, in radians */
  angle?: number;
  /** Radius used by this node's children */
  childOrbitRadius?: number;
}

export type OrbitLayout = Map<string, OrbitLayoutInfo>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function getNodeId(node: any) {
  return node.id ?? node.data?.name ?? Math.random().toString(36).slice(2);
}

export function createSimulation(nodes: any[], links: any[], layout: OrbitLayout) {
  const nodeLookup = new Map<string, any>();

  nodes.forEach(node => {
    const id = getNodeId(node);
    node.id = id;
    nodeLookup.set(id, node);

    const layoutInfo = layout.get(id);
    if (layoutInfo) {
      node.x = layoutInfo.targetX;
      node.y = layoutInfo.targetY;
    }
  });

  const linkForce = d3
    .forceLink(links)
    .id((d: any) => getNodeId(d))
    .distance(link => {
      const targetNode = link.target as any;
      const targetId = getNodeId(targetNode);
      const targetLayout = layout.get(targetId);
      const defaultDistance = 140;
      return clamp((targetLayout?.orbitRadius ?? defaultDistance) * 0.9, 80, 400);
    })
    .strength(link => {
      const depth = (link.target as any).depth || 1;
      return clamp(0.55 / depth, 0.08, 0.45);
    });

  const chargeForce = d3
    .forceManyBody()
    .strength(node => {
      if (!node.parent) return -280;
      const parentId = getNodeId(node.parent);
      const parentLayout = layout.get(parentId);
      const orbit = parentLayout?.childOrbitRadius ?? 180;
      // Stronger separation between clusters, softer inside each orbit
      return -clamp(orbit * 0.55, 60, 320);
    });

  const collisionForce = d3
    .forceCollide()
    .radius(node => getRadiusByDepth(node.depth || 1) + 16)
    .strength(0.9)
    .iterations(2);

  const orbitalForce = () => {
    nodes.forEach(node => {
      const id = getNodeId(node);
      const layoutInfo = layout.get(id);
      if (!layoutInfo) return;

      const k = 0.18;
      node.vx += (layoutInfo.targetX - (node.x ?? 0)) * k;
      node.vy += (layoutInfo.targetY - (node.y ?? 0)) * k;

      if (node.parent) {
        const parentId = getNodeId(node.parent);
        const parentLayout = layout.get(parentId);
        const desiredRadius = layoutInfo.orbitRadius || 0;
        if (parentLayout && desiredRadius > 0) {
          const dx = (node.x ?? 0) - parentLayout.targetX;
          const dy = (node.y ?? 0) - parentLayout.targetY;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const delta = distance - desiredRadius;
          const radialStrength = 0.22;
          node.vx -= ((dx / distance) * delta) * radialStrength;
          node.vy -= ((dy / distance) * delta) * radialStrength;
        }
      }
    });
  };
  (orbitalForce as any).initialize = () => {};

  const centerForce = d3.forceCenter(0, 0);

  return d3
    .forceSimulation(nodes)
    .force('link', linkForce)
    .force('charge', chargeForce)
    .force('collision', collisionForce)
    .force('center', centerForce)
    .force('orbital', orbitalForce)
    .alpha(0.95)
    .alphaDecay(0.05);
}
