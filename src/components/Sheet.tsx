import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, usePalette } from '../theme';
import { IconButton, Row, Txt } from './ui';

/** Bottom sheet over a dimmed backdrop. Tapping the backdrop closes it. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  scroll = true,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const p = usePalette();
  const native = useSafeAreaInsets();
  const insets = Platform.OS === 'web' ? { bottom: 0 } : native;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: p.overlay }]}>
            <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="close" />
          </Animated.View>
          <View style={styles.anchor} pointerEvents="box-none">
            <Animated.View
              testID={testID}
              entering={SlideInDown.duration(240)}
              style={[styles.sheet, { backgroundColor: p.bg, paddingBottom: Math.max(insets.bottom, space.lg) }]}
            >
              <View style={[styles.handle, { backgroundColor: p.border }]} />
              {title !== undefined && (
                <Row style={styles.header}>
                  <Txt variant="h2" style={{ flex: 1 }} numberOfLines={1}>
                    {title}
                  </Txt>
                  <IconButton icon="x" label="close" size={36} onPress={onClose} bg={p.surfaceAlt} />
                </Row>
              )}
              {scroll ? (
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={styles.bodyContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {children}
                </ScrollView>
              ) : (
                <View style={[styles.body, styles.bodyContent]}>{children}</View>
              )}
              {footer && <View style={styles.footer}>{footer}</View>}
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.sm,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.sm },
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.lg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
});
