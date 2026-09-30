import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import {
  QueueItem,
  QueueMessage,
  StorageAccountService
} from '../../../../../services/azure/storage-account.service';

@Component({
  selector: 'app-queue-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './queue-browser.component.html',
  styleUrl: '../blob-browser/storage-browser.component.scss'
})
export class QueueBrowserComponent implements OnInit, OnDestroy {
  @Input({ required: true }) resourceId = '';

  queues: QueueItem[] = [];
  messages: QueueMessage[] = [];
  queue = '';
  count = 0;
  limit = 10;
  loading = false;
  error = '';

  private readonly subs = new Subscription();
  private requestId = 0;

  constructor(private readonly storage: StorageAccountService) {}

  ngOnInit(): void {
    this.run(this.storage.listQueues(this.resourceId), (queues) => {
      this.queues = queues;
      if (queues.length > 0) {
        this.selectQueue(queues[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  selectQueue(name: string): void {
    this.queue = name;
    this.messages = [];
    this.count = 0;
    if (name) {
      this.peek();
    }
  }

  peek(): void {
    if (!this.queue) {
      return;
    }

    const count = Math.max(1, Math.min(32, Number(this.limit) || 10));
    this.limit = count;
    this.loading = true;
    this.error = '';
    this.subs.add(this.storage.getQueueMessageCount(this.resourceId, this.queue).subscribe({
      next: (value) => this.count = value,
      error: (error) => this.error = this.message(error)
    }));
    this.run(this.storage.peekMessages(this.resourceId, this.queue, count), (messages) => {
      this.messages = messages;
    });
  }

  formatted(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  private run<T>(request: Observable<T>, accept: (value: T) => void): void {
    const requestId = ++this.requestId;
    this.loading = true;
    this.error = '';
    this.subs.add(request.subscribe({
      next: (value) => accept(value),
      error: (error) => {
        this.error = this.message(error);
        this.loading = false;
      },
      complete: () => {
        if (requestId === this.requestId) {
          this.loading = false;
        }
      }
    }));
  }

  private message(error: any): string {
    return error?.error?.error?.message
      || error?.error?.message
      || error?.message
      || 'Storage request failed.';
  }
}
