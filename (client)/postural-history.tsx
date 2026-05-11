import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES } from '../constants/theme';
import ClientHeader from '../components/client/ClientHeader';
import PosturalAssessmentHistoryPanel from '../components/client/PosturalAssessmentHistoryPanel';
import { useAuth } from '../contexts/AuthContext';

// Full-screen chronological history of postural assessments for the
// logged-in client. Linked from the compact panel on the Biometrics screen.
export default function PosturalHistoryScreen() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ClientHeader title="Postural History" subtitle="AI assessment timeline" />
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={18} color="#9b59b6" />
        <Text style={styles.backText}>Back to Biometrics</Text>
      </TouchableOpacity>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: 40 }}>
        {user?.id && (
          <PosturalAssessmentHistoryPanel
            userId={user.id}
            showChart
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  backRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
  },
  backText: { fontSize: FONT_SIZES.sm, color: '#9b59b6', fontWeight: '700' },
});
