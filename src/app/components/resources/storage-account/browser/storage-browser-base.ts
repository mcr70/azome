import { Observable, Subscription } from 'rxjs';

export abstract class StorageBrowserBase {
  loading = false;
  error = '';

  private readonly subscriptions = new Subscription();
  private requestId = 0;

  protected dispose(): void {
    this.requestId++;
    this.subscriptions.unsubscribe();
  }

  protected run<T>(request: Observable<T>, accept: (value: T) => void): void {
    const requestId = ++this.requestId;
    this.loading = true;
    this.error = '';
    this.subscriptions.add(request.subscribe({
      next: (value) => {
        if (requestId === this.requestId) {
          accept(value);
        }
      },
      error: (error) => {
        if (requestId === this.requestId) {
          this.error = this.message(error);
          this.loading = false;
        }
      },
      complete: () => {
        if (requestId === this.requestId) {
          this.loading = false;
        }
      }
    }));
  }

  protected track(subscription: Subscription): void {
    this.subscriptions.add(subscription);
  }

  protected message(error: any): string {
    return error?.error?.error?.message
      || error?.error?.message
      || error?.message
      || 'Storage request failed.';
  }
}
