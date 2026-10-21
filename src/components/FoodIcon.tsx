import { memo } from 'react';
import { Image, View } from 'react-native';

import type { Bucket, ItemState, LocalizedName } from '../shared/types.ts';
import { usePalette } from '../theme';
import { Icon } from './Icon';

export interface FoodIdentity {
  name?: LocalizedName;
  bucket?: Bucket;
  state?: ItemState;
  pantryGroup?: string;
}

// One bundled, painted atlas gives every platform the same food illustrations.
const atlas = require('../../assets/food/raphael-atlas.png');
// Source rectangles include only the painted object; rows in the illustration
// have optical spacing, so equal grid crops would reveal neighboring artwork.
const frames = [
  [25, 80, 290, 226], [355, 62, 227, 239], [625, 41, 309, 293], [965, 69, 269, 244],
  [94, 338, 136, 292], [320, 402, 284, 203], [644, 406, 279, 203], [991, 334, 234, 290],
  [22, 672, 291, 238], [324, 693, 281, 202], [623, 720, 334, 163], [956, 692, 274, 204],
  [20, 954, 300, 227], [379, 918, 180, 278], [637, 971, 291, 214], [943, 953, 296, 230],
];
function cell(food: FoodIdentity): number {
  const name = food.name?.en.toLowerCase() ?? '';
  if (food.state === 'cooked' || food.bucket === 'cooked' || food.bucket === 'precooked') return 11;
  if (/strawberr|berries|raspberr|blueberr/.test(name)) return 0;
  if (/yogurt|yoghurt|cream|tarator/.test(name)) return 7;
  if (/milk/.test(name)) return 4;
  if (/egg|omelette/.test(name)) return 5;
  if (/cheese|butter/.test(name)) return 6;
  if (/chicken|turkey|poultry/.test(name)) return 8;
  if (/fish|salmon|tuna|shrimp|seafood/.test(name)) return 10;
  if (/beef|steak|pork|lamb|sausage|meat/.test(name)) return 9;
  if (/carrot/.test(name)) return 2;
  if (/tomato/.test(name) && !/sauce|paste/.test(name)) return 15;
  if (/rice|pasta|spaghetti|oat/.test(name)) return 14;
  if (/bread|toast|bagel|tortilla/.test(name)) return 12;
  return { fruits: 1, veggies: 3, meats: 9, dairy: 6, grains: 12, precooked: 11, cooked: 11, other: 13 }[food.bucket ?? 'other'];
}

export const FoodIcon = memo(function FoodIcon({ food, size = 40 }: { food: FoodIdentity; size?: number }) {
  const p = usePalette();
  if (food.pantryGroup === 'household') return <Icon name="shelves" color={p.textDim} size={size} />;
  const index = cell(food);
  const [x, y, width, height] = frames[index];
  const scale = size / Math.max(width, height);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <View style={{ width: width * scale, height: height * scale, overflow: 'hidden' }}>
        <Image
          source={atlas}
          accessible={false}
          fadeDuration={0}
          style={{ position: 'absolute', width: 1254 * scale, height: 1254 * scale, left: -x * scale, top: -y * scale }}
        />
      </View>
    </View>
  );
});
