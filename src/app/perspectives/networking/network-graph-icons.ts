import { NetworkGraphNodeKind } from './network-graph.model';

// Small original pictograms per resource kind, deliberately distinct from any vendor icon set.
const ICON_MARKUP: Record<NetworkGraphNodeKind, string> = {
  vnet: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect x="4" y="4" width="56" height="56" rx="10" fill="#0f766e"/>
      <circle cx="32" cy="18" r="6" fill="#ccfbf1"/>
      <circle cx="18" cy="44" r="6" fill="#ccfbf1"/>
      <circle cx="46" cy="44" r="6" fill="#ccfbf1"/>
      <path d="M32 24 L20 39 M32 24 L44 39 M22 44 L42 44" stroke="#ccfbf1" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`,
  subnet: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect x="6" y="6" width="52" height="52" rx="8" fill="#14b8a6"/>
      <rect x="18" y="18" width="28" height="28" rx="4" fill="none" stroke="#f0fdfa" stroke-width="3" stroke-dasharray="5 4"/>
      <circle cx="32" cy="32" r="5" fill="#f0fdfa"/>
    </svg>`,
  networkSecurityGroup: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path d="M32 5 L54 14 V30 C54 45 44 55 32 59 C20 55 10 45 10 30 V14 Z" fill="#f59e0b"/>
      <path d="M22 32 L29 39 L43 24" stroke="#fffbeb" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  routeTable: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="28" fill="#6366f1"/>
      <path d="M32 14 V50 M32 14 L25 21 M32 14 L39 21" stroke="#eef2ff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 32 H48" stroke="#eef2ff" stroke-width="4" stroke-linecap="round"/>
    </svg>`
};

export function iconDataUri(kind: NetworkGraphNodeKind): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(ICON_MARKUP[kind])}`;
}
