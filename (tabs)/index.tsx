import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, FONT_SIZES } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

import Header from '../components/Header';
import type { NotificationItem } from '../components/Header';
import KPICard from '../components/KPICard';
import SectionHeader from '../components/SectionHeader';

import ActivityFeed from '../components/ActivityFeed';
import AuthModal from '../components/AuthModal';
import FoodReviewModal from '../components/FoodReviewModal';

import ContactStatusDashboard from '../components/ContactStatusDashboard';
import { BarChart, DonutChart } from '../components/MiniChart';
import { HERO_IMAGE, Franchise, KPIData } from '../data/mockData';
import { computeProgramDistribution } from '../lib/chartDataHelpers';
import { filterFranchises, getRoleLabel, isCoachRole } from '../lib/dataFilters';
import { supabase } from '@/app/lib/supabase';

import SevenStrategiesPanel from '../components/reports/SevenStrategiesPanel';
import MarketingReportPanel from '../components/reports/MarketingReportPanel';
import SEOReportPanel from '../components/reports/SEOReportPanel';
import ZipKeywordRankingsPanel from '../components/reports/ZipKeywordRankingsPanel';

type DashboardSection = 'dashboard' | '7strategies' | 'marketing' | 'seo' | 'zip-rankings' | 'schedule';





export default function DashboardScreen() {
  const router = useRouter();
  const { user, profile, isAuthenticated, showAuthModal, setShowAuthModal } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [selectedSection, setSelectedSection] = useState<DashboardSection>('dashboard');
  const [showFoodReviewModal, setShowFoodReviewModal] = useState(false);


  const [dbFranchises, setDbFranchises] = useState<Franchise[]>([]);
  const [franchisesLoading, setFranchisesLoading] = useState(false);

  // DB contacts state (for program distribution)
  const [dbContacts, setDbContacts] = useState<{ program?: string | null }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Real contact counts per franchise from user_profiles
  const [franchiseCounts, setFranchiseCounts] = useState<Map<string, { totalContacts: number; activeClients: number; staff: number }>>(new Map());

  // Activity feed state (fetched from database)
  const [activityFeed, setActivityFeed] = useState<{ id: string; type: string; message: string; time: string; icon: string }[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [kpiItems, setKpiItems] = useState<KPIData[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);

  // Alerts state (fetched from manage-alerts edge function)
  const [alertItems, setAlertItems] = useState<NotificationItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());

  const isCoach = isCoachRole(profile?.role);
  const isDietitian = profile?.role === 'dietitian';
  const isTrainer = profile?.role === 'trainer';
  const isFranchiseManager = profile?.role === 'franchise_manager';
  const isAdmin = profile?.role === 'admin';
  const isStaff = isAdmin || isFranchiseManager || isTrainer || isDietitian;

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
          manager: dbf.manager_name || 'Unassigned',
          managerAvatar: 'https://d64gsuwffb70l.cloudfront.net/698cf5ddf668ea6c9d214f89_1770845766651_5d2978e7.png',
          activeClients: 0, totalTrainers: 0, status: 'good' as const, isActive: dbf.is_active !== false,
        }));
        setDbFranchises(converted);
      }
    } catch (err) { console.log('Error fetching franchises for dashboard:', err); }
    finally { setFranchisesLoading(false); }
  }, [isStaff]);

  const fetchRealCounts = useCallback(async () => {
    if (!isStaff) return;
    try {
      let query = supabase.from('user_profiles').select('franchise, role, contact_status');
      if (user?.id) { query = query.neq('id', user.id); }
      const { data, error } = await query;
      if (error || !data) return;
      const countsMap = new Map<string, { totalContacts: number; activeClients: number; staff: number }>();
      for (const row of data) {
        const fn = (row.franchise || '').toLowerCase();
        if (!fn) continue;
        if (!countsMap.has(fn)) countsMap.set(fn, { totalContacts: 0, activeClients: 0, staff: 0 });
        const c = countsMap.get(fn)!;
        c.totalContacts++;
        if (row.contact_status === 'active-client' || row.contact_status === 'active-jumpstart') c.activeClients++;
        if (row.role === 'trainer' || row.role === 'dietitian' || row.role === 'franchise_manager') c.staff++;
      }
      setFranchiseCounts(countsMap);
    } catch (err) { console.log('Error fetching real counts for dashboard:', err); }
  }, [isStaff, user?.id]);

  const fetchContacts = useCallback(async () => {
    if (!isStaff) return;
    setContactsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-client-data', { body: { action: 'list_contacts' } });
      if (!error && data?.data) { setDbContacts(data.data.map((c: any) => ({ program: c.program || null }))); }
    } catch (err) { console.log('Error fetching contacts for dashboard:', err); }
    finally { setContactsLoading(false); }
  }, [isStaff]);

  const fetchActivityFeed = useCallback(async () => {
    if (!isStaff) return;
    setActivityLoading(true); setActivityError(null);
    try {
      const { data, error } = await supabase.functions.invoke('manage-activity-feed', { body: { action: 'get_recent', limit: 20 } });
      if (error) { setActivityError('Could not load activity feed'); }
      else if (data?.data) { setActivityFeed(data.data); }
      else { setActivityFeed([]); }
    } catch (err) { setActivityError('Could not load activity feed'); }
    finally { setActivityLoading(false); }
  }, [isStaff]);

  const fetchKPIs = useCallback(async () => {
    if (!isStaff) { setKpisLoading(false); return; }
    setKpisLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('compute-kpis', {
        body: { franchise: profile?.franchise || undefined, role: profile?.role || undefined, trainer_name: profile?.trainer_name || undefined },
      });
      if (!error && data?.data) { setKpiItems(data.data); }
    } catch (err) { console.log('Error fetching KPIs:', err); }
    finally { setKpisLoading(false); }
  }, [isStaff, profile?.franchise, profile?.role, profile?.trainer_name]);

  const fetchAlerts = useCallback(async () => {
    if (!isStaff) { setAlertsLoading(false); return; }
    setAlertsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-alerts', {
        body: { action: 'get_alerts', user_id: user?.id || undefined, franchise: profile?.franchise || undefined, role: profile?.role || undefined, trainer_name: profile?.trainer_name || undefined },
      });
      if (!error && data?.data) {
        const mapped: NotificationItem[] = (data.data as any[]).map((a: any) => ({
          id: a.id, severity: a.severity || 'low', title: a.title, message: a.message, franchise: a.franchise, time: a.time, category: a.category, actionRoute: a.actionRoute,
        }));
        setAlertItems(mapped);
        setDismissedAlertIds(new Set());
      }
    } catch (err) { console.log('Error fetching alerts:', err); }
    finally { setAlertsLoading(false); }
  }, [isStaff, user?.id, profile?.franchise, profile?.role, profile?.trainer_name]);

  const handleDismissAlert = useCallback(async (alertId: string) => {
    setDismissedAlertIds(prev => new Set(prev).add(alertId));
    if (user?.id) { supabase.functions.invoke('manage-alerts', { body: { action: 'dismiss', user_id: user.id, alert_key: alertId } }).catch(() => {}); }
  }, [user?.id]);

  const handleDismissAllAlerts = useCallback(async () => {
    const visibleIds = alertItems.filter(a => !dismissedAlertIds.has(a.id)).map(a => a.id);
    setDismissedAlertIds(prev => { const next = new Set(prev); visibleIds.forEach(id => next.add(id)); return next; });
    if (user?.id && visibleIds.length > 0) { supabase.functions.invoke('manage-alerts', { body: { action: 'dismiss_all', user_id: user.id, alert_keys: visibleIds } }).catch(() => {}); }
  }, [user?.id, alertItems, dismissedAlertIds]);

  const handleAlertAction = useCallback((alertId: string, route?: string) => {
    if (route) { router.push(route as any); } else { router.push(isCoach ? '/(tabs)/clients' as any : '/(tabs)/franchises' as any); }
  }, [router, isCoach]);

  const headerNotifications = useMemo(() => alertItems.filter(a => !dismissedAlertIds.has(a.id)), [alertItems, dismissedAlertIds]);

  useEffect(() => {
    fetchFranchises(); fetchContacts(); fetchActivityFeed(); fetchKPIs(); fetchAlerts(); fetchRealCounts();
  }, [fetchFranchises, fetchContacts, fetchActivityFeed, fetchKPIs, fetchAlerts, fetchRealCounts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFranchises(); fetchContacts(); fetchActivityFeed(); fetchKPIs(); fetchAlerts(); fetchRealCounts();
    setTimeout(() => setRefreshing(false), 1500);
  }, [fetchFranchises, fetchContacts, fetchActivityFeed, fetchKPIs, fetchAlerts, fetchRealCounts]);

  const franchises = dbFranchises.filter(f => f.isActive !== false);
  const filteredFranchises = useMemo(() => filterFranchises(franchises, profile), [franchises, profile]);
  const topFranchises = useMemo(() => {
    return [...filteredFranchises].sort((a, b) => {
      const aCounts = franchiseCounts.get(a.name.toLowerCase());
      const bCounts = franchiseCounts.get(b.name.toLowerCase());
      return (bCounts?.totalContacts || 0) - (aCounts?.totalContacts || 0);
    }).slice(0, 5);
  }, [filteredFranchises, franchiseCounts]);

  const realTotalContacts = useMemo(() => { let t = 0; for (const f of filteredFranchises) { t += franchiseCounts.get(f.name.toLowerCase())?.totalContacts || 0; } return t; }, [filteredFranchises, franchiseCounts]);
  const realTotalClients = useMemo(() => { let t = 0; for (const f of filteredFranchises) { t += franchiseCounts.get(f.name.toLowerCase())?.activeClients || 0; } return t; }, [filteredFranchises, franchiseCounts]);
  const realTotalStaff = useMemo(() => { let t = 0; for (const f of filteredFranchises) { t += franchiseCounts.get(f.name.toLowerCase())?.staff || 0; } return t; }, [filteredFranchises, franchiseCounts]);

  const kpiSkeletons: KPIData[] = [
    { id: '1', label: 'Monthly Revenue', value: '--', change: 0, changeLabel: 'vs last month', icon: 'trending-up', color: '#2ecc71' },
    { id: '2', label: 'Active Clients', value: '--', change: 0, changeLabel: 'vs last month', icon: 'people', color: '#3498db' },
    { id: '3', label: 'Retention Rate', value: '--', change: 0, changeLabel: 'vs last quarter', icon: 'repeat', color: '#9b59b6' },
    { id: '4', label: 'Session Completion', value: '--', change: 0, changeLabel: 'vs last month', icon: 'checkmark-circle', color: '#f39c12' },
    { id: '5', label: 'Avg Client LTV', value: '--', change: 0, changeLabel: 'vs last year', icon: 'diamond', color: '#ff6b6b' },
    { id: '6', label: 'NPS Score', value: '--', change: 0, changeLabel: 'vs last quarter', icon: 'star', color: '#1abc9c' },
  ];

  const dynamicKpis = useMemo(() => {
    const source = kpiItems.length > 0 ? kpiItems : kpiSkeletons;
    if (isCoach) {
      const activeClientsKpi = source.find(k => k.id === '2');
      const sessionKpi = source.find(k => k.id === '4');
      const retentionKpi = source.find(k => k.id === '3');
      const npsKpi = source.find(k => k.id === '6');
      return [
        activeClientsKpi ? { ...activeClientsKpi, label: 'My Active Clients' } : kpiSkeletons[1],
        sessionKpi || kpiSkeletons[3], retentionKpi || kpiSkeletons[2], npsKpi || kpiSkeletons[5],
      ];
    }
    return source;
  }, [isCoach, kpiItems]);

  const contactsByFranchiseData = useMemo(() => {
    return filteredFranchises.map(f => ({ label: f.name.length > 10 ? f.name.slice(0, 9) + '…' : f.name, value: franchiseCounts.get(f.name.toLowerCase())?.totalContacts || 0 })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredFranchises, franchiseCounts]);

  const programDistData = useMemo(() => computeProgramDistribution(dbContacts), [dbContacts]);
  const contactsWithProgram = useMemo(() => dbContacts.filter(c => c.program && c.program.trim()).length, [dbContacts]);

  const scopeLabel = useMemo(() => {
    if (!isAuthenticated || !profile) return 'Nationwide Performance';
    if (profile.role === 'admin') return 'Nationwide Performance';
    if (profile.role === 'franchise_manager' && profile.franchise) return `${profile.franchise} Performance`;
    if ((profile.role === 'trainer' || profile.role === 'dietitian') && profile.trainer_name) return `${profile.trainer_name}'s Dashboard`;
    return 'Your Dashboard';
  }, [isAuthenticated, profile]);

  const headerSubtitle = isDietitian ? 'Dietitian Dashboard' : isTrainer ? 'Trainer Dashboard' : isCoach ? 'Coach Dashboard' : isFranchiseManager ? 'Franchise Manager Dashboard' : 'Executive Dashboard';

  const quickActions = useMemo(() => {
    if (isDietitian) return [{ icon: 'restaurant', label: 'Food Reviews', color: '#e67e22', route: '__food_reviews__' }, { icon: 'people', label: 'My Clients', color: COLORS.info, route: '/(tabs)/clients' }, { icon: 'calendar', label: 'Schedule', color: COLORS.accentDark, route: '/(tabs)/schedule' }, { icon: 'bar-chart', label: 'Reports', color: COLORS.success, route: '/(tabs)/reports' }];
    if (isTrainer) return [{ icon: 'people', label: 'My Clients', color: COLORS.info, route: '/(tabs)/clients' }, { icon: 'calendar', label: 'Schedule', color: COLORS.accentDark, route: '/(tabs)/schedule' }, { icon: 'bar-chart', label: 'Reports', color: COLORS.success, route: '/(tabs)/reports' }, { icon: 'people-circle', label: 'Coaches', color: COLORS.accent, route: '/(tabs)/coaches' }];
    if (isCoach) return [{ icon: 'people', label: 'My Clients', color: COLORS.info, route: '/(tabs)/clients' }, { icon: 'calendar', label: 'Schedule', color: COLORS.accentDark, route: '/(tabs)/schedule' }, { icon: 'bar-chart', label: 'Reports', color: COLORS.success, route: '/(tabs)/reports' }, { icon: 'people-circle', label: 'Coaches', color: COLORS.accent, route: '/(tabs)/coaches' }];
    if (isFranchiseManager) return [{ icon: 'calendar', label: 'Schedule', color: COLORS.accentDark, route: '/(tabs)/schedule' }, { icon: 'bar-chart', label: 'Reports', color: COLORS.success, route: '/(tabs)/reports' }];
    return [{ icon: 'people', label: 'Contacts', color: COLORS.info, route: '/(tabs)/clients' }, { icon: 'document-text', label: 'New Report', color: COLORS.success, route: '/(tabs)/reports' }, { icon: 'mail', label: 'Send Blast', color: COLORS.accent, route: '/(tabs)/clients' }, { icon: 'calendar', label: 'Schedule', color: COLORS.accentDark, route: '/(tabs)/schedule' }];
  }, [isCoach, isDietitian, isTrainer, isFranchiseManager]);

  const handleQuickAction = useCallback((route: string) => {
    if (route === '__food_reviews__') { setShowFoodReviewModal(true); } else { router.push(route as any); }
  }, [router]);

  const handleSectionPress = useCallback((section: DashboardSection) => {
    if (section === 'schedule') { router.push('/(tabs)/schedule' as any); } else { setSelectedSection(section); }
  }, [router]);

  // Section tabs — 7 Strategies & Marketing hidden from trainers/dietitians, SEO tab only visible to admin
  const sectionTabs = useMemo(() => {
    const tabs: { label: string; value: DashboardSection; icon: string }[] = [
      { label: 'Dashboard', value: 'dashboard', icon: 'grid' },
    ];
    // Only show 7 Strategies and Marketing to admin and franchise managers (not trainers/dietitians)
    if (!isCoach) {
      tabs.push({ label: '7 Strategies', value: '7strategies', icon: 'layers-outline' });
      tabs.push({ label: 'Marketing', value: 'marketing', icon: 'megaphone' });
    }
    if (isAdmin) {
      tabs.push({ label: 'SEO', value: 'seo', icon: 'search-outline' });
      tabs.push({ label: 'Zip Rankings', value: 'zip-rankings', icon: 'location-outline' });
    }

    tabs.push({ label: 'Schedule', value: 'schedule', icon: 'calendar' });
    return tabs;
  }, [isAdmin, isCoach]);

  // Safety: reset to dashboard if a coach/trainer/dietitian somehow has a restricted section selected
  useEffect(() => {
    if (isCoach && (selectedSection === '7strategies' || selectedSection === 'marketing')) {
      setSelectedSection('dashboard');
    }
  }, [isCoach, selectedSection]);




  return (
    <View style={styles.container}>
      <Header
        title="Elect Wellness"
        subtitle={headerSubtitle}
        notifications={headerNotifications}
        notificationsLoading={alertsLoading}
        onDismissNotification={handleDismissAlert}
        onDismissAllNotifications={handleDismissAllAlerts}
        onNotificationAction={handleAlertAction}
      />

      {/* ── Section Tab Selector ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sectionSelectorScroll}
        contentContainerStyle={styles.sectionSelector}
      >
        {sectionTabs.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.sectionTab, selectedSection === tab.value && tab.value !== 'schedule' && styles.sectionTabActive]}
            onPress={() => handleSectionPress(tab.value)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={selectedSection === tab.value && tab.value !== 'schedule' ? COLORS.white : COLORS.textMuted}
            />
            <Text style={[styles.sectionTabText, selectedSection === tab.value && tab.value !== 'schedule' && styles.sectionTabTextActive]}>
              {tab.label}
            </Text>
            {tab.value === 'schedule' && (
              <Ionicons name="open-outline" size={10} color={COLORS.textMuted} style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >

        {/* ═══ 7 STRATEGIES SECTION (hidden from trainers/dietitians) ═══ */}
        {selectedSection === '7strategies' && !isCoach && (
          <View style={styles.content}>
            <View style={{ marginTop: SPACING.lg }}>
              <SevenStrategiesPanel />
            </View>
            <View style={{ height: 30 }} />
          </View>
        )}

        {/* ═══ MARKETING SECTION (hidden from trainers/dietitians) ═══ */}
        {selectedSection === 'marketing' && !isCoach && (
          <View style={styles.content}>
            <View style={{ marginTop: SPACING.lg }}>
              <MarketingReportPanel />
            </View>
            <View style={{ height: 30 }} />
          </View>
        )}


        {/* ═══ SEO SECTION (admin only) ═══ */}
        {selectedSection === 'seo' && isAdmin && (
          <View style={styles.content}>
            <View style={{ marginTop: SPACING.lg }}>
              <SEOReportPanel />
            </View>
            <View style={{ height: 30 }} />
          </View>
        )}

        {/* ═══ ZIP KEYWORD RANKINGS SECTION (admin only) ═══ */}
        {selectedSection === 'zip-rankings' && isAdmin && (
          <View style={styles.content}>
            <View style={{ marginTop: SPACING.lg }}>
              <ZipKeywordRankingsPanel />
            </View>
            <View style={{ height: 30 }} />
          </View>
        )}



        {/* ═══ DASHBOARD SECTION (original content) ═══ */}
        {selectedSection === 'dashboard' && (
          <>
            {/* Hero Banner */}
            <View style={styles.heroBanner}>
              <Image source={{ uri: HERO_IMAGE }} style={styles.heroImage} />
              <View style={styles.heroOverlay}>
                <Text style={styles.heroTitle}>{scopeLabel}</Text>
                <Text style={styles.heroSubtitle}>
                  {filteredFranchises.length} Location{filteredFranchises.length !== 1 ? 's' : ''} | {realTotalContacts.toLocaleString()} Contact{realTotalContacts !== 1 ? 's' : ''} | {realTotalClients.toLocaleString()} Active Client{realTotalClients !== 1 ? 's' : ''}
                </Text>
                <View style={styles.heroStats}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{realTotalContacts.toLocaleString()}</Text>
                    <Text style={styles.heroStatLabel}>Total Contacts</Text>
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{realTotalClients.toLocaleString()}</Text>
                    <Text style={styles.heroStatLabel}>Active Clients</Text>
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{realTotalStaff.toLocaleString()}</Text>
                    <Text style={styles.heroStatLabel}>Staff</Text>
                  </View>
                </View>
                {isAuthenticated && profile && (
                  <View style={styles.heroRoleBadge}>
                    <Ionicons
                      name={profile.role === 'admin' ? 'shield' : profile.role === 'franchise_manager' ? 'business' : profile.role === 'dietitian' ? 'nutrition' : 'fitness'}
                      size={12}
                      color={COLORS.white}
                    />
                    <Text style={styles.heroRoleText}>
                      Viewing as {getRoleLabel(profile.role)}
                      {profile.franchise ? ` - ${profile.franchise}` : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.content}>
              {/* Dietitian Food Review CTA */}
              {isDietitian && (
                <TouchableOpacity style={styles.foodReviewCTA} onPress={() => setShowFoodReviewModal(true)} activeOpacity={0.8}>
                  <View style={styles.foodReviewCTALeft}>
                    <View style={styles.foodReviewCTAIconWrap}>
                      <Ionicons name="restaurant" size={24} color="#e67e22" />
                    </View>
                    <View style={styles.foodReviewCTAContent}>
                      <Text style={styles.foodReviewCTATitle}>Food Photo Reviews</Text>
                      <Text style={styles.foodReviewCTASubtitle}>Review and provide feedback on client food photos</Text>
                    </View>
                  </View>
                  <View style={styles.foodReviewCTARight}>
                    <Ionicons name="chevron-forward" size={20} color="#e67e22" />
                  </View>
                </TouchableOpacity>
              )}

              {/* Period Selector */}
              <View style={styles.periodRow}>
                {(['week', 'month', 'quarter'] as const).map((period) => (
                  <TouchableOpacity key={period} style={[styles.periodBtn, selectedPeriod === period && styles.periodBtnActive]} onPress={() => setSelectedPeriod(period)}>
                    <Text style={[styles.periodText, selectedPeriod === period && styles.periodTextActive]}>{period.charAt(0).toUpperCase() + period.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* KPI Cards */}
              <SectionHeader title={isCoach ? 'My Metrics' : 'Key Metrics'} icon="pulse" />
              <View style={styles.kpiGrid}>
                {dynamicKpis.map((kpi, i) => (
                  <KPICard key={kpi.id} {...kpi} index={i} loading={kpisLoading} />
                ))}
              </View>

              {/* Franchise Manager Contact Status Dashboard */}
              {isFranchiseManager && <ContactStatusDashboard />}

              {/* Contacts by Franchise Chart */}
              {!isCoach && !isFranchiseManager && (
                <>
                  <SectionHeader title="Contacts by Franchise" subtitle="Total contacts per location" icon="people" actionLabel="Full Report" onAction={() => router.push('/(tabs)/reports')} />
                  <View style={styles.chartCard}>
                    {franchisesLoading ? (
                      <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                        <ActivityIndicator size="small" color={COLORS.accent} />
                        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.sm }}>Loading contact data...</Text>
                      </View>
                    ) : contactsByFranchiseData.length > 0 ? (
                      <BarChart data={contactsByFranchiseData} height={140} barColor={COLORS.accent} />
                    ) : (
                      <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                        <Ionicons name="people-outline" size={32} color={COLORS.textMuted} />
                        <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: SPACING.sm, textAlign: 'center' }}>No contact data yet.</Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Program Distribution */}
              <SectionHeader title="Program Distribution" icon="pie-chart" />
              <View style={styles.chartCard}>
                {contactsLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: SPACING.sm }}>Loading program data...</Text>
                  </View>
                ) : programDistData.length > 0 ? (
                  <DonutChart data={programDistData} size={130} centerValue={`${contactsWithProgram}`} centerLabel="Clients" />
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                    <Ionicons name="pie-chart-outline" size={32} color={COLORS.textMuted} />
                    <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginTop: SPACING.sm, textAlign: 'center' }}>No program data yet.</Text>
                  </View>
                )}
              </View>

              {/* Top Franchises */}
              {!isCoach && topFranchises.length > 0 && (
                <>
                  <SectionHeader title="Top Franchises" subtitle="By contact count" icon="trophy" actionLabel="View All" onAction={() => router.push('/(tabs)/franchises')} />
                  {topFranchises.map((f, i) => {
                    const counts = franchiseCounts.get(f.name.toLowerCase());
                    const contactCount = counts?.totalContacts || 0;
                    const clientCount = counts?.activeClients || 0;
                    return (
                      <TouchableOpacity key={f.id} style={styles.franchiseRow} onPress={() => router.push('/(tabs)/franchises')}>
                        <View style={styles.rankCircle}><Text style={styles.rankText}>{i + 1}</Text></View>
                        <Image source={{ uri: f.managerAvatar }} style={styles.franchiseAvatar} />
                        <View style={styles.franchiseInfo}>
                          <Text style={styles.franchiseName}>{f.name}</Text>
                          <Text style={styles.franchiseLocation}>{f.city}, {f.state}</Text>
                        </View>
                        <View style={styles.franchiseCountsCol}>
                          <Text style={styles.franchiseCountValue}>{contactCount}</Text>
                          <Text style={styles.franchiseCountLabel}>Contact{contactCount !== 1 ? 's' : ''}</Text>
                          <Text style={styles.franchiseCountSub}>{clientCount} active</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* Activity Feed */}
              <SectionHeader title="Recent Activity" icon="time" />
              <View style={styles.activityCard}>
                <ActivityFeed activities={activityFeed} loading={activityLoading} error={activityError} />
              </View>

              {/* Quick Actions */}
              <SectionHeader title="Quick Actions" icon="flash" />
              <View style={styles.quickActionsGrid}>
                {quickActions.map((action, i) => (
                  <TouchableOpacity key={i} style={styles.quickAction} onPress={() => handleQuickAction(action.route)}>
                    <View style={[styles.quickActionIcon, { backgroundColor: action.color + '18' }]}>
                      <Ionicons name={action.icon as any} size={22} color={action.color} />
                    </View>
                    <Text style={styles.quickActionLabel}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 30 }} />
            </View>
          </>
        )}

      </ScrollView>

      {/* Auth Modal */}
      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Food Review Modal (dietitian only) */}
      <FoodReviewModal visible={showFoodReviewModal} onClose={() => setShowFoodReviewModal(false)} />
    </View>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg },
  // Section tab selector
  sectionSelectorScroll: { backgroundColor: COLORS.primary, flexGrow: 0 },
  sectionSelector: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm },
  sectionTab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.md, gap: 4, minWidth: 80 },
  sectionTabActive: { backgroundColor: COLORS.accent },
  sectionTabText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textMuted },
  sectionTabTextActive: { color: COLORS.white },
  heroBanner: { height: 220, position: 'relative', overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%', position: 'absolute' },
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 35, 50, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  heroTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.white, marginBottom: 4 },
  heroSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginBottom: SPACING.md, textAlign: 'center' },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xl },
  heroStat: { alignItems: 'center' },
  heroStatValue: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.accent },
  heroStatLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  heroDivider: { width: 1, height: 30, backgroundColor: COLORS.textMuted + '40' },
  heroRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    gap: 6,
    marginTop: SPACING.md,
  },
  heroRoleText: { fontSize: FONT_SIZES.xs, color: COLORS.white, fontWeight: '600' },
  foodReviewCTA: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginTop: SPACING.lg, borderWidth: 1.5, borderColor: '#e67e2230', ...SHADOWS.md,
  },
  foodReviewCTALeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.md },
  foodReviewCTAIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e67e2215', justifyContent: 'center', alignItems: 'center' },
  foodReviewCTAContent: { flex: 1 },
  foodReviewCTATitle: { fontSize: FONT_SIZES.md, fontWeight: '800', color: COLORS.primary },
  foodReviewCTASubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2, lineHeight: 16 },
  foodReviewCTARight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  periodRow: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: 3, marginTop: SPACING.lg, ...SHADOWS.sm },
  periodBtn: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: BORDER_RADIUS.sm },
  periodBtnActive: { backgroundColor: COLORS.primary },
  periodText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  periodTextActive: { color: COLORS.white },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  chartCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, ...SHADOWS.md },
  franchiseRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md, ...SHADOWS.sm,
  },
  rankCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  rankText: { fontSize: FONT_SIZES.xs, fontWeight: '800', color: COLORS.white },
  franchiseAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.borderLight },
  franchiseInfo: { flex: 1 },
  franchiseName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary },
  franchiseLocation: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  franchiseCountsCol: { alignItems: 'flex-end' },
  franchiseCountValue: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },
  franchiseCountLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600' },
  franchiseCountSub: { fontSize: 9, color: COLORS.textMuted, marginTop: 1 },
  activityCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, ...SHADOWS.md },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  quickAction: {
    flex: 1, minWidth: '45%', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm, ...SHADOWS.md,
  },
  quickActionIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  quickActionLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
});

