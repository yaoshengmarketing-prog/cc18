const internalPhrases = [
  '目前沒有足夠的分散影片引用',
  '執行環境未能開啟外部頁面',
];

export function publicMetaDescription(description, title = '') {
  if (!internalPhrases.some((phrase) => description.includes(phrase))) return description;
  const id = /[A-Z0-9]+(?:-[A-Z0-9]+)+/i.exec(description)?.[0]
    ?? /[A-Z0-9]+(?:-[A-Z0-9]+)+/i.exec(title)?.[0];
  return `${id ? `${id}｜` : ''}整理公開作品資料、演員與題材設定，協助依作品資訊選片。`;
}
