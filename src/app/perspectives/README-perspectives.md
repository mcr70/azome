# Perspectices

## Resource selection

Click a resource card to select it or remove its selection. Selectable cards show
a subtle background highlight on hover, and their selection button also supports
keyboard activation. Details, browse links and other controls inside a card keep
their own actions without changing selection.

Each card grid has a selection checkbox in its header after the metadata, for its
currently visible resources. It is unchecked when none are selected, indeterminate
when some are selected, and checked when all are selected. Clicking an unchecked
or indeterminate checkbox selects all; clicking a checked checkbox deselects all.
Other grids' selections are preserved. The **Selected resources** summary and
**Clear selection** action are shared across perspectives. Activity log resource checkboxes are always available;
opening an event still shows its details.

The selection summary sits in the perspective heading next to Refresh (or in the
same heading area in Resources, which has no Refresh button). By default it shows
only the selection count. Clicking it opens a floating resource list, keeping the
content below stable. Each resource has a red remove button to deselect it.
Resource names scroll to the corresponding card; Clear selection removes all
selections. Escape, the close button or clicking outside closes the list.

## Resources perspective

This perspective is most similar with traditinal Azure UI. In that it list
resources through resource groups.

## App perspective

The **Categories** tab groups application infrastructure by category and resource
type. The **Apps** tab queries Azure Resource Graph for any resource with a
non-empty `azome-apps` tag, including data resources such as Cosmos DB accounts.
Each comma-separated app name creates a separate app box. For example,
`azome-apps = Orders, Reporting` includes the resource in both apps. Names are
trimmed, empty entries are ignored, and repeated names within a tag are deduplicated.
App names are case-sensitive.

The shared filter supports app names (in Apps), resource groups, resource names,
and resource kinds. All search terms must match; prefix a term with `!` to exclude
it. Matching an app name shows its resources; resource-level matches show only
matching members. Selection and resource details work in both tabs, and Refresh
reloads the active tab. Tags are read from resources, not inherited from resource
groups or subscriptions.

## Data perspective

Data perspective is used for listing and working with data related resources
like storage accounts, NoSQL databases, RDS databases and alike.

## Monitoring perspective

The Monitoring perspective includes an Azure Monitor Metrics view. Auto-Metrics
uses resource-specific metric profiles when available and falls back to metric
definitions from Azure Monitor for other resource types. Metrics are grouped
inside a card for each resource. Metric Explorer lets you compare one or more
shared metrics across selected resources and choose a common aggregation. Both
views support 1-hour, 6-hour, 24-hour, 7-day, and 30-day time ranges.

Open `/monitoring/metrics?resourceId=<resource-id>` to resolve and display a
resource in Metric Explorer, with only that resource selected. The user chooses
which metrics to query. This does not change the shared resource selection. The
Metrics tab also uses resources already selected elsewhere in the application.
Use **Find resources** in Metric Explorer to open the shared Resource Graph
tool. Select individual query results or add all selectable results to the
shared resource selection for use across perspectives.

Monitoring resource inventory and Activity Log requests load independently so
a slow Activity Log response does not delay the resource views.

The perspective also shows Azure activity logs and other log sources.

Overview lists diagnostic settings in a separate group using the shared resource
cards. Source-to-destination connections are shown in the resource detail pane,
not on the cards. Discovery uses paginated Resource Graph inventory followed by ARM
diagnostic-settings requests (at most six concurrent). It includes the subscription,
discovered resources, and Storage blob/file/queue/table service
children. It is limited to the configured subscription and resources visible to the
signed-in identity; resources not present in inventory cannot be discovered.
Resource containers are not queried: resource groups do not support diagnostic settings.
Known unsupported Network Watcher and route table resources are excluded before ARM
requests. Other resource types remain eligible so that metric-only settings are not
excluded by a log-only allowlist. Explicit ARM unsupported-type responses are also
skipped. Other failures are listed and successful results remain visible.
The filter also matches source and destination IDs and Event Hub names.
Details show configured routing and log/metric categories, not actual delivery.

## Networking perspective

In networking perspective, network related things are shown.
