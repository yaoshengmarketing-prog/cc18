import {z} from 'zod';

export const verticalReviewSchema = z.object({
  id: z.string(), actress: z.string(), hook: z.string(), reviewLine: z.string(),
  tags: z.array(z.string()).max(4), imageOne: z.string(), imageTwo: z.string(), siteName: z.string(),
});
export type VerticalReviewProps = z.infer<typeof verticalReviewSchema>;
