import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ResourcesPerspectiveComponent } from './perspectives/resources/resources-perspective.component';
import { NetworkingPerspectiveComponent } from './perspectives/networking/networking-perspective.component';
import { SubnetDetailComponent } from './perspectives/networking/subnet-detail.component';
import { MonitoringPerspectiveComponent } from './perspectives/monitoring/monitoring-perspective.component';
import { DataPerspectiveComponent } from './perspectives/data/data-perspective.component';
import { AppPerspectiveComponent } from './perspectives/app/app-perspective.component';
import { MsalGuard } from '@azure/msal-angular';
import { GovernanceViewComponent } from './perspectives/governance/governance-view.component';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'rg', component: ResourcesPerspectiveComponent, canActivate: [MsalGuard] },
  { path: 'networking', component: NetworkingPerspectiveComponent, canActivate: [MsalGuard] },
  { path: 'monitoring', component: MonitoringPerspectiveComponent, canActivate: [MsalGuard] },
  { path: 'data', component: DataPerspectiveComponent, canActivate: [MsalGuard] },
  { path: 'app', component: AppPerspectiveComponent, canActivate: [MsalGuard] },
  // Keep governance data behind the same sign-in guard as the other perspectives.
  { path: 'governance', component: GovernanceViewComponent, canActivate: [MsalGuard] },
  { path: 'networking/subnets/:subnetId', component: SubnetDetailComponent, canActivate: [MsalGuard] },
  { path: '**', redirectTo: '' } // Any undefined route redirects to login
];
