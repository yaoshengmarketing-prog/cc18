import {defineCollection} from 'astro:content';
import {glob} from 'astro/loaders';
import {z} from 'astro/zod';

const reviews = defineCollection({
  loader: glob({pattern: '**/*.{md,mdx}', base: './content/reviews'}),
  schema: z.object({
    id: z.string().regex(/^[A-Z0-9-]+$/),
    title: z.string(),
    actress: z.array(z.string()).default([]),
    releaseDate: z.coerce.date(),
    publishedAt: z.coerce.date(),
    studio: z.string().optional(),
    series: z.string().optional(),
    sourceUrl: z.url(),
    sourceSite: z.literal('cc18.tv'),
    coverUrl: z.string(),
    heroUrl: z.string().optional(),
    videoUrl: z.url().optional(),
    shortReview: z.string(),
    editorialAngle: z.string(),
    sourceTags: z.array(z.string()).default([]),
    canonicalTags: z.array(z.string()).default([]),
    discoveryTags: z.array(z.string()).default([]),
    status: z.enum(['draft', 'published']).default('draft'),
    videoStatus: z.enum(['pending', 'rendered', 'retry', 'skipped']).default('pending'),
    featured: z.boolean().default(false),
  }),
});

export const collections = {reviews};
