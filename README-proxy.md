# Azome Companion Proxy (`azome-proxy`)

The Azome Companion Proxy is a lightweight, on-demand deployable backend extension for the **Azome UI** single-page application. Its primary purpose is to enable secure Data Plane access to Azure resources (such as Cosmos DB, Storage Accounts, and Key Vault) when those resources are isolated from the public internet using **Private Endpoints** and **VNet Integration**.

---

## 1. Architectural Principles & Operating Model
```
+------------------------------------------------------------------------+
| Azome UI (Browser / SPA)                                               |
+------------------------------------------------------------------------+
       │ 
       ├── 1. Control Plane (ARM API: management.azure.com) ──> Azure Resources (Metadata)
       │
       └── 2. Data Plane (When Private Endpoint is enabled)
               │
               ▼ HTTPS / Entra ID Bearer (User Context)
       +-----------------------------------------------------------------+
       | Azome Companion Proxy (Container App / Function)                |
       +-----------------------------------------------------------------+
               │ (Egress VNet Subnet Delegation)
               ▼ Azure VNet / Private Link
       +-----------------------------------------------------------------+
       | Target Resource (Cosmos DB, Storage, etc.)                      |
       +-----------------------------------------------------------------+
```

1. **Zero-Footprint Default:** If target resources are publicly accessible and CORS policies allow, Azome UI operates strictly as a 100% client-side SPA without requiring a proxy.
2. **On-Demand Provisioning:** Azome UI automatically detects VNet-isolated resources and orchestrates step-by-step ARM deployments to provision and configure the proxy dynamically.
3. **Stateless & Transparent:** The proxy does not maintain persistent state, store data, or utilize its own database. It validates requests, verifies the caller's Entra ID token context, and routes traffic within the VNet.
4. **Scale-to-Zero Cost Model:** Built on serverless runtimes like Azure Container Apps (ACA) or Azure Functions (Consumption Plan) to ensure zero operational costs (€0/month) when inactive.

---

## 2. Proxy Scope & Boundaries

### In-Scope Responsibilities
* **VNet Access:** Routes Data Plane traffic through VNet Integration to Private Endpoints (`*.documents.azure.com`, `*.blob.core.windows.net`, etc.).
* **Header & Auth Forwarding:** Passes the caller's Entra ID Bearer token directly through to target data APIs (or utilizes temporary authorization tokens obtained via ARM by the UI).
* **CORS Harmonization:** Provides uniform CORS response headers tailored to the Azome UI App Registration.

### Out-of-Scope (Non-Responsibilities)
* **No Custom Auth Database:** User identity and authorization rely entirely on Entra ID tokens.
* **No Data Caching:** Every request is proxied in real time to the target service.
* **No Payload Transformation:** Returns raw upstream responses directly (passthrough JSON/streams).

---

## 3. UI Discovery & Multi-Stage Provisioning Protocol

Azome UI manages the lifecycle of the Companion Proxy using a phased workflow:
```
+------------------------------------------------------------------------+
| Stage 1: Resource Discovery & Detection                                |
|  • UI queries ARM/ARG for resource network configuration               |
|  • If Private Endpoint is active, UI checks if Proxy exists in RG      |
+------------------------------------------------------------------------+
                                   │
                                   ▼
+------------------------------------------------------------------------+
| Stage 2: Core Proxy Provisioning (ARM Deployment)                      |
|  • UI executes ARM template (assets/arm/companion-proxy.json)          |
|  • Deploys Container App / Function shell with scale-to-zero runtime   |
+------------------------------------------------------------------------+
                                   │
                                   ▼
+------------------------------------------------------------------------+
| Stage 3: VNet & Subnet Discovery                                       |
|  • UI inspects Private Endpoint network details (Target VNet ID)       |
|  • UI queries/validates available Subnets with proper delegation       |
+------------------------------------------------------------------------+
                                   │
                                   ▼
+------------------------------------------------------------------------+
| Stage 4: VNet Integration Binding                                      |
|  • UI executes incremental ARM PATCH / Deployment                      |
|  • Binds Proxy Egress traffic to the target VNet Subnet                |
+------------------------------------------------------------------------+
                                   │
                                   ▼
+------------------------------------------------------------------------+
| Stage 5: Health Check & Traffic Activation                             |
|  • UI probes GET https://<proxy-fqdn>/health                           |
|  • Once 200 OK & VNet bound, UI routes Data Plane queries via Proxy    |
+------------------------------------------------------------------------+
```

### Health Check Endpoint (`GET /health`)
The proxy MUST expose a lightweight health endpoint returning its current network context:
```
{
  "status": "Healthy",
  "version": "1.0.0",
  "vnetIntegration": {
    "enabled": true,
    "subnetId": "/subscriptions/.../subnets/azome-proxy-subnet"
  }
}
```
---

## 4. Infrastructure-as-Code Spec (Bicep / ARM)

When generating Bicep or ARM templates for automated proxy provisioning, AI agents and automation tools MUST adhere to the following spec:

1. **Runtime Specifications:**
   * Azure Container App Environment or Azure Function App.
   * Minimal allocation: `cpu: 0.25`, `memory: 0.5Gi`.
   * Scale-to-zero enabled: `minReplicas: 0`.

2. **VNet Subnet Delegation:**
   * Target subnet must have appropriate delegation enabled: `Microsoft.App/environments` (for Container Apps) or `Microsoft.Web/serverFarms` (for App Service/Functions).

3. **Inbound & Outbound Configuration:**
   * Ingress: `External` (Secured via Entra ID auth or CORS restriction).
   * Egress: Bound to delegated VNet subnet.

---

## 5. Local Development & Setup

To develop and test the proxy locally:
```
# 1. Install dependencies
cd azome-proxy
npm install

# 2. Configure environment variables (.env)
AZURE_TENANT_ID="<your-tenant-id>"
ALLOWED_ORIGIN="http://localhost:4200"

# 3. Start local development server
npm run dev
```

### Local VNet Testing
To simulate Private Endpoint connectivity during local development, connect the host machine to the target Azure VNet using **Azure VPN Client** or an SSH tunnel through a bastion host.

---

## 6. Guidelines for AI Assistants (Codex / Copilot)

> **Instructions for AI Code Generators:**
> 1. Ensure all code written for this repository remains strictly **stateless**.
> 2. Do NOT implement custom user authentication. Always rely on `Authorization: Bearer <token>` pass-through validation.
> 3. Support streaming responses across proxy routes for handling large Cosmos DB query payloads and Azure Blob storage transfers efficiently.
> 4. Separate core infrastructure creation templates from VNet integration binding templates to support phased UI-driven deployment.