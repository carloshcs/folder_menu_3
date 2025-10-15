export function getNodeId(node: any): string {
  if (!node) return '';
  if (typeof node.id === 'string' || typeof node.id === 'number') {
    return String(node.id);
  }
  if (node.data) {
    if (typeof node.data.id === 'string' || typeof node.data.id === 'number') {
      return String(node.data.id);
    }
    if (typeof node.data.name === 'string') {
      return node.data.name;
    }
  }
  return Math.random().toString(36).slice(2);
}
