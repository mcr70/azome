variable "location" {
  description = "Azure region for networking-lab resources"
  type        = string
  default     = "westeurope"
}

variable "resource_group_name" {
  description = "Resource group name for networking-lab resources"
  type        = string
  default     = "rg-azome-networking-lab"
}
