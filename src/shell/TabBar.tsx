import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../components/Icon';
import { useT, type StringKey } from '../i18n';
import type { Tab } from '../state/ui';
import { space, usePalette } from '../theme';

const TABS: { tab: Tab; icon: IconName; label: StringKey }[] = [
  { tab: 'assistant', icon: 'mic', label: 'tab_assistant' },
  { tab: 'fridge', icon: 'fridge', label: 'tab_fridge' },
  { tab: 'recipes', icon: 'pot', label: 'tab_recipes' },
  { tab: 'pantry', icon: 'shelves', label: 'tab_pantry' },
];

/** Screens switch from this bar only, so sideways swipes always belong to items. */
export function TabBar({ tab, onChange, bottom }: { tab: Tab; onChange: (t: Tab) => void; bottom: number }) {
  const t = useT();
  const p = usePalette();
  return (
    <View style={[styles.bar, { backgroundColor: p.surface, borderColor: p.border, paddingBottom: Math.max(bottom, space.sm) }]}>
      {TABS.map(({ tab: key, icon, label }) => {
        const active = key === tab;
        return (
          <Pressable
            key={key}
            testID={`tab-${key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(key)}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, active && { backgroundColor: p.primarySoft }]}>
              <Icon name={icon} size={22} color={active ? p.primary : p.textDim} />
            </View>
            <Text style={[styles.label, { color: active ? p.primary : p.textDim }]} numberOfLines={1}>
              {t(label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.xs },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  iconWrap: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700' },
});
