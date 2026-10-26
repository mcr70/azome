import { MSALInstanceFactory } from './app.config';
import { environment } from '../environments/environment';

describe('MSALInstanceFactory', () => {
  it('uses the current website for sign-in and sign-out instead of localhost', () => {
    const original = { ...environment.azure };
    environment.azure.clientId = '11111111-1111-1111-1111-111111111111';
    environment.azure.tenantId = '22222222-2222-2222-2222-222222222222';

    try {
      const auth = MSALInstanceFactory().getConfiguration().auth;

      expect(auth.clientId).toBe(environment.azure.clientId);
      expect(auth.authority).toBe(`https://login.microsoftonline.com/${environment.azure.tenantId}`);
      expect(auth.redirectUri).toBe(`${window.location.origin}/`);
      expect(auth.postLogoutRedirectUri).toBe(`${window.location.origin}/`);
    } finally {
      Object.assign(environment.azure, original);
    }
  });
});
