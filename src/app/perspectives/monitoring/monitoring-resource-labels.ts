/**
 * Display names for the Azure resource types shown in the Monitoring perspective.
 */

const MONITORING_RESOURCE_TYPE_LABELS: Record<string, string> = {
  'microsoft.insights/actiongroups': 'Action groups',
  'microsoft.insights/activitylogalerts': 'Activity log alerts',
  'microsoft.insights/autoscalesettings': 'Autoscale settings',
  'microsoft.insights/components': 'Application Insights',
  'microsoft.insights/datacollectionendpoints': 'Data collection endpoints',
  'microsoft.insights/datacollectionrules': 'Data collection rules',
  'microsoft.insights/diagnosticsettings': 'Diagnostic settings',
  'microsoft.insights/logprofiles': 'Log profiles',
  'microsoft.insights/metricalerts': 'Metric alerts',
  'microsoft.insights/scheduledqueryrules': 'Scheduled query rules',
  'microsoft.insights/smartdetectoralertrules': 'Smart detector alert rules',
  'microsoft.insights/webtests': 'Availability tests',
  'microsoft.insights/workbooks': 'Workbooks',
  'microsoft.alertsmanagement/actionrules': 'Alert processing rules',
  'microsoft.dashboard/grafana': 'Azure Managed Grafana',
  'microsoft.operationalinsights/dataexports': 'Data exports',
  'microsoft.operationalinsights/savedsearches': 'Saved searches',
  'microsoft.operationalinsights/workspaces': 'Log Analytics workspaces'
};

/**
 * Returns the display label for a monitoring resource type.
 *
 * @param type Full Azure resource type, in any casing.
 * @returns A friendly label, or the last type segment when the type is unknown.
 */
export function monitoringResourceTypeLabel(type: string): string {
  return MONITORING_RESOURCE_TYPE_LABELS[type.toLowerCase()] ?? type.split('/').pop() ?? type;
}
