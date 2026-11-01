/**
 * Small shared helpers for the perspective components.
 *
 * Every perspective renders pinned/floating resource detail panels the same way,
 * so the panel selectors live here instead of being repeated in each component.
 */
import { ResourcePanelConfig } from '@services/azome/resource-detail-panel.service';

/**
 * Returns the panels that are pinned into the side-by-side panel slots.
 *
 * @param panels All currently open resource detail panels.
 * @returns Pinned panels in their original order.
 */
export function selectPinnedPanels(panels: ResourcePanelConfig[]): ResourcePanelConfig[] {
  return panels.filter((panel) => panel.pinned);
}

/**
 * Returns the single floating (non-pinned) panel, if one is open.
 *
 * @param panels All currently open resource detail panels.
 * @returns The floating panel or null when every panel is pinned.
 */
export function selectFloatingPanel(panels: ResourcePanelConfig[]): ResourcePanelConfig | null {
  return panels.find((panel) => !panel.pinned) ?? null;
}

/**
 * Returns the short display name of a full Azure resource type, for example
 * "virtualNetworks" for "Microsoft.Network/virtualNetworks".
 *
 * @param fullType Full Azure resource type string.
 * @returns The last type segment, or "Resource" when the type is empty.
 */
export function shortResourceTypeName(fullType: string): string {
  if (!fullType) {
    return 'Resource';
  }

  const parts = fullType.split('/');
  return parts[parts.length - 1] || fullType;
}
