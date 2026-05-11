import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import { usePlatformAlert } from '../lib/platformAlert';

import Header from '../components/Header';
import SectionHeader from '../components/SectionHeader';
import AuthModal from '../components/AuthModal';
import { BarChart, DonutChart } from '../components/MiniChart';
import WeightLeaderboard from '../components/WeightLeaderboard';
import ReviewsReportsPanel from '../components/reports/ReviewsReportsPanel';
import AttributionReportPanel from '../components/reports/AttributionReportPanel';
import NutritionReportPanel from '../components/reports/NutritionReportPanel';
import ReferralReportPanel from '../components/reports/ReferralReportPanel';
import ReferralCreditReportPanel from '../components/reports/ReferralCreditReportPanel';

import TrainerKPIPanel from '../components/TrainerKPIPanel';
import StaffCreditLeaderboardPanel from '../components/reports/StaffCreditLeaderboardPanel';
import WebPerformancePanel from '../components/reports/WebPerformancePanel';





import { Franchise } from '../data/mockData';
import { computeProgramDistribution } from '../lib/chartDataHelpers';

import { useAuth } from '../contexts/AuthContext';
import { filterFranchises, isCoachRole } from '../lib/dataFilters';
import { supabase } from '@/app/lib/supabase';




// Shape of a user_profiles row for reporting
interface ProfileRow {
  franchise: string | null;
  role: string | null;
  contact_status: string | null;
  program: string | null;
  full_name: string | null;
  created_at: string | null;
}

// Aggregated counts per franchise
// Aggregated counts per franchise
interface FranchiseCounts {
  franchise: string;
  totalContacts: number;
  activeClients: number;
  activeJumpstart: number;
  formerClients: number;
  referringPartners: number;
  trainers: number;
  dietitians: number;
  franchiseManagers: number;
  totalStaff: number;
}
type ReportType = 'attribution' | 'referrals' | 'credits' | 'leaderboard' | 'clients' | 'coaches' | 'nutrition' | 'reviews' | 'weight' | 'programs' | 'website';







