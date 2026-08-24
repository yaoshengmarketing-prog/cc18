import {Composition} from 'remotion';
import {VerticalReview} from './VerticalReview';
import {verticalReviewSchema} from './schema';

export const RemotionRoot = () => <Composition
  id="CC18Vertical"
  component={VerticalReview}
  durationInFrames={270}
  fps={30}
  width={1080}
  height={1920}
  schema={verticalReviewSchema}
  defaultProps={{
    id: 'CC18-DEMO-001',
    actress: '示範演員',
    hook: '從公開設定裡，找到這部作品真正不同的距離感。',
    reviewLine: '題材熟悉，人物關係的轉折才是這次值得注意的地方。',
    tags: ['新片', '劇情設定'],
    imageOne: 'images/demo-cover.svg',
    imageTwo: 'images/demo-hero.svg',
    siteName: 'CC18 影格',
  }}
/>;
