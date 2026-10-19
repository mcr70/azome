# Perspectices

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

Show Azure activity logs and other log sources.

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
