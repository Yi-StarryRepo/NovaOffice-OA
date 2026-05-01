<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import type { Department } from '../types';

const props = defineProps<{
  data: Department[];
}>();

const chartRef = ref<HTMLElement | null>(null);

const renderChart = () => {
  if (!chartRef.value || props.data.length === 0) return;

  const container = chartRef.value;
  container.innerHTML = '';

  const width = container.clientWidth;
  const height = container.clientHeight || 600;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto; font: 10px sans-serif;');

  const g = svg.append('g');

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  const root = d3.hierarchy(props.data[0]);
  const nodeWidth = 180;
  const nodeHeight = 80;

  const treeLayout = d3.tree<Department>()
    .nodeSize([nodeWidth + 40, nodeHeight + 80]);

  const positionedRoot = treeLayout(root);
  const linkVertical = d3.linkVertical<d3.HierarchyPointLink<Department>, d3.HierarchyPointNode<Department>>()
    .x((d) => d.x)
    .y((d) => d.y);

  const initialTransform = d3.zoomIdentity
    .translate(width / 2, 100)
    .scale(0.8);
  svg.call(zoom.transform, initialTransform);

  g.append('g')
    .attr('fill', 'none')
    .attr('stroke', '#e2e8f0')
    .attr('stroke-width', 1.5)
    .selectAll('path')
    .data(positionedRoot.links())
    .join('path')
    .attr('d', linkVertical);

  const node = g.append('g')
    .selectAll('g')
    .data(positionedRoot.descendants())
    .join('g')
    .attr('transform', (d) => `translate(${d.x - nodeWidth / 2},${d.y})`);

  node.append('rect')
    .attr('width', nodeWidth)
    .attr('height', nodeHeight)
    .attr('rx', 16)
    .attr('ry', 16)
    .attr('fill', '#ffffff')
    .attr('stroke', (d) => d.depth === 0 ? '#2563eb' : '#e2e8f0')
    .attr('stroke-width', (d) => d.depth === 0 ? 3 : 1)
    .attr('class', 'shadow-sm');

  node.append('text')
    .attr('x', nodeWidth / 2)
    .attr('y', 25)
    .attr('text-anchor', 'middle')
    .attr('class', 'font-sans font-bold text-slate-900')
    .attr('style', 'font-size: 14px; fill: #0f172a;')
    .text((d) => d.data.name);

  node.append('text')
    .attr('x', nodeWidth / 2)
    .attr('y', 45)
    .attr('text-anchor', 'middle')
    .attr('class', 'font-sans text-slate-400')
    .attr('style', 'font-size: 11px; fill: #94a3b8;')
    .text((d) => `负责人: ${d.data.manager}`);

  const badgeWidth = 60;
  node.append('rect')
    .attr('x', (nodeWidth - badgeWidth) / 2)
    .attr('y', 55)
    .attr('width', badgeWidth)
    .attr('height', 18)
    .attr('rx', 9)
    .attr('fill', '#f1f5f9');

  node.append('text')
    .attr('x', nodeWidth / 2)
    .attr('y', 68)
    .attr('text-anchor', 'middle')
    .attr('class', 'font-sans font-bold text-blue-600')
    .attr('style', 'font-size: 10px; fill: #2563eb;')
    .text((d) => `${d.data.memberCount} 人`);
};

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
});

watch(() => props.data, renderChart, { deep: true });
</script>

<template>
  <div class="w-full h-full relative group">
    <div ref="chartRef" class="w-full h-full cursor-grab active:cursor-grabbing"></div>
    <div class="absolute bottom-4 left-4 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
      滚轮缩放 / 拖拽移动
    </div>
  </div>
</template>

<style scoped>
:deep(path) {
  transition: stroke 0.3s;
}
:deep(rect) {
  transition: all 0.3s;
}
:deep(g:hover rect) {
  stroke: #2563eb;
  stroke-width: 2;
}
</style>
