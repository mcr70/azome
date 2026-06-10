import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UserProfile {
  displayName: string;
  mail: string;
  userPrincipalName: string;
  id: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private graphEndpoint = 'https://graph.microsoft.com/v1.0/me';

  constructor(private http: HttpClient) {}

  // MsalInterceptor automatically attaches the Bearer token to this request
  public getMyProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(this.graphEndpoint);
  }
}