import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { useAuth, UserProfile, UserRole } from './AuthContext';
import type { Franchise, Trainer, Dietitian } from '../data/mockData';
import type { CoachItem } from '../components/CoachCard';

export interface ImpersonationTarget {
  type: 'franchise_manager' | 'trainer';
  label: string;
  sublabel: string;
  avatar?: string;
  // Original data references
  franchiseName?: string;
  coachName?: string;
  coachType?: 'trainer' | 'dietitian';
}

interface ImpersonationContextType {
  isImpersonating: boolean;
  impersonationTarget: ImpersonationTarget | null;
  impersonatedProfile: UserProfile | null;
  startImpersonatingFranchise: (franchise: Franchise) => void;
  startImpersonatingCoach: (coach: CoachItem) => void;
  stopImpersonating: () => void;
  effectiveProfile: UserProfile | null;
  /** True if the real user is an admin (can impersonate) */
  canImpersonate: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [impersonationTarget, setImpersonationTarget] = useState<ImpersonationTarget | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);

  const canImpersonate = profile?.role === 'admin';
  const isImpersonating = !!impersonatedProfile;

  const startImpersonatingFranchise = useCallback((franchise: Franchise) => {
    if (!profile || profile.role !== 'admin') return;

    const fakeProfile: UserProfile = {
      id: `impersonated-fm-${franchise.id}`,
      email: `${franchise.manager.toLowerCase().replace(/\s+/g, '.')}@electwellness.com`,
      full_name: franchise.manager,
      role: 'franchise_manager' as UserRole,
      franchise: franchise.name,
      trainer_name: null,
      address: `${franchise.city}, ${franchise.state}`,
      phone: null,
      birthdate: null,
      occupation: null,
      company: null,
      primary_trainer: null,
      primary_dietitian: null,
      in_facebook_group: false,
    };

    setImpersonationTarget({
      type: 'franchise_manager',
      label: franchise.manager,
      sublabel: `${franchise.name} - Franchise Manager`,
      franchiseName: franchise.name,
    });
    setImpersonatedProfile(fakeProfile);
  }, [profile]);

  const startImpersonatingCoach = useCallback((coach: CoachItem) => {
    if (!profile || profile.role !== 'admin') return;

    const data = coach.data;
    const isTrainer = coach.coachType === 'trainer';

    const fakeProfile: UserProfile = {
      id: `impersonated-coach-${data.id}`,
      email: data.email,
      full_name: data.name,
      role: (coach.coachType === 'dietitian' ? 'dietitian' : 'trainer') as UserRole,
      franchise: data.franchise,

      trainer_name: data.name,
      address: data.address || null,
      phone: data.phone || null,
      birthdate: null,
      occupation: null,
      company: null,
      primary_trainer: null,
      primary_dietitian: null,
      in_facebook_group: data.inFacebookGroup || false,
    };

    setImpersonationTarget({
      type: 'trainer',
      label: data.name,
      sublabel: `${data.franchise} - ${isTrainer ? 'Trainer' : 'Dietitian'}`,
      avatar: data.avatar,
      franchiseName: data.franchise,
      coachName: data.name,
      coachType: coach.coachType,
    });
    setImpersonatedProfile(fakeProfile);
  }, [profile]);

  const stopImpersonating = useCallback(() => {
    setImpersonationTarget(null);
    setImpersonatedProfile(null);
  }, []);

  // The effective profile: impersonated if active, otherwise real
  const effectiveProfile = useMemo(() => {
    if (isImpersonating && impersonatedProfile) {
      return impersonatedProfile;
    }
    return profile;
  }, [isImpersonating, impersonatedProfile, profile]);

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating,
        impersonationTarget,
        impersonatedProfile,
        startImpersonatingFranchise,
        startImpersonatingCoach,
        stopImpersonating,
        effectiveProfile,
        canImpersonate,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}

/**
 * Hook that returns the effective profile (impersonated or real).
 * Use this in place of useAuth().profile for data filtering.
 */
export function useEffectiveProfile(): UserProfile | null {
  const { effectiveProfile } = useImpersonation();
  return effectiveProfile;
}
