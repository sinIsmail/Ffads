// Ffads — Deep AI Analysis Card (Premium Interactive Component)
// Default = collapsed idle button. Tap to analyze or view results. Always closeable.
import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { detectAnimals, getRiskLevel, RISK_CFG } from './AICardHelpers';
import { PulsingDot, ShimmerLine, ScoreCircle } from './AICardAnimations';
import { styles } from './AICard.styles';

// ─────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────
export default function AICard({
  isIdle,          // no analysis running and no data yet
  isLoading,
  animalContentFlag,
  animalContentDetails,
  harmfulChemicals,
  aiScore,
  aiRecommendation,
  hasIngredients,
  progressText,
  onAnalyze,
  onClose,
}) {
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;
  const [open, setOpen]           = useState(false);  // results panel open/closed
  const [chemExpanded, setChemExpanded] = useState(false);

  const hasData = aiScore !== undefined && aiScore !== null;

  // Collapse when data disappears (e.g. after close from parent)
  useEffect(() => {
    if (!hasData) setOpen(false);
  }, [hasData]);

  // Animate in when opening results
  useEffect(() => {
    if (open && hasData) {
      fadeIn.setValue(0);
      slideUp.setValue(20);
      Animated.parallel([
        Animated.timing(fadeIn,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideUp, { toValue: 0, duration: 400, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]).start();
    }
  }, [open, hasData]);

  function handleClose() {
    setOpen(false);
    setChemExpanded(false);
    onClose?.();
  }

  // ── STATE: Loading ──────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.card}>
        <LinearGradient colors={['#F8FAFC', '#EFF6FF']} style={styles.loadingHeader}>
          <View style={styles.loadingHeaderRow}>
            <View style={styles.pulsingRow}>
              <PulsingDot delay={0} />
              <PulsingDot delay={200} />
              <PulsingDot delay={400} />
            </View>
            <Text style={styles.loadingTitle}>{progressText || 'Analyzing ingredients...'}</Text>
          </View>
        </LinearGradient>
        <View style={styles.loadingBody}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <View style={styles.loadingCircle} />
            <View style={{ flex: 1 }}>
              <ShimmerLine width="70%" height={13} />
              <ShimmerLine width="50%" height={10} />
            </View>
          </View>
          <ShimmerLine width="90%" height={10} />
          <ShimmerLine width="75%" height={10} />
          <ShimmerLine width="60%" height={10} />
        </View>
      </View>
    );
  }

  // ── STATE: Idle or collapsed (show the tap button) ──────
  const showIdleButton = isIdle || !open;

  if (showIdleButton) {
    const analyzed = hasData; // already has results waiting
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!hasIngredients && !analyzed}
        onPress={() => {
          if (analyzed) {
            setOpen(true);          // just open existing results
          } else {
            onAnalyze?.();          // trigger analysis
            setOpen(true);
          }
        }}
      >
        <View style={[styles.idleCard, (!hasIngredients && !analyzed) && { opacity: 0.45 }]}>
          <View style={styles.idleLeft}>
            <View style={styles.idleIconWrap}>
              <Text style={{ fontSize: 22 }}>🧠</Text>
            </View>
            <View style={styles.idleTexts}>
              <Text style={styles.idleTitle}>
                {analyzed ? 'View AI Analysis' : 'Run Deep AI Analysis'}
              </Text>
              <Text style={styles.idleSub}>
                {analyzed
                  ? 'Tap to see chemicals, animals & score'
                  : hasIngredients
                    ? 'Chemicals · Animal content · Safety score'
                    : 'No ingredients — AI unavailable'}
              </Text>
            </View>
          </View>
          <View style={[styles.idleChevron, analyzed && styles.idleChevronReady]}>
            <Ionicons
              name={analyzed ? 'eye-outline' : 'chevron-forward'}
              size={18}
              color={analyzed ? '#4F46E5' : '#94A3B8'}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── STATE: Results open ─────────────────────────────────
  if (!hasData) return null;

  const detectedAnimals = animalContentFlag ? detectAnimals(animalContentDetails) : [];
  const counts = { high: 0, medium: 0, low: 0 };
  (harmfulChemicals || []).forEach(c => { counts[getRiskLevel(c.risk)]++; });
  const totalChems = (harmfulChemicals || []).length;
  const LIMIT = 3;
  const visibleChems = chemExpanded ? (harmfulChemicals || []) : (harmfulChemicals || []).slice(0, LIMIT);

  return (
    <Animated.View style={[styles.card, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>

      {/* ── Header ── */}
      <View style={styles.resultHeader}>
        <View style={styles.resultHeaderLeft}>
          <Text style={{ fontSize: 18 }}>🧠</Text>
          <Text style={styles.resultHeaderTitle}>AI Analysis</Text>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

      <View style={styles.resultBody}>

        {/* ── Score row ── */}
        <View style={styles.scoreRow}>
          <ScoreCircle score={aiScore} />
          <View style={styles.scoreSide}>
            {aiRecommendation ? (
              <>
                <Text style={styles.verdictLabel}>AI Verdict</Text>
                <Text style={styles.verdictText} numberOfLines={5}>{aiRecommendation}</Text>
              </>
            ) : (
              <Text style={styles.verdictText}>Analysis complete.</Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Animal Content ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <Text style={styles.secIcon}>🐾</Text>
            <Text style={styles.secLabel}>Animal Content</Text>
            <View style={[styles.pill, animalContentFlag ? styles.pillRed : styles.pillGreen]}>
              <Text style={[styles.pillText, { color: animalContentFlag ? '#DC2626' : '#059669' }]}>
                {animalContentFlag ? 'Detected' : 'None'}
              </Text>
            </View>
          </View>

          {animalContentFlag && detectedAnimals.length > 0 ? (
            <View style={styles.animalList}>
              {detectedAnimals.map((a, i) => (
                <View key={i} style={styles.animalRow}>
                  <Text style={styles.animalEmoji}>{a.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.animalLabel}>{a.label}</Text>
                    <Text style={styles.animalDef}>{a.def}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : !animalContentFlag ? (
            <View style={styles.safeRow}>
              <Ionicons name="leaf-outline" size={14} color="#059669" />
              <Text style={styles.safeText}>No animal-derived ingredients detected</Text>
            </View>
          ) : animalContentDetails ? (
            <Text style={styles.animalDef}>{animalContentDetails}</Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        {/* ── Harmful Chemicals ── */}
        <View style={styles.section}>
          <View style={styles.secHeader}>
            <Text style={styles.secIcon}>☠️</Text>
            <Text style={styles.secLabel}>Harmful Chemicals</Text>
            <View style={[styles.pill, totalChems > 0 ? styles.pillRed : styles.pillGreen]}>
              <Text style={[styles.pillText, { color: totalChems > 0 ? '#DC2626' : '#059669' }]}>
                {totalChems > 0 ? `${totalChems} found` : 'Clean'}
              </Text>
            </View>
          </View>

          {/* Risk summary row */}
          {totalChems > 0 && (
            <View style={styles.riskSummaryRow}>
              {counts.high   > 0 && <View style={[styles.riskChip, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}><Text style={[styles.riskChipTxt, { color: '#DC2626' }]}>☠️ {counts.high} High</Text></View>}
              {counts.medium > 0 && <View style={[styles.riskChip, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}><Text style={[styles.riskChipTxt, { color: '#D97706' }]}>⚠️ {counts.medium} Medium</Text></View>}
              {counts.low    > 0 && <View style={[styles.riskChip, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}><Text style={[styles.riskChipTxt, { color: '#059669' }]}>⚡ {counts.low} Low</Text></View>}
            </View>
          )}

          {totalChems > 0 ? (
            <>
              {visibleChems.map((chem, i) => {
                const lvl = getRiskLevel(chem.risk);
                const cfg = RISK_CFG[lvl];
                return (
                  <View key={i} style={[styles.chemCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                    <View style={styles.chemTopRow}>
                      <Text style={styles.chemIcon}>{cfg.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.chemName}>{chem.name}</Text>
                        {chem.realName && <Text style={styles.chemAlias}>aka {chem.realName}</Text>}
                      </View>
                      <View style={[styles.riskBadge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '50' }]}>
                        <Text style={[styles.riskBadgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    {chem.risk && (
                      <View style={styles.chemRiskRow}>
                        <Ionicons name="information-circle-outline" size={13} color="#64748B" />
                        <Text style={styles.chemRiskTxt}>{chem.risk}</Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {totalChems > LIMIT && (
                <TouchableOpacity style={styles.expandBtn} onPress={() => setChemExpanded(!chemExpanded)}>
                  <Text style={styles.expandBtnTxt}>
                    {chemExpanded ? '▲ Show less' : `▼ Show ${totalChems - LIMIT} more`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.safeRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#059669" />
              <Text style={styles.safeText}>No harmful chemicals detected</Text>
            </View>
          )}
        </View>

        {/* ── Close at bottom ── */}
        <TouchableOpacity style={styles.closeBtnBottom} onPress={handleClose} activeOpacity={0.75}>
          <Ionicons name="chevron-up" size={14} color="#64748B" />
          <Text style={styles.closeBtnBottomText}>Close Analysis</Text>
        </TouchableOpacity>

      </View>
    </Animated.View>
  );
}
