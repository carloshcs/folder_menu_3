import * as d3 from 'd3';

/**
 * Physics + layout for the orbital map
 * - Folder Fox fixed at the center
 * - Integrations orbit evenly spaced around Folder Fox
 * - Third level and deeper expand along their parent’s vector
 * - Dragging is strictly isolated to each branch
 */
export function createSimulation(nodes: any[]) {
  const folderFox = nodes.find(n => n.data?.name === 'Folder Fox');
  const integrations = nodes.filter(
    n =>
      n.parent === folderFox &&
      ['Google Drive', 'Dropbox', 'OneDrive', 'Notion'].includes(n.data?.name)
  );

  const simulation = d3
    .forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(0))
    .force('center', d3.forceCenter(0, 0))
    .alphaDecay(0.05);

  // --- Folder Fox stays fixed ---
  if (folderFox) {
    folderFox.fx = 0;
    folderFox.fy = 0;
  }

  // --- Layout parameters ---
  const PRIMARY_RADIUS = 120;
  const THIRD_LEVEL_OFFSET = 180;
  const FAN_SPREAD = 25;

  /** Position integrations (second level) evenly around Folder Fox */
  const positionIntegrations = () => {
    if (!folderFox || integrations.length === 0) return;
    const angleStep = (2 * Math.PI) / integrations.length;

    integrations.forEach((node, i) => {
      if (node.isDragging) return;
      const angle = i * angleStep - Math.PI / 2;

      const targetX = folderFox.x + Math.cos(angle) * PRIMARY_RADIUS;
      const targetY = folderFox.y + Math.sin(angle) * PRIMARY_RADIUS;

      const k = 0.15;
      const damp = 0.85;

      node.vx = (node.vx ?? 0) * damp + (targetX - node.x) * k;
      node.vy = (node.vy ?? 0) * damp + (targetY - node.y) * k;
    });
  };

  /** Position third-level (and deeper) folders along their parent direction */
  const positionChildren = () => {
    nodes.forEach(node => {
      const children = node.children ?? [];
      if (children.length === 0) return;

      // Determine base direction for this parent
      const parent = node.parent;
      if (!parent) return;

      const dx = node.x - parent.x;
      const dy = node.y - parent.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      const perpX = -uy;
      const perpY = ux;

      const totalSpread = Math.min(children.length * FAN_SPREAD, 80);
      const start = -totalSpread / 2;
      const step = totalSpread / Math.max(children.length - 1, 1);

      children.forEach((child, i) => {
        if (child.isDragging) return;

        const offset = start + i * step;
        const dist = parent === folderFox ? PRIMARY_RADIUS : THIRD_LEVEL_OFFSET;

        const targetX = node.x + ux * dist + perpX * offset;
        const targetY = node.y + uy * dist + perpY * offset;

        const k = 0.25;
        const damp = 0.85;
        child.vx = (child.vx ?? 0) * damp + (targetX - child.x) * k;
        child.vy = (child.vy ?? 0) * damp + (targetY - child.y) * k;
      });
    });
  };

  /** Simulation tick logic */
  simulation.on('tick.orbit', () => {
    positionIntegrations();
    positionChildren();
  });

  /** Smooth, isolated drag — affects only direct children */
  const drag = d3
    .drag()
    .on('start', (event, d: any) => {
      if (!event.active) simulation.alphaTarget(0.12).restart();
      d.fx = d.x;
      d.fy = d.y;
      d.isDragging = true;

      // Freeze everything except this node and its children
      nodes.forEach(n => {
        const isChild = n.parent === d;
        const isSelf = n === d;
        if (!isSelf && !isChild) {
          n.vx = 0;
          n.vy = 0;
        }
      });
    })
    .on('drag', (event, d: any) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d: any) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
      d.isDragging = false;
    });

  simulation.dragBehavior = drag;

  return simulation;
}
