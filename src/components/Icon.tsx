import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'mic'
  | 'camera'
  | 'plus'
  | 'search'
  | 'snow'
  | 'fridge'
  | 'pot'
  | 'shelves'
  | 'sliders'
  | 'x'
  | 'check'
  | 'undo'
  | 'keyboard'
  | 'speaker'
  | 'stop'
  | 'up'
  | 'down'
  | 'trash'
  | 'refresh'
  | 'clock'
  | 'users'
  | 'send'
  | 'image'
  | 'minus';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color, strokeWidth = 2 }: Props) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(() => {
        switch (name) {
          case 'mic':
            return (
              <>
                <Rect x={9} y={2} width={6} height={12} rx={3} {...p} />
                <Path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" {...p} />
              </>
            );
          case 'camera':
            return (
              <>
                <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" {...p} />
                <Circle cx={12} cy={13} r={3.5} {...p} />
              </>
            );
          case 'plus':
            return <Path d="M12 5v14M5 12h14" {...p} />;
          case 'minus':
            return <Path d="M5 12h14" {...p} />;
          case 'search':
            return (
              <>
                <Circle cx={11} cy={11} r={7} {...p} />
                <Path d="M21 21l-4.3-4.3" {...p} />
              </>
            );
          case 'snow':
            return <Path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2M4 11l2.5 1L4 13M20 11l-2.5 1 2.5 1" {...p} />;
          case 'fridge':
            return (
              <>
                <Rect x={5} y={2} width={14} height={20} rx={2.5} {...p} />
                <Path d="M5 10h14M8.5 5.5v1.5M8.5 13v3" {...p} />
              </>
            );
          case 'pot':
            return <Path d="M4 11h16v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4zM2 11h20M9 7.5c0-1.2 1-1.8 1-3M14 7.5c0-1.2 1-1.8 1-3" {...p} />;
          case 'shelves':
            return <Path d="M4 3v18M20 3v18M4 9h16M4 15h16M4 21h16M8 6.5h3M13 12.5h4M7 18.5h5" {...p} />;
          case 'sliders':
            return (
              <>
                <Path d="M4 6h9M19 6h1M4 12h3M11 12h9M4 18h11M19 18h1" {...p} />
                <Circle cx={16} cy={6} r={2.2} {...p} />
                <Circle cx={9} cy={12} r={2.2} {...p} />
                <Circle cx={17} cy={18} r={2.2} {...p} />
              </>
            );
          case 'x':
            return <Path d="M18 6L6 18M6 6l12 12" {...p} />;
          case 'check':
            return <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />;
          case 'undo':
            return <Path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" {...p} />;
          case 'keyboard':
            return (
              <>
                <Rect x={2} y={6} width={20} height={12} rx={2} {...p} />
                <Path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" {...p} />
              </>
            );
          case 'speaker':
            return <Path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" {...p} />;
          case 'stop':
            return <Rect x={6} y={6} width={12} height={12} rx={2.5} {...p} fill={color} />;
          case 'up':
            return <Path d="M6 15l6-6 6 6" {...p} />;
          case 'down':
            return <Path d="M6 9l6 6 6-6" {...p} />;
          case 'trash':
            return <Path d="M3 6h18M8 6V4h8v2M18.5 6l-.9 13.1A2 2 0 0 1 15.6 21H8.4a2 2 0 0 1-2-1.9L5.5 6" {...p} />;
          case 'refresh':
            return <Path d="M20 12a8 8 0 1 1-2.6-5.9L20 8.5M20 3.5v5h-5" {...p} />;
          case 'clock':
            return (
              <>
                <Circle cx={12} cy={12} r={9} {...p} />
                <Path d="M12 7v5l3 2" {...p} />
              </>
            );
          case 'users':
            return (
              <>
                <Circle cx={9} cy={8} r={3.5} {...p} />
                <Path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 7.4M21.5 20a6.5 6.5 0 0 0-4-6" {...p} />
              </>
            );
          case 'send':
            return <Path d="M21 3L10 14M21 3l-6.5 18-4.5-7-7-4.5L21 3z" {...p} />;
          case 'image':
            return (
              <>
                <Rect x={3} y={3} width={18} height={18} rx={2.5} {...p} />
                <Circle cx={9} cy={9} r={2} {...p} />
                <Path d="M21 15l-5-5L5 21" {...p} />
              </>
            );
        }
      })()}
    </Svg>
  );
}
