import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ResourceGroupComponent } from './components/resource-group/resource-group.component';
import { MsalGuard } from '@azure/msal-angular';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'rg', component: ResourceGroupComponent, canActivate: [MsalGuard] }, // Resource groups
  { path: '**', redirectTo: '' } // Any undefined route redirects to login
];