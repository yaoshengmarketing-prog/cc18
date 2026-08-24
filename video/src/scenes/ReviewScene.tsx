import {AbsoluteFill, CanvasImage, Easing, Interactive, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {VerticalReviewProps} from '../schema';

export const ReviewScene: React.FC<VerticalReviewProps> = ({reviewLine, tags, imageTwo}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const src = imageTwo.startsWith('http') ? imageTwo : staticFile(imageTwo);
  return <AbsoluteFill style={{backgroundColor: '#18303d'}}>
    <CanvasImage name="Review image" src={src} width={1080} height={1920} fit="cover" style={{width: 1080, height: 1920, opacity: .42, translate: interpolate(frame, [0, 3 * fps], ['-18px 0px', '18px 0px'], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.2,.8,.2,1)}), scale: 1.06}} />
    <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(16,27,37,.94), rgba(16,27,37,.45))'}} />
    <Interactive.Div name="Review line" style={{position: 'absolute', left: 75, right: 75, top: 570, color: '#fffdf9', fontFamily: 'Arial, sans-serif', fontSize: 66, fontWeight: 800, lineHeight: 1.34, opacity: interpolate(frame, [.2 * fps, .75 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [.2 * fps, .75 * fps], ['0px 55px', '0px 0px'], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.16,1,.3,1)})}}>{reviewLine}</Interactive.Div>
    <Interactive.Div name="Tags" style={{position: 'absolute', left: 75, right: 75, bottom: 170, display: 'flex', flexWrap: 'wrap', gap: 14, color: '#9bc9c5', fontFamily: 'Arial, sans-serif', fontSize: 32, fontWeight: 700}}>{tags.map((tag) => <span key={tag} style={{padding: '12px 18px', border: '2px solid #9bc9c5'}}>#{tag}</span>)}</Interactive.Div>
  </AbsoluteFill>;
};
