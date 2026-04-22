import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserProfile,
  updateCurrentUserProfile,
} from '../api/users';

export function useCurrentUserProfile({ enabled = true, userId = null } = {}) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle');
  const [error, setError] = useState(null);

  const loadUser = useCallback(async () => {
    if (!enabled) {
      return null;
    }

    setStatus('loading');
    setError(null);

    try {
      const profile = await getCurrentUserProfile();
      setUser(profile);
      setStatus('success');
    } catch (requestError) {
      if (requestError.status === 401) {
        setUser(null);
        setStatus('unauthenticated');
        return;
      }

      setError(requestError);
      setStatus('error');
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      void Promise.resolve().then(loadUser);
    }
  }, [enabled, loadUser, userId]);

  const saveUserProfile = useCallback(async (payload) => {
    if (!enabled) {
      throw new Error('Authentication is required.');
    }

    const nextUser = await updateCurrentUserProfile(payload);
    setUser(nextUser);
    setStatus('success');
    return nextUser;
  }, [enabled]);

  return {
    user: enabled ? user : null,
    status: enabled ? status : 'idle',
    error: enabled ? error : null,
    reloadUser: loadUser,
    saveUserProfile,
  };
}
