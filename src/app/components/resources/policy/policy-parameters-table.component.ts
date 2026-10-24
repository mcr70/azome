/** Renders Azure Policy parameter definitions in the shared policy details table with search, pagination, and deprecated badge support. */
import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PolicyParameterDefinition {
  type?: string;
  metadata?: {
    displayName?: string;
    description?: string;
  };
  defaultValue?: unknown;
  allowedValues?: unknown[];
}

@Component({
  selector: 'app-policy-parameters-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './policy-parameters-table.component.html',
  styleUrl: './policy-parameters-table.component.scss'
})
export class PolicyParametersTableComponent {
  private readonly definitions = signal<Record<string, PolicyParameterDefinition>>({});
  
  public readonly expandedParameterName = signal<string | null>(null);
  public readonly filter = signal<string>('');
  public readonly page = signal<number>(0);
  public readonly pageSize = 10;

  @Input() public title = 'Policy Parameters';

  @Input()
  public set parameters(value: Record<string, PolicyParameterDefinition> | null | undefined) {
    this.definitions.set(value ?? {});
    this.page.set(0);
  }

  public readonly parsedRows = computed(() => Object.entries(this.definitions())
    .map(([name, definition]) => {
      const rawName = definition.metadata?.displayName || name;
      const isDeprecated = rawName.startsWith('[Deprecated]');
      const displayName = isDeprecated ? rawName.replace(/^\[Deprecated\]:\s*/, '') : rawName;

      return {
        name,
        displayName,
        isDeprecated,
        type: definition.type || 'Not specified',
        defaultValue: definition.defaultValue,
        allowedValues: definition.allowedValues,
        description: definition.metadata?.description || ''
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
  );

  public readonly filteredRows = computed(() => {
    const query = this.filter().toLowerCase().trim();
    const rows = this.parsedRows();
    if (!query) return rows;

    return rows.filter(row => 
      row.displayName.toLowerCase().includes(query) ||
      row.name.toLowerCase().includes(query) ||
      row.description.toLowerCase().includes(query) ||
      row.type.toLowerCase().includes(query)
    );
  });

  public readonly pageCount = computed(() => Math.ceil(this.filteredRows().length / this.pageSize) || 1);

  public readonly visibleRows = computed(() => {
    const start = this.page() * this.pageSize;
    return this.filteredRows().slice(start, start + this.pageSize);
  });

  public updateFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filter.set(value);
    this.page.set(0);
  }

  public clearFilter(): void {
    this.filter.set('');
    this.page.set(0);
  }

  public previousPage(): void {
    if (this.page() > 0) {
      this.page.update(p => p - 1);
    }
  }

  public nextPage(): void {
    if (this.page() < this.pageCount() - 1) {
      this.page.update(p => p + 1);
    }
  }

  /** Formats scalar values directly and arrays or objects as readable JSON. */
  public formatValue(value: unknown): string {
    if (value === undefined) {
      return 'Not specified';
    }
    if (value === null) {
      return 'null';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value, null, 2) ?? 'Not specified';
  }


  public toggleRow(parameterName: string): void {
    if (this.expandedParameterName() === parameterName) {
      this.expandedParameterName.set(null);
    } else {
      this.expandedParameterName.set(parameterName);
    }
  }

  // Apufunktio yksittäisen parametrin JSON-muotoiluun
  public getRawJsonFor(parameter: any): string {
    const rawObj = {
      [parameter.name]: {
        type: parameter.type !== 'Not specified' ? parameter.type : undefined,
        metadata: {
          displayName: parameter.displayName,
          description: parameter.description || undefined
        },
        defaultValue: parameter.defaultValue,
        allowedValues: parameter.allowedValues?.length ? parameter.allowedValues : undefined
      }
    };
    return JSON.stringify(rawObj, null, 2);
  }  
}