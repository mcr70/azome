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

## Networking perspective

In networking perspective, network related things are shown.

