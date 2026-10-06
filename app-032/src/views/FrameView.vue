<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChecksPanel from '../components/ChecksPanel.vue'
import { getLantern } from '../core/store'
import { computeAll } from '../core/checks'
import { DEFAULT_LOFT_OPTIONS } from '../core/paginate'
import { groupMembers } from '../core/frame'
import { kindName, membersCsv, downloadText } from '../core/exporter'
import { styleLabel } from '../core/craft'
import { actualToPaper, calibrationNote, fmtScalePct, isOriginalScale, recordedScale } from '../core/calibration'
import type { FrameMember } from '../core/types'

const route = useRoute()
const router = useRouter()
const lantern = computed(() => getLantern(route.params.id as string))
const full = computed(() => {
  const l = lantern.value
  if (!l) return null
  return computeAll(l, { ...DEFAULT_LOFT_OPTIONS, paper: l.pageSize, overlapMm: l.overlapMm })
})
const groups = computed(() => (full.value ? groupMembers(full.value.frame.members) : []))

/** 记录在案的实测比例（null = 未校验，不按原大处理） */
const scale = computed(() => (lantern.value ? recordedScale(lantern.value) : null))
const calNote = computed(() => (lantern.value ? calibrationNote(lantern.value) : ''))
/** 按实测比例换算下料（convert 且比例 ≠ 100%）时显示「纸上读数」列 */
const showConvert = computed(() => {
  const l = lantern.value
  return !!(l?.calibration && l.calibration.policy === 'convert' && !isOriginalScale(l.calibration.scale))
})
const reprintPending = computed(() => lantern.value?.calibration?.policy === 'reprint')

/** 纸上读数 = 实际下料尺寸 × 实测比例（在这套图纸上应量到的长度，mm 1 位小数） */
function paperReading(mm: number): string {
  const s = scale.value
  return s === null ? '—' : actualToPaper(mm, s).toFixed(1)
}

function bendText(m: FrameMember): string {
  if (m.bendRadiusMm) return `R${m.bendRadiusMm.toFixed(1)}mm`
  if (m.bendAngleDeg) return `${m.bendAngleDeg.toFixed(1)}°`
  return '—'
}

function exportCsv() {
  const l = lantern.value
  if (!l || !full.value) return
  downloadText(`${l.name}-构件清单.csv`, membersCsv(l, full.value.frame.members))
}
</script>

<template>
  <div v-if="!lantern || !full" class="missing">找不到该灯样。<router-link to="/">返回</router-link></div>
  <div v-else class="frame-view">
    <section class="head">
      <div>
        <h2>骨架件表 · {{ lantern.name }}</h2>
        <p class="sub">
          {{ styleLabel(lantern.mouthStyle) }} / {{ styleLabel(lantern.bottomStyle) }} ·
          最大直径 {{ lantern.maxDiameterMm }}mm · 总高 {{ lantern.totalHeightMm }}mm ·
          {{ lantern.layers.length }} 层 · {{ lantern.sides }} 棱 ·
          每根篾两端各留 <b>{{ lantern.lashAllowanceMm }}mm</b> 绑扎余量，
          横篾圈接头处（圆形 1 处 / 多边形 {{ lantern.sides }} 处）同样加余量。
        </p>
      </div>
      <div class="ops">
        <button @click="exportCsv">导出构件清单 CSV</button>
        <button class="primary" @click="router.push(`/print/${lantern.id}?view=frame`)">打印构件清单</button>
      </div>
    </section>

    <section class="stats">
      <div class="stat"><span>构件总根数</span><b>{{ full.frame.totalQty }}</b></div>
      <div class="stat"><span>备料总长（含余量）</span><b>{{ (full.frame.stockLengthMm / 1000).toFixed(3) }} m</b></div>
      <div class="stat"><span>净长合计</span><b>{{ (full.frame.rawLengthMm / 1000).toFixed(3) }} m</b></div>
      <div class="stat"><span>绑扎余量合计</span><b>{{ full.frame.lashExtraMm.toFixed(1) }} mm</b></div>
      <div class="stat">
        <span>实测比例</span>
        <b :class="scale !== null ? (reprintPending ? 'bad' : 'ok') : 'none'">
          {{ scale !== null ? fmtScalePct(scale) : '未校验' }}
        </b>
      </div>
    </section>

    <p v-if="scale === null" class="calib-hint unset">
      未实测校验尺：本表为标称尺寸（mm，1 位小数）。按 100% 打印后量 100.0mm 校验尺，到
      <router-link :to="`/print/${lantern.id}`">1:1 放样图页</router-link> 回填实测长度。
    </p>
    <p v-else-if="reprintPending" class="calib-hint bad">
      已选「重打到原大才放行」：本套图纸判不可用，重打并重新校验前不要按本表下料。{{ calNote }}
    </p>
    <p v-else-if="showConvert" class="calib-hint">
      实测比例 {{ fmtScalePct(scale!) }}：下刀前把纸上量到的读数 ÷ 比例 = 实际下料尺寸；
      「纸上读数」列 = 截取长度 × {{ fmtScalePct(scale!) }}（mm，1 位小数）。每一次下刀都要按新比例重新读数。
    </p>
    <p v-else class="calib-hint ok">实测比例 100.00%，与原大一致：纸上量多少就是多少。{{ calNote }}</p>

    <section v-for="grp in groups" :key="grp.group" class="group">
      <h3>{{ grp.group }}</h3>
      <table>
        <thead>
          <tr>
            <th>构件名称</th>
            <th>类别</th>
            <th class="num">净长 (mm)</th>
            <th class="num">截取长度 (mm，含余量)</th>
            <th v-if="showConvert" class="num">纸上读数 (mm)</th>
            <th class="num">余量处数</th>
            <th class="num">数量</th>
            <th class="num">总截取长 (mm)</th>
            <th>弯曲半径 / 折角</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in grp.items" :key="m.id">
            <td class="name">{{ m.label }}</td>
            <td>{{ kindName(m.kind) }}</td>
            <td class="num mono">{{ m.rawLengthMm.toFixed(1) }}</td>
            <td class="num mono strong">{{ m.lengthMm.toFixed(1) }}</td>
            <td v-if="showConvert" class="num mono paper">{{ paperReading(m.lengthMm) }}</td>
            <td class="num mono">×{{ m.lashJoints }}</td>
            <td class="num mono">{{ m.qty }}</td>
            <td class="num mono">{{ (m.lengthMm * m.qty).toFixed(1) }}</td>
            <td class="mono small">{{ bendText(m) }}</td>
            <td class="note">{{ m.note }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <ChecksPanel
      :checks="full.checks.filter((c) => ['CHK-01', 'CHK-02', 'CHK-04', 'CHK-08', 'CHK-09'].includes(c.id))"
      :elapsed-ms="full.elapsedMs"
      title="骨架计算自检"
    />
  </div>
</template>

<style scoped>
.frame-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
}

