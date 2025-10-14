import * as d3 from 'd3';
import { getFontSizeForRadius, getRadiusByDepth } from './renderUtils';
import { getPaletteColor, getReadableTextColor, shiftColor } from '@/app/(interface)/lib/utils/colors';

const LOGO_MAP: Record<string, string> = {
  'Folder Fox': '/assets/folder-fox.png',
  'Google Drive': '/assets/google-drive-logo.png',
  Dropbox: '/assets/dropbox-logo.png',
  OneDrive: '/assets/onedrive-logo.png',
  Notion: '/assets/notion-logo.png',
};

export function renderNodes(svg: any, g: any, visibleNodes: any[], colorPaletteId?: string) {
  const node = g
    .append('g')
    .selectAll('g')
    .data(visibleNodes)
    .join('g');

  node.each(function (d) {
    const group = d3.select(this);
    const radius = getRadiusByDepth(d.depth);
    const logoPath = LOGO_MAP[d.data.name];

    const isExclusiveLogo =
      ['Folder Fox', 'Google Drive', 'Dropbox', 'OneDrive', 'Notion'].includes(d.data.name) &&
      d.depth <= 1;

    if (isExclusiveLogo && logoPath) {
      const clipId = `clip-${d.data.name.replace(/\s+/g, '-')}-${Math.random()
        .toString(36)
        .substring(2, 7)}`;
      svg
        .append('defs')
        .append('clipPath')
        .attr('id', clipId)
        .append('circle')
        .attr('r', radius * 0.75)
        .attr('cx', 0)
        .attr('cy', 0);

      group
        .append('circle')
        .attr('r', radius * 0.8)
        .attr('fill', '#fff')
        .attr('stroke', '#ccc')
        .attr('stroke-width', 2);

      group
        .append('image')
        .attr('href', logoPath)
        .attr('x', -radius * 0.5)
        .attr('y', -radius * 0.5)
        .attr('width', radius)
        .attr('height', radius)
        .attr('clip-path', `url(#${clipId})`)
        .style('cursor', 'pointer');
    } else {
      group
        .append('circle')
        .attr('r', radius)
        .attr('fill', d => getPaletteColor(colorPaletteId, d.depth))
        .attr('stroke', d => shiftColor(getPaletteColor(colorPaletteId, d.depth), -0.2))
        .attr('stroke-width', 2)
        .attr('fill-opacity', 0.95)
        .style('cursor', 'pointer');
    }
  });

  node
    .filter(
      d =>
        !['Folder Fox', 'Google Drive', 'Dropbox', 'OneDrive', 'Notion'].includes(d.data.name),
    )
    .append('text')
    .text(d => d.data.name)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .style('pointer-events', 'none')
    .attr('font-weight', 600)
    .attr('font-size', d => getFontSizeForRadius(getRadiusByDepth(d.depth)))
    .attr('fill', d => getReadableTextColor(getPaletteColor(colorPaletteId, d.depth)))
    .each(function (d) {
      const textSel = d3.select(this);
      const maxChars = Math.floor((getRadiusByDepth(d.depth) * 2) / 7);
      const name =
        d.data.name.length > maxChars ? d.data.name.slice(0, maxChars - 1) + '…' : d.data.name;
      textSel.text(name);
    });

  node.append('title').text(d => d.data.name);

  return node;
}
