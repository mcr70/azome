import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-details-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './details-panel.component.html',
  styleUrl: './details-panel.component.scss'
})
export class DetailsPanelComponent {
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() variant: 'default' | 'wide' | 'content' = 'default';
  @Input() @HostBinding('class.open') isOpen: boolean = false;
  @Input() @HostBinding('class.pinned') pinned = false;
  @Input() showPanelActions = false;
  @Input() canDuplicate = true;

  @Output() close = new EventEmitter<void>();
  @Output() togglePin = new EventEmitter<void>();
  @Output() duplicate = new EventEmitter<void>();
}
