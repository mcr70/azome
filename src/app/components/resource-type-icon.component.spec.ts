import { LucideCircleQuestionMark, LucideWorkflow } from '@lucide/angular';
import { ResourceTypeIconComponent } from './resource-type-icon.component';

describe('ResourceTypeIconComponent', () => {
  it('uses the workflow icon for diagnostic settings regardless of type casing', () => {
    const component = new ResourceTypeIconComponent();
    for (const type of [
      'Microsoft.Insights/diagnosticSettings',
      'microsoft.insights/diagnosticsettings'
    ]) {
      component.type = type;
      expect(component.icon).toBe(LucideWorkflow.icon);
    }
  });

  it('keeps the question mark for unknown resource types', () => {
    const component = new ResourceTypeIconComponent();
    component.type = 'unknown/type';
    expect(component.icon).toBe(LucideCircleQuestionMark.icon);
  });
});
