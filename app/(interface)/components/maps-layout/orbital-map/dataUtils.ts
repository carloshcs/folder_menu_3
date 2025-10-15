import type { FolderItem } from '../../right-sidebar/data';
import * as d3 from 'd3';
import { getExpandableNodeId } from '@/app/(interface)/lib/mapUtils/interactions';

interface HierarchyFolder {
  id: string;
  name: string;
  path: string;
  children: HierarchyFolder[];
}

const buildPath = (parentPath: string, name: string) =>
  parentPath ? `${parentPath}/${name}` : name;

export function mapFolderToHierarchy(folder: FolderItem, parentPath = ''): HierarchyFolder {
  const path = buildPath(parentPath, folder.name);
  const children = folder.children
    ? folder.children.map(child => mapFolderToHierarchy(child, path))
    : [];

  return {
    id: folder.id,
    name: folder.name,
    path,
    children,
  };
}

export function buildHierarchy(folders: FolderItem[]) {
  const integrations = ['Google Drive', 'Dropbox', 'OneDrive', 'Notion'];
  const folderFox: HierarchyFolder = {
    id: 'folder-fox',
    name: 'Folder Fox',
    path: 'Folder Fox',
    children: folders.filter(f => integrations.includes(f.name)).map(mapFolderToHierarchy),
  };
  return d3.hierarchy<HierarchyFolder>(folderFox);
}

export function getVisibleNodesAndLinks(root: d3.HierarchyNode<any>, expanded: Set<string>) {
  const allNodes = root.descendants();
  const allLinks = root.links();

  const visibleNodes = allNodes.filter(d => {
    if (d.depth <= 1) return true; // root + integrations
    const parent = d.parent;
    if (!parent) return false;
    const parentKey = parent.data?.path ?? parent.data?.id ?? parent.data?.name;
    if (!parentKey) return false;
    return expanded.has(parentKey);
  });

  const visibleLinks = allLinks.filter(
    d => visibleNodes.includes(d.source) && visibleNodes.includes(d.target),
  );

  return { visibleNodes, visibleLinks };
}
