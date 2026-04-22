import { apiRequest } from './client';

export function getCurrentUserProfile() {
  return apiRequest('/users/me');
}

export function updateCurrentUserProfile(payload) {
  return apiRequest('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
