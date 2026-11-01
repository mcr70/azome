import { ResourcePanelConfig } from '@services/azome/resource-detail-panel.service';
import {
  selectFloatingPanel,
  selectPinnedPanels,
  shortResourceTypeName
} from './perspective-utils';

describe('perspective-utils', () => {
  const panel = (id: string, pinned: boolean): ResourcePanelConfig =>
    ({ id, pinned } as ResourcePanelConfig);

  describe('selectPinnedPanels', () => {
    it('returns only pinned panels in their original order', () => {
      const pinnedA = panel('a', true);
      const pinnedB = panel('b', true);
      const floating = panel('c', false);

      expect(selectPinnedPanels([pinnedA, floating, pinnedB])).toEqual([pinnedA, pinnedB]);
      expect(selectPinnedPanels([])).toEqual([]);
    });
  });

  describe('selectFloatingPanel', () => {
    it('returns the first non-pinned panel or null', () => {
      const pinned = panel('a', true);
      const floating = panel('b', false);

      expect(selectFloatingPanel([pinned, floating])).toBe(floating);
      expect(selectFloatingPanel([pinned])).toBeNull();
      expect(selectFloatingPanel([])).toBeNull();
    });
  });

  describe('shortResourceTypeName', () => {
    it('returns the last segment of a full resource type', () => {
      expect(shortResourceTypeName('Microsoft.Network/virtualNetworks')).toBe('virtualNetworks');
      expect(shortResourceTypeName('Microsoft.Sql/servers/databases')).toBe('databases');
    });

    it('falls back for empty or malformed types', () => {
      expect(shortResourceTypeName('')).toBe('Resource');
      expect(shortResourceTypeName('Microsoft.Web/')).toBe('Microsoft.Web/');
      expect(shortResourceTypeName('plain')).toBe('plain');
    });
  });
});
