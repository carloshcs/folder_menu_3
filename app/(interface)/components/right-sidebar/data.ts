import { buildGoogleDriveTree } from './data-sources/googleDrive';

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

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const createInitialFolders = (): FolderItem[] => {
  const folders = clone(BASE_FOLDERS);
  const googleDrive = folders.find(folder => folder.id === 'googledrive');

  if (googleDrive) {
    googleDrive.children = buildGoogleDriveTree();
  }

  return folders;
};

export const getBaseFolders = (): FolderItem[] => BASE_FOLDERS;

export const SERVICE_IDS = new Set<ServiceId>(SERVICE_ORDER);

export const isServiceId = (id: string): id is ServiceId => SERVICE_IDS.has(id as ServiceId);
