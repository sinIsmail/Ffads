// Ffads — AICard Styles
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // ── Idle collapsed button ─────────────────────────────
  idleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16,
    marginVertical: 10, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
    justifyContent: 'space-between',
  },
  idleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  idleIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  idleTexts: { flex: 1 },
  idleTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', letterSpacing: -0.2 },
  idleSub:   { fontSize: 12, color: '#94A3B8', marginTop: 2, lineHeight: 16 },
  idleChevron: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  idleChevronReady: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },

  // ── Card shell ────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    marginVertical: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07, shadowRadius: 16, elevation: 5,
  },

  // ── Loading ───────────────────────────────────────────
  loadingHeader: { paddingHorizontal: 20, paddingVertical: 16 },
  loadingHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pulsingRow: { flexDirection: 'row', gap: 5 },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1' },
  loadingTitle: { fontSize: 14, fontWeight: '700', color: '#4338CA' },
  loadingBody: { padding: 20 },
  loadingCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F1F5F9', borderWidth: 3, borderColor: '#E2E8F0',
  },

  // ── Result header ─────────────────────────────────────
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  resultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', letterSpacing: -0.3 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
  },

  // ── Body ──────────────────────────────────────────────
  resultBody: { padding: 18, gap: 16 },
  divider: { height: 1, backgroundColor: '#F1F5F9' },
  section: { gap: 10 },

  // ── Score Circle ─────────────────────────────────────
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreOuter: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  scoreInner: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 1,
  },
  scoreNum:   { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  scoreSlash: { fontSize: 11, fontWeight: '700', marginTop: 9 },
  scoreBadge: {
    position: 'absolute', bottom: -9,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  scoreBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  scoreSide: { flex: 1, gap: 4 },
  verdictLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  verdictText: { fontSize: 13, color: '#475569', lineHeight: 19, fontWeight: '500' },

  // ── Section headers ───────────────────────────────────
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  secIcon:   { fontSize: 15 },
  secLabel:  { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillRed:   { backgroundColor: '#FEF2F2' },
  pillGreen: { backgroundColor: '#ECFDF5' },
  pillText:  { fontSize: 11, fontWeight: '800' },

  safeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  safeText: { fontSize: 13, color: '#059669', fontWeight: '600' },

  // ── Animal ────────────────────────────────────────────
  animalList: { gap: 8 },
  animalRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FFF8F1', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  animalEmoji: { fontSize: 28, lineHeight: 34 },
  animalLabel: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 2 },
  animalDef:   { fontSize: 12, color: '#64748B', lineHeight: 17 },

  // ── Chemicals ─────────────────────────────────────────
  riskSummaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  riskChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  riskChipTxt: { fontSize: 11, fontWeight: '700' },
  chemCard: {
    borderRadius: 14, padding: 13, borderWidth: 1, gap: 7,
  },
  chemTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  chemIcon:   { fontSize: 18, lineHeight: 22 },
  chemName:   { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  chemAlias:  { fontSize: 11, color: '#64748B', fontStyle: 'italic', marginTop: 1 },
  riskBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
    alignSelf: 'flex-start',
  },
  riskBadgeTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  chemRiskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  chemRiskTxt: { fontSize: 12, color: '#475569', lineHeight: 17, flex: 1 },

  expandBtn: {
    alignSelf: 'center', marginTop: 2,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#F8FAFC', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0',
  },
  expandBtnTxt: { fontSize: 12, fontWeight: '700', color: '#6366F1' },

  // ── Bottom close ─────────────────────────────────────
  closeBtnBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, marginTop: 4,
    backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
  },
  closeBtnBottomText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
});
