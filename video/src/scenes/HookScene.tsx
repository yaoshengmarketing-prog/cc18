import {AbsoluteFill, CanvasImage, Easing, Interactive, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VerticalReviewProps} from '../schema';

export const HookScene: React.FC<VerticalReviewProps> = ({hook, imageOne}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const src = imageOne.startsWith('http') ? imageOne : staticFile(imageOne);
  return <AbsoluteFill style={{backgroundColor: '#101b25'}}>
    <CanvasImage name="Hook image" src={src} width={1080} height={1920} fit="cover" style={{width: 1080, height: 1920, scale: interpolate(frame, [0, 3 * fps], [1, 1.08], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.2,.8,.2,1)})}} />
    <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(16,27,37,.08) 25%, rgba(16,27,37,.92) 88%)'}} />
    <Interactive.Div name="Story hook" style={{position: 'absolute', left: 72, right: 72, bottom: 135, color: '#fffdf9', fontFamily: 'Arial, sans-serif', fontSize: 70, fontWeight: 800, lineHeight: 1.28, opacity: interpolate(frame, [.25 * fps, .85 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [.25 * fps, .85 * fps], ['0px 50px', '0px 0px'], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.16,1,.3,1)})}}>{hook}</Interactive.Div>
  </AbsoluteFill>;
};
