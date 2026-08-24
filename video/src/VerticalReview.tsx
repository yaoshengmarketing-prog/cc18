import {TransitionSeries} from '@remotion/transitions';
import type {VerticalReviewProps} from './schema';
import {OpeningScene} from './scenes/OpeningScene';
import {HookScene} from './scenes/HookScene';
import {ReviewScene} from './scenes/ReviewScene';
import {CtaScene} from './scenes/CtaScene';

export const VerticalReview: React.FC<VerticalReviewProps> = (props) => <TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60} name="Logo + 番號 + 演員"><OpeningScene {...props} /></TransitionSeries.Sequence>
  <TransitionSeries.Sequence durationInFrames={90} name="故事 Hook"><HookScene {...props} /></TransitionSeries.Sequence>
  <TransitionSeries.Sequence durationInFrames={90} name="影評核心 + Tags"><ReviewScene {...props} /></TransitionSeries.Sequence>
  <TransitionSeries.Sequence durationInFrames={30} name="CTA"><CtaScene {...props} /></TransitionSeries.Sequence>
</TransitionSeries>;
