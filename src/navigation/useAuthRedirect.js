import { useEffect } from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useUser } from '../store/UserContext';

/**
 * A hook that monitors the global user session state.
 * If the session expires (or the user explicitly logs out),
 * this cleans the navigation stack and redirects safely to the Auth/Login screen.
 *
 * This prevents the "ghost session" bug where an expired JWT causes
 * the app to crash or show empty histories due to RLS blocks.
 */
export function useAuthRedirect() {
  const navigation = useNavigation();
  const { sessionExpired, userPrefs } = useUser();

  useEffect(() => {
    // If the token refresh failed in UserContext, or the user was forced out:
    if (sessionExpired || (userPrefs.loaded && !userPrefs.email && navigation.canGoBack())) {
      console.log('🚪 [useAuthRedirect] Session expired or logged out — redirecting to Login');
      
      // Use CommonActions.reset to clear the stack so the user can't "back" into a protected screen
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            // Adjust the actual route name to match your Auth/Login screen name
            { name: 'Login' }, 
          ],
        })
      );
    }
  }, [sessionExpired, userPrefs.email, userPrefs.loaded, navigation]);
}
