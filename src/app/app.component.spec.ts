import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { AuthService } from './services/azome/auth.service';
import { ProfileService } from './services/azure/profile.service';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: AuthService, useValue: { isAuthenticated$: EMPTY, user$: EMPTY } },
        { provide: ProfileService, useValue: { getMyProfile: () => EMPTY } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

});
