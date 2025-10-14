export interface FolderMetrics {
  totalSize?: number;
  fileCount?: number;
  folderCount?: number;
}

export interface FolderItem {
  id: string;
  name: string;
  isOpen: boolean;
  isSelected: boolean;
  children?: FolderItem[];
  metrics?: FolderMetrics;
}

export interface SuppressedFolder {
  id: string;
  name: string;
  path: string;
}

export type ServiceId = 'notion' | 'onedrive' | 'dropbox' | 'googledrive';

export const SERVICE_ORDER: ServiceId[] = ['notion', 'onedrive', 'dropbox', 'googledrive'];

const BASE_FOLDERS: FolderItem[] = [
  {
    id: 'notion',
    name: 'Notion',
    isOpen: false,
    isSelected: true
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    isOpen: false,
    isSelected: true
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    isOpen: false,
    isSelected: true
  },
  {
    id: 'googledrive',
    name: 'Google Drive',
    isOpen: true,
    isSelected: true
  }
];

const clone = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

let googleDriveTreeCache: FolderItem[] | null = null;
let baseFoldersCache: FolderItem[] | null = null;

const buildBaseFolders = (): FolderItem[] => {
  const folders = clone(BASE_FOLDERS);

  if (googleDriveTreeCache && googleDriveTreeCache.length > 0) {
    const googleDrive = folders.find(folder => folder.id === 'googledrive');

    if (googleDrive) {
      googleDrive.children = clone(googleDriveTreeCache);
    }
  }

  return folders;
};

const ensureBaseFoldersCache = (): FolderItem[] => {
  if (!baseFoldersCache) {
    baseFoldersCache = buildBaseFolders();
  }

  return baseFoldersCache;
};

export const createInitialFolders = (): FolderItem[] => clone(ensureBaseFoldersCache());

export const getBaseFolders = (): FolderItem[] => ensureBaseFoldersCache();

export const loadGoogleDriveTree = async (): Promise<FolderItem[]> => {
  if (googleDriveTreeCache) {
    return clone(googleDriveTreeCache);
  }

  const module = await import('./data-sources/googleDrive');
  const tree = module.buildGoogleDriveTree();

  googleDriveTreeCache = tree;
  baseFoldersCache = buildBaseFolders();

  return clone(tree);
};

export const SERVICE_IDS = new Set<ServiceId>(SERVICE_ORDER);

export const isServiceId = (id: string): id is ServiceId => SERVICE_IDS.has(id as ServiceId);