export default function ReportsScreen() {
  const { profile, showAuthModal, setShowAuthModal } = useAuth();
  const { platformAlert } = usePlatformAlert();
  const isCoach = isCoachRole(profile?.role);
  const [selectedReport, setSelectedReport] = useState<ReportType>('attribution');



  // DB franchises state
  const [dbFranchises, setDbFranchises] = useState<Franchise[]>([]);
  const [franchisesLoading, setFranchisesLoading] = useState(false);

  // Real user_profiles data
  const [allProfiles, setAllProfiles] = useState<ProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  // DB contacts state (for program distribution)
  const [dbContacts, setDbContacts] = useState<{ program?: string | null }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'franchise_manager' || profile?.role === 'trainer' || profile?.role === 'dietitian';

  // Fetch franchises from database
  const fetchFranchises = useCallback(async () => {
    if (!isStaff) return;
    setFranchisesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-franchises', {
        body: { action: 'list' },
      });
      if (!error && data?.data) {
        const converted: Franchise[] = data.data.map((dbf: any) => ({
          id: dbf.id, name: dbf.name, city: dbf.city, state: dbf.state,
          manager: dbf.manager_name || 'Unassigned', managerAvatar: '',
          activeClients: 0, totalTrainers: 0,
          status: dbf.status || 'good',
          isActive: dbf.is_active !== false,
        }));

        setDbFranchises(converted);
      }
    } catch (err) { console.log('Error fetching franchises for reports:', err); }
    finally { setFranchisesLoading(false); }
  }, [isStaff]);

  // Fetch all user_profiles for real metrics
  const fetchProfiles = useCallback(async () => {
    if (!isStaff) return;
    setProfilesLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('franchise, role, contact_status, program, full_name, created_at');
      if (!error && data) {
        setAllProfiles(data as ProfileRow[]);
      }
    } catch (err) { console.log('Error fetching profiles for reports:', err); }
    finally { setProfilesLoading(false); }
  }, [isStaff]);

  // Fetch contacts from database (for program distribution)
  const fetchContacts = useCallback(async () => {
    if (!isStaff) return;
    setContactsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-client-data', {
        body: { action: 'list_contacts' },
      });
      if (!error && data?.data) {
        setDbContacts(data.data.map((c: any) => ({ program: c.program || null })));
      }
    } catch (err) { console.log('Error fetching contacts for reports:', err); }
    finally { setContactsLoading(false); }
  }, [isStaff]);

  useEffect(() => {
    fetchFranchises();
    fetchProfiles();
    fetchContacts();
  }, [fetchFranchises, fetchProfiles, fetchContacts]);

  // ── Role-filtered profiles ──
  const filteredProfiles = useMemo(() => {
    if (!profile) return allProfiles;
    switch (profile.role) {
      case 'admin':
        return allProfiles;
      case 'franchise_manager':
        if (!profile.franchise) return allProfiles;
        return allProfiles.filter(p => p.franchise === profile.franchise);
      case 'trainer':
      case 'dietitian':
        if (!profile.franchise) return allProfiles;
        return allProfiles.filter(p => p.franchise === profile.franchise);
      default:
        return allProfiles;
    }
  }, [allProfiles, profile]);

  // ── Franchise list (active only) ──
  const franchises = dbFranchises.filter(f => f.isActive !== false);
  const filteredFranchises = useMemo(() => filterFranchises(franchises, profile), [franchises, profile]);

  // ── Aggregate counts per franchise ──
  const franchiseCounts = useMemo((): FranchiseCounts[] => {
    const map: Record<string, FranchiseCounts> = {};

    for (const p of filteredProfiles) {
      const fname = p.franchise || 'Unassigned';
      if (!map[fname]) {
        map[fname] = {
          franchise: fname,
          totalContacts: 0,
          activeClients: 0,
          activeJumpstart: 0,
          formerClients: 0,
          referringPartners: 0,
          trainers: 0,
          dietitians: 0,
          franchiseManagers: 0,
          totalStaff: 0,
        };
      }
      const fc = map[fname];
      fc.totalContacts++;

      // Count by contact_status
      const cs = p.contact_status;
      if (cs === 'active-client') fc.activeClients++;
      else if (cs === 'active-jumpstart') fc.activeJumpstart++;
      else if (cs === 'former-client') fc.formerClients++;
      else if (cs === 'referring-partner') fc.referringPartners++;


      // Count by role for staff
      const role = p.role;
      if (role === 'trainer') { fc.trainers++; fc.totalStaff++; }
      else if (role === 'dietitian') { fc.dietitians++; fc.totalStaff++; }
      else if (role === 'franchise_manager') { fc.franchiseManagers++; fc.totalStaff++; }
    }

    // Sort by totalContacts descending
    return Object.values(map).sort((a, b) => b.totalContacts - a.totalContacts);
  }, [filteredProfiles]);

  // ── Global totals ──
  const totals = useMemo(() => {
    const t = {
      contacts: 0,
      activeClients: 0,
      activeJumpstart: 0,
      formerClients: 0,
      referringPartners: 0,
      activeStaff: 0,
      formerStaff: 0,
      trainers: 0,
      dietitians: 0,
      franchiseManagers: 0,
      totalStaff: 0,
      locations: filteredFranchises.length,
    };
    for (const fc of franchiseCounts) {
      t.contacts += fc.totalContacts;
      t.activeClients += fc.activeClients;
      t.activeJumpstart += fc.activeJumpstart;
      t.formerClients += fc.formerClients;
      t.referringPartners += fc.referringPartners;
      t.trainers += fc.trainers;
      t.dietitians += fc.dietitians;
      t.franchiseManagers += fc.franchiseManagers;
      t.totalStaff += fc.totalStaff;
    }
    // Count active/former staff from contact_status
    for (const p of filteredProfiles) {
      if (p.contact_status === 'active-staff') t.activeStaff++;
      else if (p.contact_status === 'former-staff') t.formerStaff++;
    }
    return t;
  }, [franchiseCounts, filteredFranchises, filteredProfiles]);


  // ── Contact status distribution for donut ──
  const contactStatusData = useMemo(() => {
    const total = totals.contacts || 1;
    const items = [
      { name: 'Active Clients', count: totals.activeClients, color: COLORS.success },
      { name: 'Active Jumpstart', count: totals.activeJumpstart, color: COLORS.warning },
      { name: 'Former Clients', count: totals.formerClients, color: '#8B5CF6' },
      { name: 'Referring Partners', count: totals.referringPartners, color: '#9b59b6' },
      { name: 'Active Staff', count: totals.activeStaff, color: COLORS.accent },
      { name: 'Former Staff', count: totals.formerStaff, color: COLORS.textMuted },
    ].filter(i => i.count > 0);


    return items.map(i => ({
      name: i.name,
      value: Math.max(1, Math.round((i.count / total) * 100)),
      color: i.color,
    }));
  }, [totals]);

  // ── Staff type distribution for donut ──
  const staffTypeData = useMemo(() => {
    const items = [
      { name: 'Trainers', count: totals.trainers, color: COLORS.success },
      { name: 'Dietitians', count: totals.dietitians, color: '#9b59b6' },
      { name: 'Franchise Managers', count: totals.franchiseManagers, color: COLORS.info },
    ].filter(i => i.count > 0);

    const total = items.reduce((s, i) => s + i.count, 0) || 1;
    return items.map(i => ({
      name: i.name,
      value: Math.max(1, Math.round((i.count / total) * 100)),
      color: i.color,
    }));
  }, [totals]);

  // ── Contacts by franchise bar chart ──
  const contactsByFranchiseChart = useMemo(() => {
    return franchiseCounts
      .filter(fc => fc.franchise !== 'Unassigned')
      .slice(0, 12)
      .map(fc => ({
        label: fc.franchise.length > 10 ? fc.franchise.slice(0, 9) + '…' : fc.franchise,
        value: fc.totalContacts,
      }));
  }, [franchiseCounts]);

  // ── Clients by franchise bar chart ──
  const clientsByFranchiseChart = useMemo(() => {
    return franchiseCounts
      .filter(fc => fc.franchise !== 'Unassigned')
      .slice(0, 12)
      .map(fc => ({
        label: fc.franchise.length > 10 ? fc.franchise.slice(0, 9) + '…' : fc.franchise,
        value: fc.activeClients + fc.activeJumpstart,
      }));
  }, [franchiseCounts]);

  // ── Staff by franchise bar chart ──
  const staffByFranchiseChart = useMemo(() => {
    return franchiseCounts
      .filter(fc => fc.franchise !== 'Unassigned' && fc.totalStaff > 0)
      .slice(0, 12)
      .map(fc => ({
        label: fc.franchise.length > 10 ? fc.franchise.slice(0, 9) + '…' : fc.franchise,
        value: fc.totalStaff,
      }));
  }, [franchiseCounts]);

  // ── Program distribution from DB contacts ──
  const programDistData = useMemo(() => {
    return computeProgramDistribution(dbContacts);
  }, [dbContacts]);

  const contactsWithProgram = useMemo(() => {
    return dbContacts.filter(c => c.program && c.program.trim()).length;
  }, [dbContacts]);

  // ── Program enrollment table ──
  const programEnrollmentTable = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of dbContacts) {
      const prog = (c.program || '').trim();
      if (!prog) continue;
      counts[prog] = (counts[prog] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        pct: contactsWithProgram > 0 ? Math.round((count / contactsWithProgram) * 100) : 0,
      }));
  }, [dbContacts, contactsWithProgram]);

  // ── New contacts trend (by month) ──
  const newContactsTrend = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (const p of filteredProfiles) {
      if (!p.created_at) continue;
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    }

    // Get last 6 months
    const now = new Date();
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      months.push({
        label: MONTH_ABBREVS[d.getMonth()],
        value: monthCounts[key] || 0,
      });
    }
    return months;
  }, [filteredProfiles]);


  const handleExport = (format: string) => {
    platformAlert('Export Report', `Your ${selectedReport} report will be exported as ${format}. This would trigger a download in production.`);
  };

  const isLoading = profilesLoading || franchisesLoading;

  // All report tabs — overview, 7strategies, and marketing moved to Dashboard
  // Website tab is admin-only
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master_admin';

  const allReportTabs: { label: string; value: ReportType; icon: string; adminOnly?: boolean }[] = [
    { label: 'Attribution', value: 'attribution', icon: 'git-branch' },
    { label: 'Referrals', value: 'referrals', icon: 'git-network' },
    { label: 'Credits', value: 'credits', icon: 'ribbon' },
    { label: 'Leaderboard', value: 'leaderboard', icon: 'podium' },
    { label: 'Clients', value: 'clients', icon: 'people' },
    { label: 'Coaches', value: 'coaches', icon: 'people-circle' },
    { label: 'Nutrition', value: 'nutrition', icon: 'nutrition' },
    { label: 'Reviews', value: 'reviews', icon: 'chatbubbles' },
    { label: 'Weight', value: 'weight', icon: 'trophy' },
    { label: 'Programs', value: 'programs', icon: 'barbell' },
    { label: 'Website', value: 'website', icon: 'speedometer', adminOnly: true },
  ];


  // Trainers/dietitians cannot see executive-level reports
  const COACH_HIDDEN_REPORTS: ReportType[] = ['attribution', 'website'];

  const reportTabs = isCoach
    ? allReportTabs.filter(tab => !COACH_HIDDEN_REPORTS.includes(tab.value))
    : allReportTabs.filter(tab => !tab.adminOnly || isAdmin);



  // ── Loading placeholder ──
  const LoadingPlaceholder = () => (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
      <ActivityIndicator size="small" color={COLORS.accent} />
      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.sm }}>Loading data...</Text>
    </View>
  );

  // ── Empty state ──
  const EmptyState = ({ message }: { message: string }) => (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
      <Ionicons name="analytics-outline" size={32} color={COLORS.textMuted} />
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: SPACING.sm, textAlign: 'center' }}>{message}</Text>
    </View>
  );

  // ── If coach (trainer/dietitian), show ONLY the My KPIs screen ──
  if (isCoach) {
    return <TrainerKPIPanel />;
  }

  return (
    <View style={styles.container}>
      <Header title="Reports" subtitle="Analytics & Insights" />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Report Tab Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.reportSelectorScroll}
          contentContainerStyle={styles.reportSelector}
        >
          {reportTabs.map((tab) => (
            <TouchableOpacity
              key={tab.value}
              style={[styles.reportTab, selectedReport === tab.value && styles.reportTabActive]}
              onPress={() => setSelectedReport(tab.value)}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={selectedReport === tab.value ? COLORS.white : COLORS.textMuted}
              />
              <Text style={[styles.reportTabText, selectedReport === tab.value && styles.reportTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.content}>

          {/* Time range & export - show for overview, clients, coaches, programs */}
          {['overview', 'clients', 'coaches', 'programs'].includes(selectedReport) && (
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('CSV')}>
                <Ionicons name="download-outline" size={16} color={COLORS.accent} />
                <Text style={styles.exportText}>CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('PDF')}>
                <Ionicons name="document-outline" size={16} color={COLORS.accent} />
                <Text style={styles.exportText}>PDF</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Attribution Report */}
          {selectedReport === 'attribution' && (
            <View style={{ marginTop: SPACING.lg }}>
              <AttributionReportPanel />
            </View>
          )}


          {/* ═══════════════════════════════════════════════════════════ */}
          {/* OVERVIEW REPORT (replaced Revenue) */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'overview' && (
            <>
              {isLoading ? <LoadingPlaceholder /> : (
                <>
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Locations</Text>
                      <Text style={styles.metricValueLg}>{totals.locations}</Text>
                      <Text style={styles.metricSubtext}>Active franchises</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Total Contacts</Text>
                      <Text style={styles.metricValueLg}>{totals.contacts.toLocaleString()}</Text>
                      <Text style={styles.metricSubtext}>All user profiles</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Active Clients</Text>
                      <Text style={styles.metricValueLg}>{totals.activeClients.toLocaleString()}</Text>
                      <Text style={styles.metricSubtext}>Currently enrolled</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Total Staff</Text>
                      <Text style={styles.metricValueLg}>{totals.totalStaff}</Text>
                      <Text style={styles.metricSubtext}>{totals.trainers} trainers, {totals.dietitians} dietitians</Text>
                    </View>
                  </View>

                  {/* New contacts trend */}
                  {newContactsTrend.some(m => m.value > 0) && (
                    <>
                      <SectionHeader title="New Contacts" subtitle="Last 6 months" icon="trending-up" />
                      <View style={styles.chartCard}>
                        <BarChart data={newContactsTrend} height={140} barColor={COLORS.accent} />
                      </View>
                    </>
                  )}

                  {/* Contacts by franchise */}
                  {contactsByFranchiseChart.length > 0 && (
                    <>
                      <SectionHeader title="Contacts by Franchise" icon="business" />
                      <View style={styles.chartCard}>
                        <BarChart data={contactsByFranchiseChart} height={160} barColor={COLORS.info} />
                      </View>
                    </>
                  )}

                  {/* Contact status distribution */}
                  {contactStatusData.length > 0 && (
                    <>
                      <SectionHeader title="Contact Status Distribution" icon="pie-chart" />
                      <View style={styles.chartCard}>
                        <DonutChart data={contactStatusData} size={130} centerValue={`${totals.contacts}`} centerLabel="Total" />
                      </View>
                    </>
                  )}

                  {/* Franchise breakdown table */}
                  <SectionHeader title="Franchise Breakdown" icon="list" />
                  <View style={styles.tableCard}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderText, { flex: 2 }]}>Location</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Contacts</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Clients</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Staff</Text>
                    </View>
                    {franchiseCounts.length === 0 ? (
                      <View style={{ padding: SPACING.lg }}>
                        <EmptyState message="No franchise data available." />
                      </View>
                    ) : (
                      franchiseCounts.map((fc, i) => (
                        <View key={fc.franchise} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]}>{fc.franchise}</Text>
                          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{fc.totalContacts}</Text>
                          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{fc.activeClients}</Text>
                          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{fc.totalStaff}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* CLIENT REPORT */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'clients' && (
            <>
              {isLoading ? <LoadingPlaceholder /> : (
                <>
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Total Contacts</Text>
                      <Text style={styles.metricValueLg}>{totals.contacts.toLocaleString()}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Active Clients</Text>
                      <Text style={[styles.metricValueLg, { color: COLORS.success }]}>{totals.activeClients}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Active Jumpstart</Text>
                      <Text style={[styles.metricValueLg, { color: COLORS.warning }]}>{totals.activeJumpstart}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Former Clients</Text>
                      <Text style={styles.metricValueLg}>{totals.formerClients}</Text>
                    </View>
                  </View>


                  {/* Additional client metrics row */}
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Former Clients</Text>
                      <Text style={styles.metricValueLg}>{totals.formerClients}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Referring Partners</Text>
                      <Text style={[styles.metricValueLg, { color: '#9b59b6' }]}>{totals.referringPartners}</Text>
                    </View>
                  </View>

                  {/* Contact status donut */}
                  {contactStatusData.length > 0 && (
                    <>
                      <SectionHeader title="Contact Status Distribution" icon="pie-chart" />
                      <View style={styles.chartCard}>
                        <DonutChart data={contactStatusData} size={130} centerValue={`${totals.contacts}`} centerLabel="Total" />
                      </View>
                    </>
                  )}

                  {/* Clients by franchise chart */}
                  {clientsByFranchiseChart.length > 0 && clientsByFranchiseChart.some(c => c.value > 0) && (
                    <>
                      <SectionHeader title="Clients by Franchise" subtitle="Active clients + jumpstart" icon="bar-chart" />
                      <View style={styles.chartCard}>
                        <BarChart data={clientsByFranchiseChart} height={140} barColor={COLORS.success} />
                      </View>
                    </>
                  )}

                  {/* Clients by franchise table */}
                  <SectionHeader title="Contacts by Franchise" icon="list" />
                  <View style={styles.tableCard}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderText, { flex: 2 }]}>Location</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Total</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Active</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Jumpstart</Text>
                    </View>
                    {franchiseCounts.length === 0 ? (
                      <View style={{ padding: SPACING.lg }}>
                        <EmptyState message="No contact data available." />
                      </View>
                    ) : (
                      franchiseCounts.map((fc, i) => (
                        <View key={fc.franchise} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]}>{fc.franchise}</Text>
                          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{fc.totalContacts}</Text>
                          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.success, fontWeight: '700' }]}>{fc.activeClients}</Text>
                          <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.warning, fontWeight: '700' }]}>{fc.activeJumpstart}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* COACHES / STAFF REPORT */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'coaches' && (
            <>
              {isLoading ? <LoadingPlaceholder /> : (
                <>
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Total Staff</Text>
                      <Text style={styles.metricValueLg}>{totals.totalStaff}</Text>
                      <Text style={styles.metricSubtext}>Across {totals.locations} locations</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Trainers</Text>
                      <Text style={[styles.metricValueLg, { color: COLORS.success }]}>{totals.trainers}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Dietitians</Text>
                      <Text style={[styles.metricValueLg, { color: '#9b59b6' }]}>{totals.dietitians}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Franchise Managers</Text>
                      <Text style={[styles.metricValueLg, { color: COLORS.info }]}>{totals.franchiseManagers}</Text>
                    </View>
                  </View>

                  {/* Staff type donut */}
                  {staffTypeData.length > 0 && (
                    <>
                      <SectionHeader title="Staff Type Distribution" icon="pie-chart" />
                      <View style={styles.chartCard}>
                        <DonutChart data={staffTypeData} size={130} centerValue={`${totals.totalStaff}`} centerLabel="Staff" />
                      </View>
                    </>
                  )}

                  {/* Staff by franchise chart */}
                  {staffByFranchiseChart.length > 0 && (
                    <>
                      <SectionHeader title="Staff by Franchise" icon="bar-chart" />
                      <View style={styles.chartCard}>
                        <BarChart data={staffByFranchiseChart} height={140} barColor={COLORS.accent} />
                      </View>
                    </>
                  )}

                  {/* Staff by franchise table */}
                  <SectionHeader title="Staff Breakdown by Franchise" icon="list" />
                  <View style={styles.tableCard}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderText, { flex: 2 }]}>Location</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Trainers</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Dietitians</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Managers</Text>
                    </View>
                    {franchiseCounts.filter(fc => fc.totalStaff > 0).length === 0 ? (
                      <View style={{ padding: SPACING.lg }}>
                        <EmptyState message="No staff data available." />
                      </View>
                    ) : (
                      franchiseCounts
                        .filter(fc => fc.totalStaff > 0)
                        .map((fc, i) => (
                          <View key={fc.franchise} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                            <Text style={[styles.tableCell, { flex: 2, fontWeight: '600' }]}>{fc.franchise}</Text>
                            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.success, fontWeight: '700' }]}>{fc.trainers}</Text>
                            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: '#9b59b6', fontWeight: '700' }]}>{fc.dietitians}</Text>
                            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: COLORS.info, fontWeight: '700' }]}>{fc.franchiseManagers}</Text>
                          </View>
                        ))
                    )}
                  </View>
                </>
              )}
            </>
          )}

          {/* Weight Leaderboard */}
          {selectedReport === 'weight' && (
            <WeightLeaderboard />
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* PROGRAMS REPORT */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'programs' && (
            <>
              {contactsLoading ? <LoadingPlaceholder /> : (
                <>
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Total Contacts</Text>
                      <Text style={styles.metricValueLg}>{dbContacts.length}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>With Program</Text>
                      <Text style={[styles.metricValueLg, { color: COLORS.success }]}>{contactsWithProgram}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>No Program</Text>
                      <Text style={[styles.metricValueLg, { color: COLORS.warning }]}>{dbContacts.length - contactsWithProgram}</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Unique Programs</Text>
                      <Text style={[styles.metricValueLg, { color: COLORS.accent }]}>{programEnrollmentTable.length}</Text>
                    </View>
                  </View>

                  {/* Program distribution donut */}
                  {programDistData.length > 0 ? (
                    <>
                      <SectionHeader title="Program Enrollment Distribution" icon="pie-chart" />
                      <View style={styles.chartCard}>
                        <DonutChart data={programDistData} size={140} centerValue={`${contactsWithProgram}`} centerLabel="Enrolled" />
                      </View>
                    </>
                  ) : (
                    <>
                      <SectionHeader title="Program Enrollment Distribution" icon="pie-chart" />
                      <View style={styles.chartCard}>
                        <EmptyState message="No program enrollment data yet. Assign programs to contacts to see distribution." />
                      </View>
                    </>
                  )}

                  {/* Program enrollment table */}
                  {programEnrollmentTable.length > 0 && (
                    <>
                      <SectionHeader title="Program Enrollment Breakdown" icon="list" />
                      <View style={styles.tableCard}>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.tableHeaderText, { flex: 3 }]}>Program</Text>
                          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Enrolled</Text>
                          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Share</Text>
                        </View>
                        {programEnrollmentTable.map((prog, i) => (
                          <View key={prog.name} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                            <Text style={[styles.tableCell, { flex: 3, fontWeight: '600' }]}>{prog.name}</Text>
                            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.accent }]}>{prog.count}</Text>
                            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{prog.pct}%</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Program enrollment bars */}
                  {programEnrollmentTable.length > 0 && (
                    <>
                      <SectionHeader title="Enrollment by Program" icon="bar-chart" />
                      <View style={styles.chartCard}>
                        <BarChart
                          data={programEnrollmentTable.slice(0, 10).map(p => ({
                            label: p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name,
                            value: p.count,
                          }))}
                          height={140}
                          barColor={COLORS.success}
                        />
                      </View>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* Reviews Report */}
          {selectedReport === 'reviews' && (
            <View style={{ marginTop: SPACING.lg }}>
              <ReviewsReportsPanel />
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* REFERRAL REPORT                                            */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'referrals' && (
            <View style={{ marginTop: SPACING.lg }}>
              <ReferralReportPanel />
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* REFERRAL CREDIT ATTRIBUTION REPORT                        */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'credits' && (
            <View style={{ marginTop: SPACING.lg }}>
              <ReferralCreditReportPanel />
            </View>
          )}


          {/* ═══════════════════════════════════════════════════════════ */}
          {/* STAFF CREDIT LEADERBOARD                                   */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'leaderboard' && (
            <View style={{ marginTop: SPACING.lg }}>
              <StaffCreditLeaderboardPanel />
            </View>
          )}



          {/* ═══════════════════════════════════════════════════════════ */}
          {/* NUTRITION REPORT */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'nutrition' && (
            <View style={{ marginTop: SPACING.lg }}>
              <NutritionReportPanel />
            </View>
          )}




          {/* ═══════════════════════════════════════════════════════════ */}
          {/* WEBSITE PERFORMANCE REPORT (Admin Only)                     */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedReport === 'website' && (
            <View style={{ marginTop: SPACING.lg }}>
              <WebPerformancePanel />
            </View>
          )}

          <View style={{ height: 30 }} />

        </View>

      </ScrollView>

      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </View>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  reportSelectorScroll: { backgroundColor: COLORS.primary, flexGrow: 0 },
  reportSelector: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm },
  reportTab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.md, gap: 4, minWidth: 80 },
  reportTabActive: { backgroundColor: COLORS.accent },
  reportTabText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },
  reportTabTextActive: { color: COLORS.white },
  content: { paddingHorizontal: SPACING.lg },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.lg, flexWrap: 'wrap' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.accent + '40', backgroundColor: COLORS.coral50 },
  exportText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.accent },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg },
  metricCard: { flex: 1, minWidth: '45%', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, ...SHADOWS.sm },
  metricLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginBottom: 4 },
  metricValueLg: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.primary },
  metricSubtext: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  chartCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, ...SHADOWS.md },
  tableCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', ...SHADOWS.md },
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  tableHeaderText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.white, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  tableRowAlt: { backgroundColor: COLORS.navy50 + '40' },
  tableCell: { fontSize: FONT_SIZES.xs, color: COLORS.text },
});
