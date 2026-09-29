import { ResourceDetailPanelService } from './resource-detail-panel.service';
import { AzureResourceDetail } from '../azure/resource-graph.service';

describe('ResourceDetailPanelService', () => {
  let service: ResourceDetailPanelService;

  const resource = (name: string): AzureResourceDetail => ({
    id: `/subscriptions/test/resourceGroups/rg/providers/Microsoft.Test/resources/${name}`,
    name,
    type: 'microsoft.test/resources',
    resourceGroup: 'rg',
    location: 'westeurope',
    properties: {}
  });

  beforeEach(() => {
    service = new ResourceDetailPanelService();
  });

  it('opens one floating panel and pins it when requested', () => {
    const panelId = service.openPanel(resource('one'));
    expect(service.activePanels.length).toBe(1);
    expect(service.activePanels[0].pinned).toBeFalse();

    service.togglePin(panelId);
    expect(service.activePanels[0].pinned).toBeTrue();
  });

  it('opens a second resource in a pinned compare slot and replaces the oldest after two slots are full', () => {
    const firstId = service.openPanel(resource('one'));
    service.togglePin(firstId);
    const secondId = service.openPanel(resource('two'));

    expect(service.activePanels.length).toBe(2);
    expect(service.activePanels.every((panel) => panel.pinned)).toBeTrue();

    const thirdId = service.openPanel(resource('three'));
    expect(thirdId).toBe(firstId);
    expect(service.activePanels.length).toBe(2);
    expect(service.activePanels.find((panel) => panel.id === firstId)?.resource.name).toBe('three');
    expect(service.activePanels.find((panel) => panel.id === secondId)?.resource.name).toBe('two');
  });

  it('duplicates the first floating panel into two pinned comparison slots', () => {
    const panelId = service.openPanel(resource('one'));
    service.duplicatePanel(panelId);

    expect(service.activePanels.length).toBe(2);
    expect(service.activePanels.every((panel) => panel.pinned)).toBeTrue();
    expect(service.activePanels[0].resource.id).toBe(service.activePanels[1].resource.id);
  });

  it('closes a panel and frees its slot', () => {
    const panelId = service.openPanel(resource('one'));
    service.closePanel(panelId);
    expect(service.activePanels).toEqual([]);
  });
});
