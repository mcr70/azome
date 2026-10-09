import { Component } from '@angular/core';

import { AuthService } from '@services/azome/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'] 
})
export class LoginComponent {
  constructor(public auth: AuthService) {}
}