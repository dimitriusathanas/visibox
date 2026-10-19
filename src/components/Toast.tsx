import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useT } from '../i18n';
import { useFridge } from '../state/store';
import { radius, space, usePalette } from '../theme';

/** The undo bar that follows every swipe. */
export function ToastHost({ bottom }: { bottom: number }) {
  const toast = useFridge((s) => s.toast);
  const dismiss = useFridge((s) => s.dismissToast);
  const undo = useFridge((s) => s.undoLast);
  const tossInstead = useFridge((s) => s.tossInstead);
  const t = useT();
  const p = usePalette();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, toast.tossMessage ? 7000 : 5000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(150)}
        style={[styles.toast, { backgroundColor: p.text }]}
        testID="toast"
      >
        <Text style={[styles.message, { color: p.bg }]} numberOfLines={2}>
          {toast.message}
        </Text>
        <View style={styles.actions}>
          {toast.tossMessage && (
            <Pressable onPress={tossInstead} hitSlop={8} testID="toast-toss">
              <Text style={[styles.action, { color: p.bg, opacity: 0.85 }]}>{t('tossed_instead')}</Text>
            </Pressable>
          )}
          {toast.canUndo && (
            <Pressable onPress={undo} hitSlop={8} testID="toast-undo">
              <Text style={[styles.action, { color: p.primarySoft }]}>{t('undo')}</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.md },
  toast: {
    width: '100%',
    maxWidth: 560,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  message: { fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.xl },
  action: { fontSize: 15, fontWeight: '800' },
});
