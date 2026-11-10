import { Component, Input, Optional } from '@angular/core';
import { catchError, of, take } from 'rxjs';
import { environment } from '@environments/environment';
import { KqlComponent } from '@components/kql/kql.component';
import {
  DiagnosticCategory,
  DiagnosticDestination,
  DiagnosticSetting
} from '@services/azure/diagnostic-settings.model';
import { ResourceGraphApiService } from '@services/azure/resource-graph-api.service';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

@Component({
  selector: 'app-diagnostic-settings-detail',
  standalone: true,
  imports: [
    KqlComponent
  ],
  templateUrl: './diagnostic-settings.component.html',
  styleUrl: './diagnostic-settings.component.scss'
})
export class DiagnosticSettingsComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: DiagnosticSetting | null = null;

  public kqlDialogOpen = false;

  public kqlWorkspaceId = '';

  public kqlWorkspaceName = '';

  public kqlTargetResource: SelectedAzureResource | null = null;

  public kqlTargetCategory: string | null = null;

  constructor(
    @Optional() private readonly resourceGraphApi?: ResourceGraphApiService
  ) {}

  /**
   * Resolves the Log Analytics workspace destination for a diagnostic setting if configured.
   *
   * @param setting Diagnostic setting to inspect.
   * @returns Configured Log Analytics destination, or undefined if none exists.
   */
  public logAnalyticsDestination(setting: DiagnosticSetting): DiagnosticDestination | undefined {
    return setting.destinations.find((destination) =>
      destination.label === 'Log Analytics workspace'
    );
  }

  /**
   * Checks whether the diagnostic setting has an active Log Analytics workspace destination.
   *
   * @param setting Diagnostic setting to inspect.
   * @returns True if a Log Analytics workspace destination is configured.
   */
  public hasLogAnalyticsDestination(setting: DiagnosticSetting): boolean {
    return Boolean(this.logAnalyticsDestination(setting));
  }

  /**
   * Opens the Log Analytics workspace KQL editor prefilled for the source resource and log category.
   *
   * @param setting Diagnostic setting containing the source resource and destinations.
   * @param log Diagnostic log entry clicked by the user.
   * @param event Optional event to prevent default behavior when triggered from an interactive element.
   */
  public openLogQuery(setting: DiagnosticSetting, log: DiagnosticCategory, event?: Event): void {
    event?.preventDefault();
    const destination = this.logAnalyticsDestination(setting);
    if (!destination || !log.enabled) {
      return;
    }

    const rawWorkspaceId = setting.properties.workspaceId || destination.id;
    this.kqlWorkspaceName = destination.name;
    this.kqlTargetResource = {
      id: setting.source.id,
      name: setting.source.name,
      type: setting.source.type,
      resourceGroup: setting.source.resourceGroup ?? ''
    };
    this.kqlTargetCategory = log.categoryGroup ?? log.category ?? null;

    this.resolveAndOpenWorkspace(rawWorkspaceId, destination.name);
  }

  /**
   * Closes the KQL dialog and clears the active query parameters.
   */
  public closeKqlDialog(): void {
    this.kqlDialogOpen = false;
    this.kqlWorkspaceId = '';
    this.kqlWorkspaceName = '';
    this.kqlTargetResource = null;
    this.kqlTargetCategory = null;
  }

  /**
   * Resolves the Log Analytics workspace customerId from ARM resource ID when necessary, then opens the dialog.
   *
   * @param rawWorkspaceId Workspace identifier or ARM resource ID.
   * @param fallbackName Fallback workspace display name.
   */
  private resolveAndOpenWorkspace(rawWorkspaceId: string, fallbackName: string): void {
    const isGuid = /^[0-9a-fA-F-]{36}$/.test(rawWorkspaceId);
    if (isGuid || !rawWorkspaceId.startsWith('/')) {
      this.kqlWorkspaceId = rawWorkspaceId;
      this.kqlDialogOpen = true;
      return;
    }

    if (!this.resourceGraphApi) {
      this.kqlWorkspaceId = fallbackName || rawWorkspaceId;
      this.kqlDialogOpen = true;
      return;
    }

    const subMatch = rawWorkspaceId.match(/\/subscriptions\/([^/]+)/i);
    const subscriptionId = subMatch ? subMatch[1] : environment.azure.subscriptionId;
    const safeId = rawWorkspaceId.replace(/'/g, "\\'");

    this.resourceGraphApi.query<{ data?: { name?: string; customerId?: string }[] }>({
      subscriptions: [subscriptionId],
      query: `Resources | where id =~ '${safeId}' | project name, customerId = tostring(properties.customerId)`
    }).pipe(
      take(1),
      catchError(() => of({ data: [] }))
    ).subscribe({
      next: (response) => {
        const found = response.data?.[0];
        this.kqlWorkspaceId = found?.customerId || fallbackName || rawWorkspaceId;
        if (found?.name) {
          this.kqlWorkspaceName = found.name;
        }
        this.kqlDialogOpen = true;
      },
      error: () => {
        this.kqlWorkspaceId = fallbackName || rawWorkspaceId;
        this.kqlDialogOpen = true;
      }
    });
  }
}
