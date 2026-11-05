import {defineCollection} from 'astro:content';
import {glob} from 'astro/loaders';
import {z} from 'astro/zod';
import taxonomy from '../data/taxonomy.json';

const knownTagIds = new Set(taxonomy.tags.map(({id}) => id));
const canonicalTagId = z.string().refine((id) => knownTagIds.has(id), {
  message: 'Tag ID is not present in data/taxonomy.json',
});
const editorialTagIds = new Set(taxonomy.tags.filter(({group}) => group === 'editorial').map(({id}) => id));
const editorialTagId = z.string().refine((id) => editorialTagIds.has(id), {
  message: 'Editorial tag ID must belong to the editorial taxonomy group',
});

const reviews = defineCollection({
  loader: glob({pattern: '**/*.{md,mdx}', base: './content/reviews'}),
  schema: z.object({
    id: z.string().regex(/^[A-Z0-9-]+$/),
    sourceTitle: z.string().min(1),
    originalTitleJa: z.string().min(1).nullable().optional(),
    translatedTitleZhTw: z.string().min(1).nullable().optional(),
    title: z.string().min(1),
    workTitle: z.string().min(1).optional(),
    displayShortTitle: z.string().min(1).optional(),
    seoTitle: z.string().min(1),
    socialTitle: z.string().min(1),
    titleSignals: z.array(z.string().min(1)).max(4),
    titleVersion: z.number().int().positive(),
    actress: z.array(z.string()).default([]),
    releaseDate: z.coerce.date(),
    publishedAt: z.coerce.date(),
    studio: z.string().optional(),
    series: z.string().optional(),
    sourceUrl: z.url(),
    sourceSite: z.literal('cc18.tv'),
    coverUrl: z.string(),
    heroUrl: z.string().optional(),
    videoUrl: z.string().regex(/^\/media\/works\//).optional(),
    shortReview: z.string(),
    editorialAngle: z.string(),
    sourceTags: z.array(z.string()).default([]),
    canonicalTagIds: z.array(canonicalTagId).max(24).default([]),
    editorialTagIds: z.array(editorialTagId).max(4).default([]),
    status: z.enum(['draft', 'published']).default('draft'),
    imageStatus: z.enum(['pending', 'rendered', 'retry', 'skipped']).default('pending'),
    videoStatus: z.enum(['pending', 'rendered', 'retry', 'skipped']).default('pending'),
    featured: z.boolean().default(false),
  }),
});

export const collections = {reviews};
