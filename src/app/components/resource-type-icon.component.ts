import { Component, Input } from '@angular/core';
import {
  LucideActivity,
  LucideBoxes,
  LucideDatabase,
  LucideDatabaseZap,
  LucideFolder,
  LucideHardDrive,
  LucideIconData,
  LucideNetwork,
  LucideRadioTower,
  LucideRoute,
  LucideRouter,
  LucideServer,
  LucideShield,
  LucideDynamicIcon
} from '@lucide/angular';

@Component({
  selector: 'app-resource-type-icon',
  standalone: true,
  imports: [LucideDynamicIcon],
  templateUrl: './resource-type-icon.component.html',
  styleUrl: './resource-type-icon.component.scss'
})
export class ResourceTypeIconComponent {
  @Input() type = '';
  @Input() size = 20;

  get icon(): LucideIconData {
    const resourceType = this.type.toLowerCase();

    if (resourceType.includes('resourcegroups') || resourceType === 'resourcegroup') {
      return LucideFolder.icon;
    }
    if (resourceType.includes('/subnets') || resourceType === 'subnet') {
      return LucideRouter.icon;
    }
    if (resourceType.includes('networksecuritygroups') || resourceType.includes('keyvault')) {
      return LucideShield.icon;
    }
    if (resourceType.includes('routetables') || resourceType === 'routetable') {
      return LucideRoute.icon;
    }
    if (resourceType.includes('virtualnetworks') || resourceType === 'vnet') {
      return LucideNetwork.icon;
    }
    if (resourceType.includes('storageaccounts')) {
      return LucideHardDrive.icon;
    }
    if (resourceType.includes('redis') || resourceType.includes('cache')) {
      return LucideDatabaseZap.icon;
    }
    if (resourceType.includes('eventhub') || resourceType.includes('servicebus')) {
      return LucideRadioTower.icon;
    }
    if (resourceType.includes('operationalinsights') || resourceType.includes('workspace')) {
      return LucideActivity.icon;
    }
    if (resourceType.includes('/servers')) {
      return LucideServer.icon;
    }
    if (resourceType.includes('documentdb')
      || resourceType.includes('/databases')
      || resourceType.includes('postgresql')
      || resourceType.includes('mysql')) {
      return LucideDatabase.icon;
    }

    return LucideBoxes.icon;
  }
}
