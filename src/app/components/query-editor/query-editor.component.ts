import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges
} from '@angular/core';
import type { Extension } from '@codemirror/state';
import type { QueryEditorHandle } from './codemirror-setup';

/**
 * Loads language-specific CodeMirror extensions. A loader (instead of ready-made extensions)
 * lets callers keep CodeMirror modules out of the initial bundle via dynamic import().
 */
export type QueryEditorExtensions = () => Promise<Extension[]>;

@Component({
  selector: 'app-query-editor',
  standalone: true,
  template: `
    @if (!loaded) {
      <div class="query-editor-loading">Loading editor…</div>
    }
  `,
  styleUrl: './query-editor.component.scss'
})
export class QueryEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() value = '';
  @Input() editorId = '';
  @Input() ariaLabel = 'Query editor';
  @Input() extensions?: QueryEditorExtensions;
  @Output() valueChange = new EventEmitter<string>();

  public loaded = false;

  private editor?: QueryEditorHandle;
  private destroyed = false;
  private focusRequested = false;
  private extensionsRequest = 0;
  private readonly ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(
    private host: ElementRef<HTMLElement>,
    private zone: NgZone
  ) {
    this.ready = new Promise((resolve) => this.resolveReady = resolve);
  }

  async ngAfterViewInit(): Promise<void> {
    // The browser caches the module, so CodeMirror is downloaded only on first use.
    const { createQueryEditor } = await import('./codemirror-setup');
    if (this.destroyed) {
      return;
    }

    this.editor = createQueryEditor({
      parent: this.host.nativeElement,
      value: this.value,
      attributes: this.contentAttributes(),
      onChange: (value) => this.zone.run(() => this.valueChange.emit(value))
    });
    this.loaded = true;
    await this.loadExtensions();
    if (this.focusRequested) {
      this.editor.focus();
    }
    this.resolveReady();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editor) {
      return;
    }

    if (changes['value']) {
      this.editor.setValue(this.value);
    }

    if (changes['extensions']) {
      void this.loadExtensions();
    }

    if (changes['editorId'] || changes['ariaLabel']) {
      this.editor.setAttributes(this.contentAttributes());
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.editor?.destroy();
  }

  /**
   * Focuses the editor, or once it has been loaded if loading is still in progress.
   */
  public focus(): void {
    this.focusRequested = true;
    this.editor?.focus();
  }

  /**
   * Resolves when the editor and its initial extensions have been loaded.
   */
  public whenReady(): Promise<void> {
    return this.ready;
  }

  /**
   * Loads the current extensions and applies them unless a newer request has started.
   */
  private async loadExtensions(): Promise<void> {
    const request = ++this.extensionsRequest;
    const extensions = this.extensions ? await this.extensions() : [];
    if (request === this.extensionsRequest && !this.destroyed) {
      this.editor?.setExtensions(extensions);
    }
  }

  /**
   * Builds the attributes of the editable content element.
   */
  private contentAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {
      'aria-label': this.ariaLabel,
      'aria-multiline': 'true',
      spellcheck: 'false'
    };
    if (this.editorId) {
      attributes['id'] = this.editorId;
    }
    return attributes;
  }
}
