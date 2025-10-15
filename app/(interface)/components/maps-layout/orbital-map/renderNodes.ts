import * as d3 from 'd3';
import { getFontSizeForRadius, getRadiusByDepth } from './renderUtils';
import { getPaletteColor, getReadableTextColor, shiftColor } from '@/app/(interface)/lib/utils/colors';
import { getNodeId } from './physics';

const LOGO_MAP: Record<string, string> = {
  'Folder Fox': '/assets/folder-fox.png',
  'Google Drive': '/assets/google-drive-logo.png',
  Dropbox: '/assets/dropbox-logo.png',
  OneDrive: '/assets/onedrive-logo.png',
  Notion: '/assets/notion-logo.png',
};

const EXCLUSIVE_LOGOS = ['Folder Fox', 'Google Drive', 'Dropbox', 'OneDrive', 'Notion'];

const getClipIdForNode = (node: any) => `clip-${getNodeId(node).toString().replace(/[^a-zA-Z0-9_-]/g, '-')}`;

export function renderNodes(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
  visibleNodes: any[],
  colorPaletteId?: string,
) {
  const node = nodeLayer
    .selectAll<SVGGElement, any>('g.node')
    .data(visibleNodes, d => getNodeId(d))
    .join(
      enter => {
        const group = enter
          .append('g')
          .attr('class', 'node')
          .style('pointer-events', 'all')
          .style('opacity', 0)
          .attr('transform', d => {
            const parent = d.parent;
            const px = parent?.x ?? d.x ?? 0;
            const py = parent?.y ?? d.y ?? 0;
            return `translate(${px},${py}) scale(0.6)`;
          });

        group.each(function (d: any) {
          const selection = d3.select(this);
          const radius = getRadiusByDepth(d.depth);
          const logoPath = LOGO_MAP[d.data.name];
          const isExclusiveLogo = EXCLUSIVE_LOGOS.includes(d.data.name) && d.depth <= 1 && logoPath;

          if (isExclusiveLogo && logoPath) {
            const clipId = getClipIdForNode(d);
            const defsSelection = svg.select<SVGDefsElement>('defs');
            const defs = defsSelection.empty() ? svg.append('defs') : defsSelection;
            defs.select<SVGClipPathElement>(`#${clipId}`).remove();
            defs
              .append('clipPath')
              .attr('id', clipId)
              .append('circle')
              .attr('r', radius * 0.75)
              .attr('cx', 0)
              .attr('cy', 0);

            selection
              .append('circle')
              .attr('class', 'node-body node-body--logo')
              .attr('r', radius * 0.8)
              .attr('fill', '#fff')
              .attr('stroke', '#ccc')
              .attr('stroke-width', 2);

            selection
              .append('image')
              .attr('href', logoPath)
              .attr('x', -radius * 0.5)
              .attr('y', -radius * 0.5)
              .attr('width', radius)
              .attr('height', radius)
              .attr('clip-path', `url(#${clipId})`)
              .style('cursor', 'pointer');
          } else {
            selection
              .append('circle')
              .attr('class', 'node-body')
              .attr('r', radius)
              .attr('fill', getPaletteColor(colorPaletteId, d.depth))
              .attr('stroke', shiftColor(getPaletteColor(colorPaletteId, d.depth), -0.2))
              .attr('stroke-width', 2)
              .attr('fill-opacity', 0.95)
              .style('cursor', 'pointer');
          }
        });

        group
          .filter(d => !EXCLUSIVE_LOGOS.includes(d.data.name))
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .style('pointer-events', 'none')
          .attr('font-weight', 600);

        group.append('title').text(d => d.data.name);

        return group.call(sel =>
          sel
            .transition()
            .duration(280)
            .style('opacity', 1)
            .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0}) scale(1)`),
        );
      },
      update => update,
      exit =>
        exit.call(sel =>
          sel
            .transition()
            .duration(200)
            .style('opacity', 0)
            .attr('transform', d => {
              const parent = d.parent;
              const px = parent?.x ?? 0;
              const py = parent?.y ?? 0;
              return `translate(${px},${py}) scale(0.6)`;
            })
            .remove(),
        ),
    );

  node.each(function (d: any) {
    const selection = d3.select(this);
    const radius = getRadiusByDepth(d.depth);
    const logoPath = LOGO_MAP[d.data.name];
    const isExclusiveLogo = EXCLUSIVE_LOGOS.includes(d.data.name) && d.depth <= 1 && logoPath;

    const circle = selection.select<SVGCircleElement>('circle.node-body');
    if (!circle.empty()) {
      if (isExclusiveLogo && logoPath) {
        circle.attr('r', radius * 0.8);
      } else {
        circle
          .attr('r', radius)
          .attr('fill', getPaletteColor(colorPaletteId, d.depth))
          .attr('stroke', shiftColor(getPaletteColor(colorPaletteId, d.depth), -0.2));
      }
    }

    const text = selection.select<SVGTextElement>('text');
    if (!text.empty()) {
      const fontSize = getFontSizeForRadius(getRadiusByDepth(d.depth));
      const maxChars = Math.floor((getRadiusByDepth(d.depth) * 2) / 7);
      const name =
        d.data.name.length > maxChars ? `${d.data.name.slice(0, Math.max(1, maxChars - 1))}…` : d.data.name;

      text
        .attr('font-size', fontSize)
        .attr('fill', getReadableTextColor(getPaletteColor(colorPaletteId, d.depth)))
        .text(name);
    }

    selection.select<SVGTitleElement>('title').text(d.data.name);
  });

  return node;
}
