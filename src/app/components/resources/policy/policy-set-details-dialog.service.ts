/** Coordinates opening the standalone Policy Set details dialog from policy views. */
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PolicySetDetailsDialogService {
  public readonly policySetId = signal<string | null>(null);

  /** Opens the dialog for a valid Azure Policy Set definition resource ID. */
  public open(policySetId: string | null | undefined): boolean {
    const definitionId = policySetId?.trim();
    if (!definitionId) {
      return false;
    }

    this.policySetId.set(definitionId);
    return true;
  }

  /** Closes the Policy Set dialog and clears its current selection. */
  public close(): void {
    this.policySetId.set(null);
  }
}
