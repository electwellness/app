import { UserProfile } from '../contexts/AuthContext';
import { Client, Franchise, Trainer, Dietitian } from '../data/mockData';

/** Helper: is this role a "coach" role (trainer or dietitian)? */
export function isCoachRole(role?: string): boolean {
  return role === 'trainer' || role === 'dietitian';
}

/**
 * Filter clients based on user role
 * - Admin: sees all clients
 * - Franchise Manager: sees clients in their franchise only
 * - Trainer: sees only clients assigned to them
 * - Dietitian: sees only clients assigned to them
 */
export function filterClients(allClients: Client[], profile: UserProfile | null): Client[] {
  if (!profile) return allClients; // Not logged in = show all (guest/demo mode)

  switch (profile.role) {
    case 'admin':
      return allClients;
    case 'franchise_manager':
      if (!profile.franchise) return allClients;
      return allClients.filter(c => c.franchise === profile.franchise);
    case 'trainer':
      if (!profile.trainer_name) return allClients;
      return allClients.filter(c => c.trainer === profile.trainer_name);
    case 'dietitian':
      if (!profile.trainer_name) return allClients;
      return allClients.filter(c => c.dietitian === profile.trainer_name);
    default:
      return allClients;
  }
}

/**
 * Filter franchises based on user role
 * - Admin: sees all franchises
 * - Franchise Manager: sees only their franchise
 * - Trainer / Dietitian: sees only their franchise
 */
export function filterFranchises(allFranchises: Franchise[], profile: UserProfile | null): Franchise[] {
  if (!profile) return allFranchises;

  switch (profile.role) {
    case 'admin':
      return allFranchises;
    case 'franchise_manager':
    case 'trainer':
    case 'dietitian':
      if (!profile.franchise) return allFranchises;
      return allFranchises.filter(f => f.name === profile.franchise);
    default:
      return allFranchises;
  }
}

/**
 * Filter trainers based on user role
 * - Admin: sees all trainers
 * - Franchise Manager: sees trainers in their franchise
 * - Trainer: sees only themselves
 * - Dietitian: sees trainers in their franchise
 */
export function filterTrainers(allTrainers: Trainer[], profile: UserProfile | null): Trainer[] {
  if (!profile) return allTrainers;

  switch (profile.role) {
    case 'admin':
      return allTrainers;
    case 'franchise_manager':
      if (!profile.franchise) return allTrainers;
      return allTrainers.filter(t => t.franchise === profile.franchise);
    case 'trainer':
      if (!profile.trainer_name) return allTrainers;
      return allTrainers.filter(t => t.name === profile.trainer_name);
    case 'dietitian':
      if (!profile.franchise) return allTrainers;
      return allTrainers.filter(t => t.franchise === profile.franchise);
    default:
      return allTrainers;
  }
}

/**
 * Filter dietitians based on user role
 * - Admin: sees all dietitians
 * - Franchise Manager: sees dietitians in their franchise
 * - Trainer: sees dietitians in their franchise
 * - Dietitian: sees only themselves
 */
export function filterDietitians(allDietitians: Dietitian[], profile: UserProfile | null): Dietitian[] {
  if (!profile) return allDietitians;

  switch (profile.role) {
    case 'admin':
      return allDietitians;
    case 'franchise_manager':
      if (!profile.franchise) return allDietitians;
      return allDietitians.filter(d => d.franchise === profile.franchise);
    case 'trainer':
      if (!profile.franchise) return allDietitians;
      return allDietitians.filter(d => d.franchise === profile.franchise);
    case 'dietitian':
      if (!profile.trainer_name) return allDietitians;
      return allDietitians.filter(d => d.name === profile.trainer_name);
    default:
      return allDietitians;
  }
}


// filterAlerts has been removed — alerts are now fetched from the database in real time.



/**
 * Get role display label
 */
export function getRoleLabel(role: string): string {
  switch (role) {
    case 'admin': return 'Admin';
    case 'franchise_manager': return 'Franchise Manager';
    case 'trainer': return 'Trainer';
    case 'dietitian': return 'Dietitian';
    case 'client': return 'Client';
    default: return role;
  }
}

/**
 * Get role color
 */
export function getRoleColor(role: string): string {
  switch (role) {
    case 'admin': return '#ff6b6b';
    case 'franchise_manager': return '#3498db';
    case 'trainer': return '#2ecc71';
    case 'dietitian': return '#9b59b6';
    case 'client': return '#9b59b6';
    default: return '#9ca8b7';
  }
}


/**
 * Check if user has access to a specific feature
 */
export function hasAccess(profile: UserProfile | null, feature: 'manage_franchises' | 'manage_trainers' | 'view_reports' | 'manage_clients'): boolean {
  if (!profile) return true; // Guest mode - show everything

  switch (feature) {
    case 'manage_franchises':
      return profile.role === 'admin';
    case 'manage_trainers':
      return profile.role === 'admin' || profile.role === 'franchise_manager';
    case 'view_reports':
      return true; // All roles can view reports (filtered)
    case 'manage_clients':
      return true; // All roles can manage clients (filtered)
    default:
      return true;
  }
}
