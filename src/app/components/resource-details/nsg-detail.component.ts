import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelVariant, ResourceDetailItem } from '../../services/azome/resource-detail.registry';

export interface NsgRule {
  name: string;
  properties?: {
    priority?: number;
    direction?: string;
    access?: string;
    protocol?: string;
    sourceAddressPrefix?: string;
    sourcePortRange?: string;
    destinationAddressPrefix?: string;
    destinationPortRange?: string;
  };
  isDefault?: boolean;
}

@Component({
  selector: 'app-nsg-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './nsg-detail.component.html',
  styleUrl: './nsg-detail.component.scss'
})
export class NsgDetailComponent implements ResourceDetailItem {
    @Input() resource: any;
    static readonly preferredVariant: PanelVariant = 'wide';

    private get allRules(): NsgRule[] {
        const customRules: NsgRule[] = (this.resource?.properties?.securityRules || []).map((r: any) => ({
            ...r,
            isDefault: false
        }));

        const defaultRules: NsgRule[] = (this.resource?.properties?.defaultSecurityRules || []).map((r: any) => ({
            ...r,
            isDefault: true
        }));

        return [...customRules, ...defaultRules];
    }

    get inboundRules(): NsgRule[] {
        return this.allRules
        .filter(r => r.properties?.direction?.toLowerCase() === 'inbound')
        .sort((a, b) => (a.properties?.priority || 0) - (b.properties?.priority || 0));
    }

    get outboundRules(): NsgRule[] {
        return this.allRules
        .filter(r => r.properties?.direction?.toLowerCase() === 'outbound')
        .sort((a, b) => (a.properties?.priority || 0) - (b.properties?.priority || 0));
    }
}