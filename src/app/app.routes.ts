import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ResourcesPerspectiveComponent } from './perspectives/resources/resources-perspective.component';
import { NetworkingPerspectiveComponent } from './perspectives/networking/networking-perspective.component';
import { SubnetDetailComponent } from './perspectives/networking/subnet-detail.component';
import { MonitoringPerspectiveComponent } from './perspectives/monitoring/monitoring-perspective.component';
import { MsalGuard } from '@azure/msal-angular';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'rg', component: ResourcesPerspectiveComponent, canActivate: [MsalGuard] },
  { path: 'networking', component: NetworkingPerspectiveComponent, canActivate: [MsalGuard] },
  { path: 'monitoring', component: MonitoringPerspectiveComponent, canActivate: [MsalGuard] },
  { path: 'networking/subnets/:subnetId', component: SubnetDetailComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '' } // Any undefined route redirects to login
];
