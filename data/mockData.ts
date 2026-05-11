// Trainer avatar image URLs (kept for use when creating new staff records)
const TRAINER_IMAGES_MALE = [
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845766651_5d2978e7.png',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845826138_b129fa2f.png',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845756880_2a8174fb.jpg',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845807595_e6ac8794.png',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845759795_bafd25d0.jpg',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845760626_6f6618f1.jpg',
];

const TRAINER_IMAGES_FEMALE = [
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845839568_60552998.jpg',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845842231_fa808f7d.jpg',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845841694_fbaed80b.jpg',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845843426_f09175ea.jpg',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845841138_518d0b94.jpg',
  'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845854842_fced24dc.png',
];


export const HERO_IMAGE = 'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845951202_5c4eba82.png';

export interface KPIData {
  id: string;
  label: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: string;
  color: string;
}

// kpiData has been removed — KPIs are now computed live via the compute-kpis edge function.



export type ReviewPlatform = 'google' | 'facebook' | 'yelp' | 'thumbtack' | 'nextdoor';

export interface ClientReview {
  id: string;
  clientId: string;
  platform: ReviewPlatform;
  reviewLink: string;
  starRating?: number; // 1-5, optional (some platforms don't use stars)
  reviewDate: string; // YYYY-MM-DD
  reviewText?: string;
  creditedTrainer?: string;
  creditedDietitian?: string;
  addedDate: string; // when it was entered into the system
}

export type ContactStatus = 
  | 'active-client'
  | 'former-client'
  | 'active-jumpstart'
  | 'failed-jumpstart'
  | 'referring-partner'
  | 'active-staff'
  | 'former-staff';

export const CONTACT_STATUS_OPTIONS: { label: string; value: ContactStatus; icon: string; color: string; description: string }[] = [
  { label: 'Active Client', value: 'active-client', icon: 'person', color: '#2ecc71', description: 'Currently enrolled in a program' },
  { label: 'Former Client', value: 'former-client', icon: 'person-outline', color: '#8B5CF6', description: 'Previously enrolled, no longer active' },
  { label: 'Active Jumpstart', value: 'active-jumpstart', icon: 'flash', color: '#f39c12', description: 'Currently in the Jumpstart program' },
  { label: 'Failed Jumpstart', value: 'failed-jumpstart', icon: 'flash-off', color: '#e74c3c', description: 'Did not complete the Jumpstart program' },
  { label: 'Referring Partner', value: 'referring-partner', icon: 'people', color: '#9b59b6', description: 'Refers clients to the franchise' },
  { label: 'Active Staff', value: 'active-staff', icon: 'briefcase', color: '#0E8AC8', description: 'Currently employed staff member' },
  { label: 'Former Staff', value: 'former-staff', icon: 'briefcase-outline', color: '#8fa4b5', description: 'Previously employed staff member' },
];


export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  status: 'active' | 'at-risk' | 'paused' | 'new' | 'alumni';
  contactStatus?: ContactStatus;
  role?: string; // e.g. 'client', 'trainer', 'dietitian', 'franchise_manager', 'admin'
  franchise: string;
  trainer: string;
  dietitian: string;
  joinDate: string;
  lastSession: string;
  nextSession: string;
  program: string;
  weight: number;
  targetWeight: number;
  startWeight: number;
  bodyFat: number;
  sessionsCompleted: number;
  totalSessions: number;
  satisfaction: number;
  monthlySpend: number;
  goals: string[];
  milestones: string[];
  phase: string;
  renewalDate: string;
  birthdate: string;
  occupation: string;
  address?: string;
  alumniDate?: string;
  alumniReason?: string;
  reviews?: ClientReview[];
  unclaimed?: boolean;
  has_nutrition?: boolean;
}











export interface Franchise {
  id: string;
  name: string;
  city: string;
  state: string;
  manager: string;
  managerAvatar: string;
  activeClients: number;
  totalTrainers: number;
  status: 'excellent' | 'good' | 'attention';
  isActive?: boolean;
}



// franchises has been removed — franchises are now loaded from the database only.



export interface StaffProfile {
  email: string;
  address: string;
  phone: string;
  birthday: string;
  inFacebookGroup: boolean;
  reviewCredits: number;
  referralCredits: number;
  returnCredits: number;
}

export interface CertificationWithExpiry {
  name: string;
  expirationDate: string;
}

export interface Trainer extends StaffProfile {
  id: string;
  name: string;
  avatar: string;
  franchise: string;
  specialties: string[];
  certifications: CertificationWithExpiry[];
  activeClients: number;
  maxClients: number;
  rating: number;
  totalReviews: number;
  sessionsThisMonth: number;
  revenueGenerated: number;
  yearsExperience: number;
  bonusEarned: number;
  status: 'active' | 'inactive';
  hireDate: string;
}

export interface Dietitian extends StaffProfile {
  id: string;
  name: string;
  avatar: string;
  franchise: string;
  specialties: string[];
  certifications: CertificationWithExpiry[];
  activeClients: number;
  maxClients: number;
  rating: number;
  totalReviews: number;
  yearsExperience: number;
  status: 'active' | 'inactive';
  hireDate: string;
}


// All demo data arrays (clients, trainers, dietitians) have been removed.
// These are now loaded exclusively from the database.



// revenueMonthly has been removed — revenue data is no longer displayed. Contacts by franchise chart uses real user_profiles data.

// programDistribution has been removed — program distribution is now computed from real contacts via computeProgramDistribution().
// recentActivity has been removed — activity feed is now fetched from the manage-activity-feed edge function.
// alerts has been removed — notifications are now fetched from the database in real time.
