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
  @Input() @HostBinding('class.open') isOpen: boolean = false;

  @Output() close = new EventEmitter<void>();
}