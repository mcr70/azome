import { Component, Input } from '@angular/core';
import { DiagnosticSetting } from '@services/azure/diagnostic-settings.model';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

@Component({
  selector: 'app-diagnostic-settings-detail',
  standalone: true,
  templateUrl: './diagnostic-settings.component.html',
  styleUrl: './diagnostic-settings.component.scss'
})
export class DiagnosticSettingsComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: DiagnosticSetting | null = null;

  public portalUrl(id: string): string {
    return `https://portal.azure.com/#resource${id.split('/').map(encodeURIComponent).join('/')}`;
  }
}
