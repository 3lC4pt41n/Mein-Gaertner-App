import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchTasks } from '../services/taskService';
import WeatherWidget from '../components/WeatherWidget';
import { colors, spacing, radius, shadows } from '../theme/tokens';
import i18n, { t } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

// ── Helpers ──────────────────────────────────────────

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

  // Pad with empty days for alignment (Mon = 0)
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1; // Convert Sun=0 to Mon-based
  for (let i = 0; i < startDow; i++) days.push(null);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Locale-aware month name via Intl
function getMonthName(year, month) {
  const locale = i18n.locale || 'de';
  return new Date(year, month, 1).toLocaleString(locale, { month: 'long' });
}

// Locale-aware day-of-week headers (Mon–Sun)
function getDowHeaders() {
  const locale = i18n.locale || 'de';
  const headers = [];
  // 2024-01-01 is a Monday
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 1 + i);
    headers.push(d.toLocaleString(locale, { weekday: 'short' }));
  }
  return headers;
}

// ── Main Component ──────────────────────────────────

export default function CalendarScreen() {
  const { userId } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayModalVisible, setDayModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (userId) loadTasks();
    }, [userId, month, year])
  );

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchTasks(userId);
      setTasks(data || []);
    } catch (e) {
      console.warn('Calendar load error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Group tasks by date
  const tasksByDate = {};
  for (const task of tasks) {
    if (!task.due_at) continue;
    const key = toDateKey(new Date(task.due_at));
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push(task);
  }

  const days = getMonthDays(year, month);

  const goToPrev = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const goToNext = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const openDay = (day) => {
    setSelectedDay(day);
    setDayModalVisible(true);
  };

  const dayTasks = selectedDay ? (tasksByDate[toDateKey(selectedDay)] || []) : [];

  // Dot colors for a day
  const getDayDots = (day) => {
    const key = toDateKey(day);
    const dayTasks = tasksByDate[key] || [];
    if (dayTasks.length === 0) return [];
    const hasCompleted = dayTasks.some(t => t.state === 'COMPLETED');
    const hasOverdue = dayTasks.some(t => t.state === 'DUE' && new Date(t.due_at) < new Date());
    const hasDue = dayTasks.some(t => t.state === 'DUE');
    const hasSkipped = dayTasks.some(t => t.state === 'SKIPPED');

    const dots = [];
    if (hasCompleted) dots.push(colors.success);
    if (hasOverdue) dots.push(colors.danger);
    else if (hasDue) dots.push(colors.primaryLight);
    if (hasSkipped) dots.push(colors.warning);
    return dots;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Text style={styles.screenTitle}>{t('calendar.title')}</Text>

      <WeatherWidget />

      {/* Month Navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goToPrev} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {getMonthName(year, month)} {year}
        </Text>
        <TouchableOpacity onPress={goToNext} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.dowRow}>
        {getDowHeaders().map((d, i) => (
          <Text key={i} style={styles.dowText}>{d}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryLight} style={{ marginTop: spacing.xxxl }} />
      ) : (
        <View style={styles.grid}>
          {days.map((day, idx) => {
            if (!day) {
              return <View key={`empty-${idx}`} style={styles.dayCell} />;
            }

            const isToday = isSameDay(day, today);
            const dots = getDayDots(day);
            const key = toDateKey(day);
            const count = (tasksByDate[key] || []).length;
            const isPast = day < today && !isToday;

            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.dayCell,
                  isToday && styles.todayCell,
                ]}
                onPress={() => count > 0 && openDay(day)}
                activeOpacity={count > 0 ? 0.6 : 1}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.todayText,
                    isPast && { color: colors.textTertiary },
                  ]}
                >
                  {day.getDate()}
                </Text>
                {dots.length > 0 && (
                  <View style={styles.dotsRow}>
                    {dots.slice(0, 3).map((color, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: color }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primaryLight }]} />
          <Text style={styles.legendText}>{t('calendar.due')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>{t('calendar.completed')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendText}>{t('calendar.overdue')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>{t('calendar.skipped')}</Text>
        </View>
      </View>

      {/* Day Detail Modal */}
      <Modal
        visible={dayModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDayModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPressOut={() => setDayModalVisible(false)}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <Text style={styles.sheetTitle}>
              {selectedDay && selectedDay.toLocaleDateString(i18n.locale || 'de', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            {dayTasks.length === 0 ? (
              <Text style={{ textAlign: 'center', color: colors.textTertiary }}>{t('tasks.noTasks')}</Text>
            ) : (
              <FlatList
                data={dayTasks}
                keyExtractor={(item) => item.id?.toString()}
                renderItem={({ item }) => (
                  <View style={styles.taskRow}>
                    <Ionicons
                      name={
                        item.state === 'COMPLETED' ? 'checkmark-circle' :
                        item.state === 'SKIPPED' ? 'remove-circle' :
                        'ellipse-outline'
                      }
                      size={20}
                      color={
                        item.state === 'COMPLETED' ? colors.success :
                        item.state === 'SKIPPED' ? colors.warning :
                        colors.primaryLight
                      }
                      style={{ marginRight: spacing.sm }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>
                        {item.type}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {item.plant?.name || '?'} – {new Date(item.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={[
                      styles.stateBadge,
                      {
                        backgroundColor: item.state === 'COMPLETED' ? colors.primarySurface :
                          item.state === 'SKIPPED' ? colors.warningSurface :
                          colors.infoSurface,
                        color: item.state === 'COMPLETED' ? colors.primary :
                          item.state === 'SKIPPED' ? colors.warning :
                          colors.info,
                      }
                    ]}>
                      {item.state}
                    </Text>
                  </View>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  navBtn: {
    padding: spacing.sm,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginHorizontal: spacing.lg,
  },
  dowRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  dowText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
    color: colors.textTertiary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  todayCell: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.sm,
  },
  dayText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  todayText: {
    fontWeight: 'bold',
    color: colors.primary,
  },
  dotsRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 1,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.xs,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '50%',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stateBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
