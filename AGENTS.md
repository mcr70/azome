# Coding
When creating code, if comments are added use always English as a language.

Agents and code generators working on this repository MUST strictly follow standard Angular and TypeScript code formatting rules. Code legibility and clean structure are critical. Never output dense, single-line collapsed code.

## 1. HTML Templates (Angular)

* **Multi-line Formatting:** Every HTML element with child nodes or multiple attributes MUST be formatted on multiple lines with proper indentation (2 spaces).
* **One Element per Line:** Collapse siblings or container blocks into a single line (e.g., `<p>...</p><p>...</p>` or `<button>...</button> <h3>...</h3>`) only, if the line length does not exceed 80..100.
* Try to add element attributes into same line, if it does fit into 100. 
* **Control Flow Directives:** Structural directives (`*ngIf`, `*ngFor` or modern `@if`, `@for`) must be clearly indented on their own lines.
* **Readable Tables & Forms:** Tables, forms, and navigation wrappers must follow standard HTML structural layout.

## 2. TypeScript & Angular Components
Decorator Formatting: The @Component decorator properties (selector, standalone, imports, templateUrl, styleUrl) MUST each be on their own line.

Property Declarations: Declare each property on a separate line. Never stack multiple variable declarations onto a single line.

Method Formatting: Every method body MUST be formatted across multiple lines with proper indentation (2 spaces). Never write inline single-line methods. Write comment
in following format:
```
  /** 
   * Selects a queue and loads its message count and first peek results. 
   * @param name Name of the queue
   */
  selectQueue(name: string): void {
```

Line Length & Whitespace: Keep maximum line length around 100–120 characters. Leave blank lines between class properties and methods.

## 3. SCSS / CSS Styling
One Selector / Property per Line: Always place selectors, CSS rules, and closing braces on separate lines.

No Minified Rules: Never write inline minified CSS rules (e.g., .state { color: #64748b; }.error { color: #b91c1c; }).


# Services
- `src/app/services` folder contains all the services.
- Azure-specific services are in the `azure` subfolder.
- `azome` non-Azure services are in the `azome` subfolder.
- For data-plan requests, create a proxy.conf.json entry for it to bypass
  CORS problems.

> **Rule:** Prefer using Microsoft Graph API over other APIs whenever possible.


# Components

## Resource Details
Main purpose of the resource details is to show metadata of the resource and ARM-level control plane management.

- Azure resource detail components are located in `src/app/components/resource-details`.
- Each resource detail component **must** be registered in `ResourceDetailRegistryService`.
- **Scope & Boundaries:** Resource detail views should focus on essential ARM metadata, tags, JSON representation, and control plane IAM (Azure RBAC). 
- **No Data Plane in Details:** Data-plane operations (such as database *Browse* or document/content exploration) **must not** reside in the general `resource-details` pane. They belong exclusively to perspective-specific views (e.g., the *Data* perspective).
- Omit unnecessary details if they don't add value (a full JSON view is available for inspecting complete raw data).

## Resource card (ResourceCardComponent)
This component provides a shared resource that is used in different 
places where a resource is repesented. It has predefined slots, that 
a calling template can utilize to fill in data to be shown.
- card-title-prefix
- card-header-trailing
- card-actions
- card-metadata
- card-footer

## Other Components
- Keep common/general components separate from resource detail components. Do not mix them in the same directories.


# Perspectives
- Perspectives are located in the `src/app/perspectives` folder.
- Each perspective provides its own targeted view of Azure resources (e.g., Resources, Data, Networking, Monitoring, Applications).
- **Perspective-Specific Actions:** Heavy functional operations—such as database browsing, multi-source log aggregation, or application-specific topologies—should be handled within their respective perspective contexts rather than polluting the general resource details.
- If a perspective requires its own sub components, gather them under the same folder.
- Currently, perspective routing and selection are handled in `app.routes.ts` and `app.component.ts`.


# Terraform
Terraform code is in `terraform/` folder. It is intented to provide a simple setup to create necessary Azure resources to be used with azome.

There are also `terraform/*-lab/ folders, which are used to test different azure resources.
Idea is to use free versions of those resources. 

> **Rule:** If there is a cost involved, always ask before creating such Terraform code.

Each lab should be self-contained, but Terraform state should be placed in the same
Storage account, with lab specific key, like in here for networking-lab:

```
  backend "azurerm" {
    resource_group_name  = "rg-terraform-meta"
    storage_account_name = "azomelabtfstate"
    container_name       = "labtfstate"
    key                  = "networking.tfstate"
  }  
```