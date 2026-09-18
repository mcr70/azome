output "resource_group_name" {
  value       = azurerm_resource_group.networking_lab.name
  description = "Resource group containing the networking lab"
}

output "virtual_network_id" {
  value       = azurerm_virtual_network.lab.id
  description = "Resource ID of the networking lab virtual network"
}

output "secondary_virtual_network_id" {
  value       = azurerm_virtual_network.lab_secondary.id
  description = "Resource ID of the secondary networking lab virtual network"
}

output "network_topology" {
  value = {
    virtualNetwork          = azurerm_virtual_network.lab.id
    secondaryVirtualNetwork = azurerm_virtual_network.lab_secondary.id
    subnets = {
      application          = azurerm_subnet.application.id
      data                 = azurerm_subnet.data.id
      secondaryApplication = azurerm_subnet.secondary_application.id
    }
    networkSecurityGroups = {
      application = azurerm_network_security_group.application.id
      data        = azurerm_network_security_group.data.id
    }
    routeTable = azurerm_route_table.data.id
    peerings = {
      labToSecondary = azurerm_virtual_network_peering.lab_to_secondary.id
      secondaryToLab = azurerm_virtual_network_peering.secondary_to_lab.id
    }
  }
  description = "Resource IDs and relationships used by the networking perspective"
}
