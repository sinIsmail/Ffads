// Ffads — Profile Shared Styles
// Used by ProfileScreen + all profile tab components
import { StyleSheet, Platform } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius, shadows } from '../../theme/spacing';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  // Header
  headerCard: {
    borderRadius: borderRadius.xl, padding: spacing.xl,
    alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg,
  },
  avatarRing: {
    width: 84, height: 84, borderRadius: 42,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 36 },
  headerName: { ...typography.h2, color: '#FFF', marginBottom: 4 },
  headerSub: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginBottom: 20 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.lg, paddingVertical: 14, paddingHorizontal: 20,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h3, color: '#FFF' },

  // Tab bar (scrollable to fit all items and prevent floating nav clipping)
  tabBarWrapper: {
    marginBottom: spacing.lg,
  },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, padding: 4,
    borderWidth: 1, borderColor: colors.border,
    minWidth: '100%'
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: borderRadius.md, gap: 6,
    minWidth: 80,
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabText: { ...typography.captionBold, color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  // Tab content
  tabContent: { gap: 16 },

  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  cardTitle: { ...typography.h4, color: colors.text, flex: 1 },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginBottom: 14 },

  freeBadge: {
    backgroundColor: '#22C55E20', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  freeText: { fontSize: 10, fontWeight: '800', color: '#22C55E' },

  // Inputs
  inputGroup: {
    marginTop: 12,
  },
  inputLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  apiInput: {
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    ...typography.body,
    color: colors.text,
  },

  // Allergy chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.full, paddingHorizontal: 12, paddingVertical: 8,
  },
  allergyChipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipEmoji: { fontSize: 14 },
  chipLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  chipLabelOn: { color: colors.primary },

  // Diet
  dietRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dietPill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: colors.border,
  },
  dietPillOn: { backgroundColor: colors.secondarySoft, borderColor: colors.secondary },
  dietText: { ...typography.captionBold, color: colors.textSecondary },
  dietTextOn: { color: colors.secondaryDark },

  // Model selector
  modelRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: borderRadius.lg, marginTop: 6,
    backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: 'transparent',
  },
  modelRowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modelRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  modelRadioOn: { borderColor: colors.primary },
  modelRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  modelInfo: { flex: 1 },
  modelName: { ...typography.bodyBold, color: colors.text },
  modelNameOn: { color: colors.primaryDark },
  modelDesc: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  modelTagBadge: {
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  modelTagText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },

  // Rate limit chips
  limitRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  limitChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  limitLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  limitValue: { fontSize: 10, fontWeight: '800', color: colors.text },

  // Legend
  legendBox: {
    marginTop: 14, padding: 12, borderRadius: borderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: colors.border,
  },
  legendTitle: { ...typography.captionBold, color: colors.textSecondary, marginBottom: 4 },
  legendItem: { ...typography.small, color: colors.textMuted, lineHeight: 16 },

  // API input row
  apiInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, overflow: 'hidden',
  },
  eyeBtn: {
    padding: 12,
  },

  // API action buttons
  apiBtnRow: {
    flexDirection: 'row', gap: 10, marginTop: 14,
  },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 12,
    borderRadius: borderRadius.lg, ...shadows.sm,
  },
  saveBtnDisabled: { backgroundColor: colors.textMuted, opacity: 0.5 },
  saveBtnText: { ...typography.captionBold, color: '#FFF' },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  testBtnText: { ...typography.captionBold, color: colors.primary },

  // Unsaved banner
  unsavedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#F59E0B15', borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: '#F59E0B30',
  },
  unsavedText: { ...typography.small, color: '#D97706', fontWeight: '600' },

  // Validation status
  validatingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
  },
  validatingText: { ...typography.body, color: colors.textSecondary },
  resultBox: { marginTop: 4 },
  resultBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, borderRadius: borderRadius.lg, borderWidth: 1,
  },
  resultTitle: { ...typography.bodyBold, marginBottom: 2 },
  resultMessage: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  statusEmptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
  },
  statusEmptyText: { ...typography.body, color: colors.textMuted },

  // Status (legacy)
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { ...typography.body, color: colors.text, flex: 1 },
  statusValue: { ...typography.captionBold },

  // Danger
  dangerCard: { borderColor: colors.danger + '20' },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: borderRadius.lg,
    backgroundColor: colors.danger + '10', marginTop: 8,
  },
  dangerBtnText: { ...typography.bodyBold, color: colors.danger },

  // Empty state
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    ...shadows.sm, marginTop: spacing.md,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  emptyDesc: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  // Multi-key styles
  keyCountBadge: {
    backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: borderRadius.full, marginLeft: 'auto',
  },
  keyCountText: { ...typography.captionBold, color: colors.primaryDark },
  keyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.lg,
    padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  keyRowActive: {
    borderColor: colors.primary + '60', backgroundColor: colors.primarySoft + '30',
  },
  keyInfo: { flex: 1 },
  keyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  keyIndex: { ...typography.captionBold, color: colors.textSecondary },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  activeBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  keyPreview: { ...typography.caption, color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  keyActions: { flexDirection: 'row', alignItems: 'center' },
  keyActionBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  emptyKeysBox: {
    alignItems: 'center', paddingVertical: spacing.lg, gap: 8,
  },
  emptyKeysText: { ...typography.caption, color: colors.textMuted },
  addKeySection: { marginTop: spacing.md },
  addKeyBtn: {
    width: 44, height: 44, borderRadius: borderRadius.lg,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },

  // --- VINTAGE MINIMAL UI STYLES ---
  safeArea: { flex: 1, backgroundColor: '#FAF9F6' },
  headerBlock: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    backgroundColor: '#FAF9F6',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarImagePlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#EAE8E3',
    alignItems: 'center', justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#1A1A1A',
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FAF9F6',
  },
  nameText: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },
  emailText: { fontSize: 16, color: '#666666', marginTop: 4 },
  
  headerAuthBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FEF2F2',
  },
  headerAuthBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.05)' },
  statNum: { fontSize: 24, fontWeight: '800', color: '#1A1A1A' },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#666666', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 36, marginBottom: 8, marginTop: 12 },
  menuContainer: {
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 8,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  menuDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.03)', marginHorizontal: 20 },
  menuIconBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  menuRowText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  menuBadge: {
    backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, marginRight: 8,
  },
  menuBadgeText: { fontSize: 12, fontWeight: '800', color: '#059669' },
  
  logoutBtnModern: { marginHorizontal: 24, backgroundColor: '#FEF2F2', borderRadius: 20, paddingVertical: 18, alignItems: 'center', marginBottom: 40, marginTop: 10 },
  logoutTextModern: { fontSize: 16, fontWeight: '700', color: '#EF4444' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  editCard: {
    backgroundColor: '#FAF9F6', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 32, paddingBottom: 60,
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingHorizontal: 24, paddingTop: 20 },
  modalTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A1A' },
  modalSubTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  modalCloseBtn: { padding: 8, backgroundColor: '#EAE8E3', borderRadius: 20 },

  avatarPicker: { alignItems: 'center', marginBottom: 32 },
  avatarImageLarge: { width: 120, height: 120, borderRadius: 60 },
  avatarImagePlaceholderLarge: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#EAE8E3', alignItems: 'center', justifyContent: 'center' },
  changePhotoText: { fontSize: 14, fontWeight: '600', color: '#666666', marginTop: 12 },

  inputLabelVintage: { fontSize: 13, fontWeight: '700', color: '#666666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  vintageInput: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, fontSize: 16, fontWeight: '500', color: '#1A1A1A',
    marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)'
  },
  saveBtnVintage: { backgroundColor: '#1A1A1A', borderRadius: 20, paddingVertical: 18, alignItems: 'center', marginTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 4 },
  saveBtnTextVintage: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
