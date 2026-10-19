import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { radius, space, usePalette } from '../theme';
import { Icon, type IconName } from './Icon';

type Variant = 'title' | 'h2' | 'body' | 'small' | 'tiny';

const SIZES: Record<Variant, TextStyle> = {
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16 },
  small: { fontSize: 14 },
  tiny: { fontSize: 12 },
};

export function Txt({
  children,
  variant = 'body',
  dim,
  color,
  style,
  numberOfLines,
  bold,
  testID,
}: {
  children: ReactNode;
  variant?: Variant;
  dim?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  bold?: boolean;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[SIZES[variant], { color: color ?? (dim ? p.textDim : p.text) }, bold && { fontWeight: '700' }, style]}
    >
      {children}
    </Text>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'freezer';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
  compact,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  testID?: string;
}) {
  const p = usePalette();
  const bg = { primary: p.primary, secondary: p.surfaceAlt, ghost: 'transparent', danger: p.toss, freezer: p.freezer }[kind];
  const fg = { primary: p.primaryText, secondary: p.text, ghost: p.primary, danger: '#fff', freezer: '#fff' }[kind];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        kind === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: p.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={compact ? 18 : 20} color={fg} /> : null}
      <Text style={[styles.buttonText, compact && { fontSize: 15 }, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  bg,
  size = 44,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  bg?: string;
  size?: number;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        { backgroundColor: bg ?? p.surface, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={color ?? p.text} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  testID?: string;
}) {
  const p = usePalette();
  const accent = color ?? p.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? accent : p.surfaceAlt,
          borderColor: selected ? accent : p.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={{ color: selected ? '#fff' : p.text, fontSize: 15, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  label: string;
}) {
  const p = usePalette();
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return (
    <Row gap={space.md}>
      <IconButton icon="minus" label="−" size={40} bg={p.surfaceAlt} onPress={() => onChange(Math.max(min, round(value - step)))} />
      <Txt variant="h2" style={{ minWidth: 72, textAlign: 'center' }}>
        {label}
      </Txt>
      <IconButton icon="plus" label="+" size={40} bg={p.surfaceAlt} onPress={() => onChange(round(value + step))} />
    </Row>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonCompact: { minHeight: 42, paddingHorizontal: space.lg },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
});
