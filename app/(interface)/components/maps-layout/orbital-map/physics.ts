import * as d3 from 'd3';

/**
 * Creates a D3 force simulation that keeps Folder Fox in the center,
 * and distributes its 1st-level children (Drive, Dropbox, OneDrive, Notion)
 * evenly spaced around it in orbit.
 */
export function createSimulation(nodes: any[], links: any[]) {
  const simulation = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80).strength(0.3))
    .force('charge', d3.forceManyBody().strength(-150))
    .force('center', d3.forceCenter(0, 0))
    .alphaDecay(0.05);

  simulation.on('tick.orbit', () => {
    const folderFox = nodes.find(n => n.data?.name === 'Folder Fox');
    if (!folderFox) return;

    // Identify integration nodes (direct children)
    const integrations = nodes.filter(
      n =>
        n.parent === folderFox &&
        ['Google Drive', 'Dropbox', 'OneDrive', 'Notion'].includes(n.data?.name),
    );

    if (integrations.length === 0) return;

    const RADIUS = 120; // Distance from Folder Fox
    const angleStep = (2 * Math.PI) / integrations.length;

    integrations.forEach((node, i) => {
      const targetAngle = i * angleStep - Math.PI / 2; // start from top
      const targetX = folderFox.x + Math.cos(targetAngle) * RADIUS;
      const targetY = folderFox.y + Math.sin(targetAngle) * RADIUS;

      // Apply spring-like attraction toward orbit position
      const k = 0.15; // stiffness (controls how strong the orbit force is)
      const damping = 0.9; // damping factor for smoothness

      node.vx = (node.vx ?? 0) * damping + (targetX - node.x) * k;
      node.vy = (node.vy ?? 0) * damping + (targetY - node.y) * k;
    });

    // Keep Folder Fox fixed in the center
    folderFox.fx = 0;
    folderFox.fy = 0;
  });

  return simulation;
}
