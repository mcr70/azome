
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  QueueItem,
  QueueMessage,
  StorageAccountService
} from '@services/azure/storage-account.service';
import { StorageBrowserBase } from '../storage-browser-base';

@Component({
  selector: 'app-queue-browser',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './queue-browser.component.html',
  styleUrl: '../blob-browser/storage-browser.component.scss'
})
export class QueueBrowserComponent extends StorageBrowserBase implements OnInit, OnDestroy {
  @Input({ required: true }) resourceId = '';

  queues: QueueItem[] = [];
  messages: QueueMessage[] = [];
  queue = '';
  count = 0;
  limit = 10;
  constructor(private readonly storage: StorageAccountService) {
    super();
  }

  ngOnInit(): void {
    this.run(this.storage.listQueues(this.resourceId), (queues) => {
      this.queues = queues;
      if (queues.length > 0) {
        this.selectQueue(queues[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.dispose();
  }

  /**
   * Selects a queue and loads its message count and first peek results.
   * @param name Name of the queue
   */
  selectQueue(name: string): void {
    this.queue = name;
    this.messages = [];
    this.count = 0;
    if (name) {
      this.peek();
    }
  }

  /** Loads the approximate message count and peeks at the requested number of messages. */
  peek(): void {
    if (!this.queue) {
      return;
    }

    const count = Math.max(1, Math.min(32, Number(this.limit) || 10));
    this.limit = count;
    this.run(
      forkJoin({
        count: this.storage.getQueueMessageCount(this.resourceId, this.queue),
        messages: this.storage.peekMessages(this.resourceId, this.queue, count)
      }),
      (result) => {
        this.count = result.count;
        this.messages = result.messages;
      }
    );
  }

  /** Formats a JSON queue message, returning the original text when it is not JSON. */
  formatted(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
}
