import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { usePalette } from '../theme';

function Bar({ level }: { level: number }) {
  const p = usePalette();
  const style = useAnimatedStyle(() => ({ height: withTiming(3 + level * 37, { duration: 80 }) }));
  return <Animated.View style={[styles.bar, { backgroundColor: p.primary }, style]} />;
}

/** A rolling history of actual microphone volume (dBFS), never a decorative random wave. */
export function VoiceWaveform({ metering, active }: { metering?: number; active: boolean }) {
  const [levels, setLevels] = useState<number[]>(Array(29).fill(0));
  const latest = useRef(metering);
  useEffect(() => { latest.current = metering; }, [metering]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const db = latest.current;
      setLevels((prev) => [...prev.slice(1), db === undefined ? 0 : Math.max(0, Math.min(1, (db + 60) / 60))]);
    }, 80);
    return () => clearInterval(timer);
  }, [active]);
  return <View testID="voice-waveform" accessible={false} style={styles.wave}>{levels.map((level, i) => <Bar key={i} level={active ? level : 0} />)}</View>;
}

const styles = StyleSheet.create({
  wave: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  bar: { width: 4, borderRadius: 3 },
});
