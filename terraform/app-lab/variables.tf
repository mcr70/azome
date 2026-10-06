variable "location" {
  description = "Azure region for data-lab resources"
  type        = string
  default     = "westeurope"
}

variable "resource_group_name" {
  description = "Resource group name for data-lab resources"
  type        = string
  default     = "rg-app-lab"
}

variable "sa_name" {
  description = "Name of the Storage account to hold deployed function"
  type        = string
  default     = "azometestfuncsa2026"
}

variable "func_name" {
  description = "Name of the function app"
  type = string
  default = "azome-test-func-app-2026"
}