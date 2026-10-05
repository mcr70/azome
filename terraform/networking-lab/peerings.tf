resource "azurerm_virtual_network_peering" "_1_to_2" {
  name                      = "peer-first-to-second"
  resource_group_name       = azurerm_resource_group.networking_lab.name
  virtual_network_name      = azurerm_virtual_network.vnet1.name
  remote_virtual_network_id = azurerm_virtual_network.vnet2.id

  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
  use_remote_gateways          = false
}

# Intentionally peering only to one direction
resource "azurerm_virtual_network_peering" "_1_to_3" {
  name                      = "peer-first-to-third"
  resource_group_name       = azurerm_resource_group.networking_lab.name
  virtual_network_name      = azurerm_virtual_network.vnet1.name
  remote_virtual_network_id = azurerm_virtual_network.vnet3.id

  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
  use_remote_gateways          = false
}


resource "azurerm_virtual_network_peering" "_2_to_1" {
  name                      = "peer-second-to-first"
  resource_group_name       = azurerm_resource_group.networking_lab.name
  virtual_network_name      = azurerm_virtual_network.vnet2.name
  remote_virtual_network_id = azurerm_virtual_network.vnet1.id

  allow_virtual_network_access = true
  allow_forwarded_traffic      = false
  allow_gateway_transit        = false
  use_remote_gateways          = false
}

