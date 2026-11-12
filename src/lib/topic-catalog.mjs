import {loadPublishedMovieCardRecords} from './movie-master.mjs';

export const projectPublishedTopicCatalog = (records) => {
  const topics = new Map();
  for (const {card, canonical_topic_tag_ids: topicIds} of records) {
    for (const id of topicIds) {
      if (!topics.has(id)) topics.set(id, []);
      topics.get(id).push(card);
    }
  }
  return [...topics].map(([id, cards]) => ({
    id,
    cards: cards.sort((left, right) => (
      (right.release_date ?? '').localeCompare(left.release_date ?? '')
      || left.catalog_code.localeCompare(right.catalog_code, 'en')
    )),
  })).sort((left, right) => right.cards.length - left.cards.length || left.id.localeCompare(right.id, 'en'));
};

export const loadPublishedTopicCatalog = async () => {
  const {records} = await loadPublishedMovieCardRecords();
  return projectPublishedTopicCatalog(records);
};