h2 {
  margin: 0 0 6px;
  font-size: 18px;
  color: #8f1c19;
  border-left: 4px solid var(--red);
  padding-left: 10px;
}

.sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--ink-soft);
  max-width: 900px;
}

.ops {
  display: flex;
  gap: 8px;
}

button {
  font: inherit;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  padding: 6px 12px;
  font-size: 12.5px;
}

button:hover {
  border-color: var(--red);
  color: var(--red);
}

button.primary {
  background: var(--red);
  border-color: var(--red);
  color: #fff;
  font-weight: 600;
}

button.primary:hover {
  background: #9c1f1b;
  color: #fff;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.stat {
  background: var(--surface);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
}

.stat span {
  font-size: 11px;
  color: var(--ink-soft);
}

.stat b {
  font-family: var(--mono);
  font-size: 15px;
}

.group {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

.group h3 {
  margin: 0;
  padding: 8px 14px;
  font-size: 13px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line);
  color: var(--ink);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

th {
  text-align: left;
  padding: 7px 12px;
  color: var(--ink-soft);
  font-weight: 500;
  font-size: 11.5px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

td {
  padding: 7px 12px;
  border-bottom: 1px dashed var(--line);
  vertical-align: top;
}

tr:last-child td {
  border-bottom: none;
}

.num {
  text-align: right;
}

.mono {
  font-family: var(--mono);
}

.strong {
  font-weight: 700;
  color: #8f1c19;
}

.small {
  font-size: 12px;
}

.name {
  font-weight: 600;
}

.note {
  color: var(--ink-soft);
  font-size: 12px;
  max-width: 340px;
}

.ok {
  color: var(--jade);
}

.bad {
  color: var(--red);
}

.none {
  color: #8a6a1f;
}

.paper {
  color: var(--blue);
  font-weight: 600;
}

.calib-hint {
  margin: 0;
  font-size: 12.5px;
  border-radius: 8px;
  padding: 8px 12px;
  background: #eaf4ef;
  border: 1px solid #cbe3d8;
  color: var(--ink);
}

.calib-hint.unset {
  background: #fff6e3;
  border-color: #e8d5a8;
  color: #8a6a1f;
}

.calib-hint.bad {
  background: #fdecea;
  border-color: #f2c7c1;
  color: #8f1c19;
}

.calib-hint.ok {
  color: var(--ink-soft);
}

.calib-hint a {
  color: var(--red);
}

.missing {
  padding: 40px;
  text-align: center;
}
</style>
