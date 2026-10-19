import './src/lib/webSetup';

import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Shell } from './src/shell/Shell';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Shell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
