import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VerticalReviewProps} from '../schema';

export const OpeningScene: React.FC<VerticalReviewProps> = ({id, actress}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  return <AbsoluteFill style={{backgroundColor: '#101b25', color: '#fffdf9', padding: 88, justifyContent: 'center'}}>
    <Interactive.Div name="Brand mark" style={{fontFamily: 'Arial, sans-serif', color: '#f1a778', fontSize: 34, fontWeight: 700, letterSpacing: 10, opacity: interpolate(frame, [0, .4 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.16, 1, .3, 1)})}}>CC18 影格</Interactive.Div>
    <Interactive.Div name="Movie number" style={{fontFamily: 'Arial, sans-serif', fontSize: 122, fontWeight: 900, lineHeight: 1, marginTop: 35, translate: interpolate(frame, [0, .7 * fps], ['0px 90px', '0px 0px'], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.16, 1, .3, 1)}), opacity: interpolate(frame, [0, .5 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{id}</Interactive.Div>
    <Interactive.Div name="Actress" style={{fontFamily: 'Arial, sans-serif', color: '#9bc9c5', fontSize: 52, fontWeight: 600, marginTop: 30, opacity: interpolate(frame, [.35 * fps, .8 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{actress}</Interactive.Div>
  </AbsoluteFill>;
};
