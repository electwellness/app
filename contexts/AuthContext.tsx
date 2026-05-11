import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/app/lib/supabase';

export type UserRole = 'admin' | 'franchise_manager' | 'trainer' | 'dietitian' | 'client';



export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  franchise: string | null;
  trainer_name: string | null;
  address: string | null;
  phone: string | null;
  birthdate: string | null;
  occupation: string | null;
  company: string | null;
  primary_trainer: string | null;
  primary_dietitian: string | null;
  in_facebook_group: boolean;
  has_nutrition: boolean;
  program: string | null;
  program_start_date: string | null;
  program_stop_date: string | null;
  program_status: 'active' | 'stopped' | null;
}




interface AuthState {
  user: any | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  profileMissing: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, role: UserRole, franchise?: string, trainerName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    isLoading: true,
    isAuthenticated: false,
    profileMissing: false,
  });
  const [showAuthModal, setShowAuthModal] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .abortSignal(controller.signal)
        .single();

      clearTimeout(timeoutId);

      if (error) {
        console.log('Profile fetch error:', error.message);
        return null;
      }
      return data as UserProfile;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log('Profile fetch timed out');
      } else {
        console.log('Profile fetch exception:', err);
      }
      return null;
    }
  }, []);


  const refreshProfile = useCallback(async () => {
    if (authState.user?.id) {
      const profile = await fetchProfile(authState.user.id);
      if (profile) {
        setAuthState(prev => ({ ...prev, profile, profileMissing: false }));
      }
    }
  }, [authState.user?.id, fetchProfile]);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user && mounted) {
          const profile = await fetchProfile(session.user.id);
          setAuthState({
            user: session.user,
            profile,
            isLoading: false,
            isAuthenticated: true,
            profileMissing: !profile,
          });
        } else if (mounted) {
          setAuthState({
            user: null,
            profile: null,
            isLoading: false,
            isAuthenticated: false,
            profileMissing: false,
          });
        }
      } catch (err) {
        if (mounted) {
          setAuthState({
            user: null,
            profile: null,
            isLoading: false,
            isAuthenticated: false,
            profileMissing: false,
          });
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        // Small delay to allow trigger to create profile
        setTimeout(async () => {
          if (!mounted) return;
          const profile = await fetchProfile(session.user.id);
          setAuthState({
            user: session.user,
            profile,
            isLoading: false,
            isAuthenticated: true,
            profileMissing: !profile,
          });
        }, 500);
      } else if (event === 'SIGNED_OUT') {
        setAuthState({
          user: null,
          profile: null,
          isLoading: false,
          isAuthenticated: false,
          profileMissing: false,
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Translate network / abort errors into user-friendly messages
        const msg = error.message || '';
        if (
          msg.includes('Failed to fetch') ||
          msg.includes('NetworkError') ||
          msg.includes('Network request failed') ||
          msg.includes('signal is aborted') ||
          error.name === 'AbortError'
        ) {
          return { error: 'Unable to connect to the server. Please check your internet connection and try again.' };
        }
        return { error: error.message };
      }
      
      if (data.user) {
        const profile = await fetchProfile(data.user.id);
        setAuthState({
          user: data.user,
          profile,
          isLoading: false,
          isAuthenticated: true,
          profileMissing: !profile,
        });
      }
      return { error: null };
    } catch (err: any) {
      const msg = err?.message || '';
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Network request failed') ||
        msg.includes('signal is aborted') ||
        err?.name === 'AbortError'
      ) {
        return { error: 'Unable to connect to the server. Please check your internet connection and try again.' };
      }
      return { error: msg || 'An unexpected error occurred' };
    }
  };



  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    franchise?: string,
    trainerName?: string
  ): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
        },
      });

      if (error) return { error: error.message };

      // Update the profile with franchise and trainer info
      if (data.user) {
        // Wait for trigger to create profile
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const updates: any = {};
        if (franchise) updates.franchise = franchise;
        if (trainerName) updates.trainer_name = trainerName;
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('user_profiles')
            .update(updates)
            .eq('id', data.user.id);
        }

        const profile = await fetchProfile(data.user.id);
        setAuthState({
          user: data.user,
          profile,
          isLoading: false,
          isAuthenticated: true,
          profileMissing: !profile,
        });
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'An unexpected error occurred' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAuthState({
      user: null,
      profile: null,
      isLoading: false,
      isAuthenticated: false,
      profileMissing: false,
    });
  };

  const updateProfile = async (updates: Partial<UserProfile>): Promise<{ error: string | null }> => {
    if (!authState.user) return { error: 'Not authenticated' };

    try {
      // Strip out fields that should NOT be sent to user_profiles table
      const { id, email, role, ...safeUpdates } = updates as any;

      // Ensure birthdate is null (not empty string) for PostgreSQL DATE column
      if ('birthdate' in safeUpdates && !safeUpdates.birthdate) {
        safeUpdates.birthdate = null;
      }

      // Add updated_at timestamp
      safeUpdates.updated_at = new Date().toISOString();

      // Use a timeout to prevent hanging requests
      const timeoutMs = 10000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const { error } = await supabase
        .from('user_profiles')
        .update(safeUpdates)
        .eq('id', authState.user.id)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) return { error: error.message };

      // Optimistically update local state
      setAuthState(prev => ({
        ...prev,
        profile: prev.profile ? { ...prev.profile, ...updates } : null,
      }));

      return { error: null };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { error: 'Request timed out. Please check your connection and try again.' };
      }
      return { error: err.message || 'An unexpected error occurred' };
    }
  };


  return (
    <AuthContext.Provider
      value={{
        ...authState,
        signIn,
        signUp,
        signOut,
        updateProfile,
        refreshProfile,
        showAuthModal,
        setShowAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
