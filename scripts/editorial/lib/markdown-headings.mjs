export const renderEditorialMarkdownBody = ({titleVersion, title, sections}) => {
  const sectionLevel = titleVersion === 2 ? '###' : '##';
  const body = sections.map(({heading, body: paragraph}) => `${sectionLevel} ${heading}\n\n${paragraph}`).join('\n\n');
  return titleVersion === 2 ? `## ${title}\n\n${body}` : body;
};
