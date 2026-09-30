# Azure Resource Details

This directory contains the shared components and styles for rendering Azure resource details. Resource-specific detail components live under their resource folder, with each component's TypeScript, template, and styles kept together in its `details/` directory.

```text
resources/
├── default-resource-detail.component.*
├── resource-detail-host.component.*
├── resource-details-shared.scss
├── storage-account/details/
├── cosmosdb/details/
├── keyvault/details/
├── nsg/details/
├── route-table/details/
└── vnet/details/
```

`ResourceDetailHostComponent` selects a resource-specific view through `ResourceDetailRegistryService`. If no view is registered for a resource type, it uses `DefaultResourceDetailComponent`.

Register resource detail components in `src/app/services/azome/resource-detail.registry.ts`.
