import type React from 'react';
import {
  D3DragEvent,
  Selection,
  drag,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3';

export const enableNodeDrag = <T extends SimulationNodeDatum>(
  simulation: Simulation<T, undefined>,
  nodeSelection: Selection<SVGGElement | SVGCircleElement, T, any, unknown>,
) => {
  const dragBehaviour = drag<SVGGElement | SVGCircleElement, T>()
    .on('start', (event: D3DragEvent<Element, T, T>, node) => {
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }

      node.fx = node.x ?? event.x;
      node.fy = node.y ?? event.y;
    })
    .on('drag', (event: D3DragEvent<Element, T, T>, node) => {
      node.fx = event.x;
      node.fy = event.y;
    })
    .on('end', (event: D3DragEvent<Element, T, T>, node) => {
      if (!event.active) {
        simulation.alphaTarget(0);
      }

      node.fx = null;
      node.fy = null;
    });

  nodeSelection.call(dragBehaviour as any);
};

export type ExpandableNodeLike = {
  id?: string | number;
  data?: {
    path?: string | number;
    id?: string | number;
    name?: string | number;
  };
  children?: Array<ExpandableNodeLike | any>;
  descendants?: () => Array<ExpandableNodeLike | any>;
};

export const getExpandableNodeId = (node: ExpandableNodeLike | undefined | null): string | undefined => {
  if (!node) {
    return undefined;
  }

  if (node.id !== undefined && node.id !== null) {
    return String(node.id);
  }

  const data = (node as { data?: ExpandableNodeLike['data'] }).data;
  if (data) {
    if (data.path !== undefined && data.path !== null) {
      return String(data.path);
    }
    if (data.id !== undefined && data.id !== null) {
      return String(data.id);
    }
    if (data.name !== undefined && data.name !== null) {
      return String(data.name);
    }
  }

  return undefined;
};

const collectDescendantIds = (
  node: ExpandableNodeLike | undefined,
  accumulator: Set<string>,
  currentNodeId?: string,
) => {
  if (!node) {
    return;
  }

  if (typeof node.descendants === 'function') {
    const allDescendants = node.descendants();
    allDescendants.forEach(descendant => {
      const descendantId = getExpandableNodeId(descendant);
      if (descendantId && descendantId !== currentNodeId) {
        accumulator.add(descendantId);
      }
    });
    return;
  }

  const children = node.children as ExpandableNodeLike[] | undefined;
  if (!children?.length) {
    return;
  }

  children.forEach(child => {
    const childId = getExpandableNodeId(child);
    if (childId) {
      accumulator.add(childId);
    }
    collectDescendantIds(child, accumulator, currentNodeId);
  });
};

export const handleNodeDoubleClick = (
  node: ExpandableNodeLike | undefined,
  setExpandedState: React.Dispatch<React.SetStateAction<Set<string>>>,
) => {
  const nodeId = getExpandableNodeId(node);
  if (!nodeId) {
    return;
  }

  setExpandedState(previous => {
    const next = new Set(previous);

    if (next.has(nodeId)) {
      next.delete(nodeId);
      const descendants = new Set<string>();
      collectDescendantIds(node, descendants, nodeId);
      descendants.forEach(id => next.delete(id));
      return next;
    }

    next.add(nodeId);
    return next;
  });
};
