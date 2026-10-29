import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ResourceGraphDialogService {
  private readonly openRequests = new Subject<void>();

  public readonly openRequests$ = this.openRequests.asObservable();

  public requestOpen(): void {
    this.openRequests.next();
  }
}
