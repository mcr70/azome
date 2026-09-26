# Networking Lab

This standalone Terraform configuration creates free Azure networking control-plane resources for developing the Azome Networking Perspective:

- Resource group
- Two peered virtual networks with application and data subnets
- Network security groups associated with both subnets
- Empty route table associated with the data subnet

It intentionally does not create billable workload or edge resources such as virtual machines, public IP addresses, NAT Gateway, Azure Firewall, Application Gateway, VPN Gateway, or private endpoints.

The virtual networks use non-overlapping address spaces (`10.42.0.0/16` and `10.43.0.0/16`) and are connected with bidirectional VNet peering. VNet peering data transfer can incur Azure charges even though the lab does not create workload resources.


## Deploy

1. Authenticate with Azure CLI. Terraform uses the active Azure CLI subscription:

   ```bash
   az login
   ```

2. Initialize, validate, review, and deploy:

   ```bash
   terraform init
   terraform validate
   terraform plan
   terraform apply
   ```

## Remove the lab

Destroy the resources when the prototype is no longer needed:

```bash
terraform destroy
```
