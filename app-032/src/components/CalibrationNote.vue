<script setup lang="ts">
/**
 * 打印比例角注条：与 1:1 放样图各页角注、三份导出单子、本机存档同用一份比例（calibration.ts）。
 * 同时点名仍按老比例出具的单据（改比例 / 改取舍后这些要作废重来）。
 */
import { computed } from 'vue'
import type { Lantern } from '../core/types'
import { cornerNote, docKindName, fmtPct, staleDocs, statusOf } from '../core/calibration'

const props = defineProps<{ lantern: Lantern }>()

const note = computed(() => cornerNote(props.lantern))
const status = computed(() => statusOf(props.lantern))
const stale = computed(() => staleDocs(props.lantern))

function staleText(): string {
  return stale.value
    .map((d) => `${docKindName(d.kind)}（出具时 ${d.scale != null ? fmtPct(d.scale) : '未校验'}）`)
    .join('、')
}
</script>

<template>
  <section class="cal-note" :class="`st-${status}`">
    <p class="line">
      <b>打印比例角注</b>：{{ note }}
      <span class="prec">精度：实测长度 mm 留 1 位小数 · 比例 % 留 2 位小数 · 换算 cm 留 1 位小数</span>
    </p>
    <p v-if="stale.length" class="stale">
      ⚠ 以下 {{ stale.length }} 处仍按老比例出具，与当前比例不一致，已作废、需重新导出 / 打印：<b>{{ staleText() }}</b>。
      若已照老比例裁料，已裁好的那几片一并作废重来。
    </p>
  </section>
</template>

<style scoped>
.cal-note {
  border: 1px solid var(--line);
  border-left: 4px solid var(--gold);
  border-radius: 8px;
  background: var(--surface);
  padding: 9px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cal-note.st-ok {
  border-left-color: var(--jade);
}

.cal-note.st-rejected,
.cal-note.st-reprint {
  border-left-color: var(--red);
  background: #fdf3f1;
}

.cal-note.st-rescale {
  border-left-color: var(--gold);
  background: #fdf8ec;
}

.line {
  margin: 0;
  font-size: 12.5px;
  color: var(--ink);
}

.prec {
  margin-left: 8px;
  font-size: 11.5px;
  color: var(--ink-soft);
}

.stale {
  margin: 0;
  font-size: 12.5px;
  color: #8f1c19;
  background: #fbeae6;
  border: 1px solid #e7c3bb;
  border-radius: 6px;
  padding: 6px 10px;
}
</style>
