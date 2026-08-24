import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VerticalReviewProps} from '../schema';

export const CtaScene: React.FC<VerticalReviewProps> = ({siteName}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  return <AbsoluteFill style={{backgroundColor: '#f1a778', color: '#101b25', padding: 80, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
    <Interactive.Div name="CTA title" style={{fontFamily: 'Arial, sans-serif', fontSize: 73, fontWeight: 900, lineHeight: 1.15, scale: interpolate(frame, [0, .45 * fps], [.86, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.spring({damping: 200}), output: 'perceptual-scale'})}}>完整影評<br />看 {siteName}</Interactive.Div>
    <Interactive.Div name="CTA source" style={{fontFamily: 'Arial, sans-serif', fontSize: 29, fontWeight: 600, letterSpacing: 3, marginTop: 36}}>作品入口 · CC18.TV</Interactive.Div>
  </AbsoluteFill>;
};
