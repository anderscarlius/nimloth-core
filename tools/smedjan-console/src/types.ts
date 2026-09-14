export interface TreeEntry {
  path: string;
  name: string;
  isDir: boolean;
  status?: string;
}

export interface TreeResponse {
  intake: TreeEntry[];
  spec: TreeEntry[];
  stories: TreeEntry[];
}

export interface DepNode {
  id: string;
  name: string;
  kind: 'service' | 'package' | 'tool';
}

export interface DepEdge {
  from: string;
  to: string;
}

export interface DepsResponse {
  nodes: DepNode[];
  edges: DepEdge[];
}
