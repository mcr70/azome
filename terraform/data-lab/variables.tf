variable "location" {
  description = "Azure region for data-lab resources"
  type        = string
  default     = "westeurope"
}

variable "resource_group_name" {
  description = "Resource group name for data-lab resources"
  type        = string
  default     = "rg-data-lab"
}
