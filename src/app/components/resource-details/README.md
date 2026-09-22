# Azure Resource Details Architecture

This directory implements a dynamic component loading pattern for displaying detailed information about Azure resources in the side panel (`DetailsPanelComponent`).

It decouples generic resource handling from type-specific detail views (e.g., Route Tables, NSGs, VNets), allowing the application to dynamically render custom views or fall back to a generic JSON viewer.

---

## Architecture Overview

```text
[Details Panel]
       │
       ▼
[ResourceDetailHostComponent] ──(Queries)──► [ResourceDetailRegistryService]
       │
       ├─── Registered Type Found? ──► Custom Component (e.g., RouteTableDetailComponent)
       │
       └─── Not Registered? ────────► Fallback Component (DefaultResourceDetailComponent)
```

## File Responsibilities

### Components (src/app/resource-details/)

- `resource-detail-host.component.ts`
  Acts as the dynamic entry point. It uses Angular's `NgComponentOutlet` directive to resolve and instantiate the appropriate component at runtime based on the Azure resource's type field.

- `default-resource-detail.component.ts`
  The fallback component. Displays raw properties formatted as JSON when no specific handler is registered for a resource type.

- `route-table-detail.component.ts`
  A custom detail view specifically designed for `microsoft.network/routetables`. Renders route lists in a clean table format.

- ...

### Registry Service (src/app/services/azome/)
- `resource-detail.registry.ts`
  Manages the mapping between Azure resource type strings (e.g., 'microsoft.network/routetables') and their corresponding Angular Angular components. Register new components in here.