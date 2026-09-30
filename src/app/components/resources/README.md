# Azure Resource Details

This directory contains shared components and styles for rendering Azure resource details. Resource-specific detail components live under their resource folder.

```text
resources/
├── default-resource-detail.component.*
├── resource-detail-host.component.*
├── resource-details-shared.scss
├── storage-account/
│   ├── storage-account-details.component.*
│   └── browser/
├── cosmosdb/details/
├── keyvault/details/
├── nsg/details/
├── route-table/details/
└── vnet/details/
```

`ResourceDetailHostComponent` selects a resource-specific view through `ResourceDetailRegistryService`. If no view is registered for a resource type, it uses `DefaultResourceDetailComponent`.

Register resource detail components in `src/app/services/azome/resource-detail.registry.ts`.

## Storage account browser

The Storage Account detail view includes a read-only data browser for Blob containers and blobs, Azure Files shares, Queue messages, and Table entities. Its API calls are implemented by `src/app/services/storage-account.service.ts`.

The browser uses the existing Azure Resource Manager scope to list Storage child resources and request short-lived SAS tokens. No Azure Storage OAuth scope is requested. The signed-in identity needs permission to list containers, shares, queues, and tables, and to call `listServiceSas` / `listAccountSas` on the storage account.

Data contents (blob/file paths, queue messages, and table entities) are served by Storage data-plane endpoints using those SAS tokens; ARM has no endpoints for these data operations. SAS tokens are read-only and expire after five minutes. The local proxy avoids browser CORS checks; the account's network rules must still allow the development machine. Storage accounts that disallow Shared Key/SAS authorization cannot use this browser's data views.

For local development, both `ng serve` and `npm start` launch a loopback-only Storage proxy on port 4201 alongside Angular. Angular routes `/storage-proxy/{account}/{service}/...` through `proxy.conf.json`; the proxy only permits GET requests for Blob, File, Queue, and Table endpoints.
