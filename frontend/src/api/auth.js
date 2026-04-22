import { apiRequest } from './client';

export function getSiweNonce() {
  return apiRequest('/auth/siwe/nonce');
}

export function verifySiwe(payload) {
  return apiRequest('/auth/siwe/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getCurrentSession() {
  return apiRequest('/auth/me');
}

export function signOut() {
  return apiRequest('/auth/sign-out', {
    method: 'POST',
  });
}
