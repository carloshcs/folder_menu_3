import * as d3 from 'd3';

export function createSimulation(nodes: any[], links: any[]) {
  const simulation = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80).strength(0.3))
    .force('charge', d3.forceManyBody().strength(-150))
    .force('center', d3.forceCenter(0, 0))
    .alphaDecay(0.05);

  // Track the node currently being dragged
  let draggingNode: any = null;

  // ---- Custom orbit + decoupling logic ----
  simulation.on('tick.orbit', () => {
    const folderFox = nodes.find(n => n.data?.name === 'Folder Fox');
    if (!folderFox) return;

    const integrations = nodes.filter(
      n =>
        n.parent === folderFox &&
        ['Google Drive', 'Dropbox', 'OneDrive', 'Notion'].includes(n.data?.name),
    );

    if (integrations.length === 0) return;

    const RADIUS = 120;
    const angleStep = (2 * Math.PI) / integrations.length;

    integrations.forEach((node, i) => {
      // Skip physics correction if this node is being dragged
      if (node === draggingNode) return;

      const targetAngle = i * angleStep - Math.PI / 2;
      const targetX = folderFox.x + Math.cos(targetAngle) * RADIUS;
      const targetY = folderFox.y + Math.sin(targetAngle) * RADIUS;

      const k = 0.15;
      const damping = 0.9;

      node.vx = (node.vx ?? 0) * damping + (targetX - node.x) * k;
      node.vy = (node.vy ?? 0) * damping + (targetY - node.y) * k;
    });

    folderFox.fx = 0;
    folderFox.fy = 0;
  });

  // ---- Custom drag behavior for secondaries ----
  const drag = d3
    .drag()
    .on('start', (event, d: any) => {
      draggingNode = d;
      if (!event.active) simulation.alphaTarget(0.1).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d: any) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d: any) => {
      draggingNode = null;
      if (!event.active) simulation.alphaTarget(0);
      // Allow the node to return to its orbit position naturally
      d.fx = null;
      d.fy = null;
    });

  // Attach drag only to secondary-level nodes
  simulation.dragBehavior = drag;

  return simulation;
}
