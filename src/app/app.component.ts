import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from './services/azome/auth.service';
import { ProfileService } from './services/azure/profile.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet], 
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  public activeUserEmail: string | null = null;
  public userName: string | null = null; 
  private readonly destroy$ = new Subject<void>();

  constructor(
    public auth: AuthService,
    private azure: ProfileService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Listen for authentication state changes and react accordingly
    this.auth.isAuthenticated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isAuth) => {
        if (isAuth) {
          this.loadAzureData(); // Haetaan profiili yläpalkkia varten
          this.router.navigate(['/rg']); // Ohjataan resurssiryhmisivulle
        } else {
          this.userName = null;
          this.activeUserEmail = null;
          this.router.navigate(['/']); // Ohjataan takaisin kirjautumissivulle
        }
      });

    // track active user email for header display
    this.auth.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe((account) => {
        this.activeUserEmail = account ? account.username : null;
      });
  }

  // Fetch Azure profile data to display in the header
  private loadAzureData(): void {
    this.azure.getMyProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.userName = profile.displayName;
        },
        error: (err) => {
          console.error('Failed to pull Azure profile data:', err);
          this.userName = 'Unknown User'; 
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}