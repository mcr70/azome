export interface PerspectivePreference {
  id: string;
  label: string;
  route: string;
  visible: boolean;
}

export const DEFAULT_PERSPECTIVES: PerspectivePreference[] = [
  { id: 'resources', label: 'Resources', route: '/rg', visible: true },
  { id: 'networking', label: 'Networking', route: '/networking', visible: true },
  { id: 'monitoring', label: 'Monitoring', route: '/monitoring', visible: true },
  { id: 'data', label: 'Data', route: '/data', visible: true },
  { id: 'app', label: 'App', route: '/app', visible: true },
  // Governance stays visible by default so the new dashboard is easy to discover.
  { id: 'governance', label: 'Governance', route: '/governance', visible: true }
];
