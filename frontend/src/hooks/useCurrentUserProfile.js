import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserProfile,
  signOut as signOutRequest,
  updateCurrentUserProfile,
} from '../api/users';

export function useCurrentUserProfile() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const loadUser = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadUser);
  }, [loadUser]);

  const saveUserProfile = useCallback(async (payload) => {
    const nextUser = await updateCurrentUserProfile(payload);
    setUser(nextUser);
    setStatus('success');
    return nextUser;
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return {
    user,
    status,
    error,
    reloadUser: loadUser,
    saveUserProfile,
    signOut,
  };
}
