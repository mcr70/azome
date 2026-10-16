import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-text-filter',
  standalone: true,
  templateUrl: './text-filter.component.html',
  styleUrl: './text-filter.component.scss'
})
export class TextFilterComponent {
  @Input() label = 'Filter';
  @Input() placeholder = 'Search terms separated by spaces';
  @Input() query = '';
  @Output() queryChange = new EventEmitter<string>();

  public onInput(value: string): void {
    this.queryChange.emit(value);
  }
}
