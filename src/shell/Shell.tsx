import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddSheet } from '../components/AddSheet';
import { ItemSheet } from '../components/ItemSheet';
import { QuantityPicker } from '../components/QuantityPicker';
import { ScanSheet } from '../components/ScanSheet';
import { SettingsSheet } from '../components/SettingsSheet';
import { ToastHost } from '../components/Toast';
import { AssistantScreen } from '../screens/AssistantScreen';
import { FridgeScreen } from '../screens/FridgeScreen';
import { PantryScreen } from '../screens/PantryScreen';
import { RecipesScreen } from '../screens/RecipesScreen';
import { useSession } from '../state/session';
import { useFridge } from '../state/store';
import { useUi } from '../state/ui';
import { usePalette } from '../theme';
import { TabBar } from './TabBar';

export function Shell() {
  const p = usePalette();
  const native = useSafeAreaInsets();
  // On the web the hosting page handles the phone's safe areas.
  const insets = Platform.OS === 'web' ? { top: 0, bottom: 0 } : native;
  const ready = useFridge((s) => s.ready);
  const init = useFridge((s) => s.init);
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const picker = useUi((s) => s.picker);
  const askQuantity = useUi((s) => s.askQuantity);

  useEffect(() => {
    void init().then(() => useSession.getState().boot());
  }, [init]);

  if (!ready) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: p.bg }]}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: p.bg, paddingTop: insets.top }]}>
      <View style={styles.fill}>
        {tab === 'assistant' && <AssistantScreen />}
        {tab === 'fridge' && <FridgeScreen bottomInset={0} />}
        {tab === 'recipes' && <RecipesScreen />}
        {tab === 'pantry' && <PantryScreen />}
        <ToastHost bottom={tab === 'fridge' || tab === 'recipes' ? 84 : 16} />
      </View>
      <TabBar tab={tab} onChange={setTab} bottom={insets.bottom} />
      <ItemSheet />
      <AddSheet />
      <ScanSheet />
      <SettingsSheet />
      <QuantityPicker request={picker} onClose={() => askQuantity(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
