<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PanelDiagram from '../components/PanelDiagram.vue'
import ChecksPanel from '../components/ChecksPanel.vue'
import { getLantern } from '../core/store'
import { computeAll } from '../core/checks'
import { DEFAULT_LOFT_OPTIONS } from '../core/paginate'
import { bodySurfaceArea } from '../core/geometry'
import { downloadText, panelsCsv, shapeName } from '../core/exporter'
import { coveringSpec } from '../core/craft'
import { actualToPaper, calibrationNote, fmtScalePct, isOriginalScale, recordedScale } from '../core/calibration'
import type { Panel } from '../core/types'

const route = useRoute()
const router = useRouter()
const lantern = computed(() => getLantern(route.params.id as string))
const full = computed(() => {
  const l = lantern.value
  if (!l) return null
  return computeAll(l, { ...DEFAULT_LOFT_OPTIONS, paper: l.pageSize, overlapMm: l.overlapMm })
})

/** 记录在案的实测比例（null = 未校验，不按原大处理） */
const scale = computed(() => (lantern.value ? recordedScale(lantern.value) : null))
const calNote = computed(() => (lantern.value ? calibrationNote(lantern.value) : ''))
/** 按实测比例换算下料（convert 且比例 ≠ 100%）时显示「纸上读数」行 */
const showConvert = computed(() => {
  const l = lantern.value
  return !!(l?.calibration && l.calibration.policy === 'convert' && !isOriginalScale(l.calibration.scale))
})
const reprintPending = computed(() => lantern.value?.calibration?.policy === 'reprint')

/** 纸上读数 = 裁切尺寸 × 实测比例（mm 1 位小数） */
function paperReading(p: Panel): string {
  const s = scale.value
  if (s === null) return '—'
  return `上 ${actualToPaper(p.widthTopMm, s).toFixed(1)} / 下 ${actualToPaper(p.widthBottomMm, s).toFixed(1)} × 高 ${actualToPaper(p.heightMm, s).toFixed(1)}`
}

const ratio = computed(() => {
  const l = lantern.value
  if (!l || !full.value) return 1
  const ref = bodySurfaceArea(full.value.frame.geometry, Math.max(3, Math.round(l.divisions)))
  return ref > 0 ? full.value.panels.netAreaMm2 / ref : 1
})

const palette = computed(() => {
  const l = lantern.value
  if (!l) return []
  return l.layers.map((ly, i) => ({
    i: i + 1,
    color: l.layerColors[i] || l.color,
    height: ly.heightMm,
    diameter: ly.diameterMm,
    panels: full.value?.panels.panels.filter((p) => p.layerIndex === i).length || 0
  }))
})

function exportCsv() {
  const l = lantern.value
  if (!l || !full.value) return
  downloadText(`${l.name}-蒙面裁片清单.csv`, panelsCsv(l, full.value.panels.panels))
}
</script>

<template>
  <div v-if="!lantern || !full" class="missing">找不到该灯样。<router-link to="/">返回</router-link></div>
  <div v-else class="panels-view">
    <section class="head">
      <div>
        <h2>蒙面裁片与缝份 · {{ lantern.name }}</h2>
        <p class="sub">
          蒙面 {{ coveringSpec(lantern.covering).name }} ·
          <b>缝份四边各 {{ lantern.seamAllowanceMm }}mm（已加进裁片尺寸）</b> ·
          实线 = 裁切线，绿色虚线 = 净样（折到背面的缝份线），蓝色十字 = 对位标记
          <template v-if="lantern.kind === 'revolution'">
            · 旋转体按 <b>{{ lantern.divisions }} 等分</b>近似展开，等分数可调
          </template>
        </p>
      </div>
      <div class="ops">
        <button @click="exportCsv">导出裁片清单 CSV</button>
        <button class="primary" @click="router.push(`/print/${lantern.id}?view=labels`)">打印裁片标签</button>
      </div>
    </section>

    <section class="stats">
      <div class="stat"><span>裁片总块数</span><b>{{ full.panels.totalQty }}</b></div>
      <div class="stat"><span>裁片净面积</span><b>{{ (full.panels.netAreaMm2 / 1e6).toFixed(3) }} m²</b></div>
      <div class="stat"><span>含缝份裁片面积</span><b>{{ (full.panels.cutAreaMm2 / 1e6).toFixed(3) }} m²</b></div>
      <div class="stat"><span>灯体表面积</span><b>{{ full.materials.surfaceM2.toFixed(3) }} m²</b></div>
      <div class="stat"><span>净面积 / 表面积</span><b>{{ (ratio * 100).toFixed(2) }}%</b></div>
      <div class="stat">
        <span>实测比例</span>
        <b :class="scale !== null ? (reprintPending ? 'bad' : 'ok') : 'none'">
          {{ scale !== null ? fmtScalePct(scale) : '未校验' }}
        </b>
      </div>
    </section>

    <p v-if="scale === null" class="calib-hint unset">
      未实测校验尺：本页为标称尺寸（mm，1 位小数）。按 100% 打印后量 100.0mm 校验尺，到
      <router-link :to="`/print/${lantern.id}`">1:1 放样图页</router-link> 回填实测长度。
    </p>
    <p v-else-if="reprintPending" class="calib-hint bad">
      已选「重打到原大才放行」：本套图纸判不可用，重打并重新校验前不要按本页尺寸裁片。{{ calNote }}
    </p>
    <p v-else-if="showConvert" class="calib-hint">
      实测比例 {{ fmtScalePct(scale!) }}：实际下料 = 纸上读数 ÷ 比例；「纸上读数」= 裁切尺寸 ×
      {{ fmtScalePct(scale!) }}（mm，1 位小数）。每一次下刀都要按新比例重新读数，看错一次就裁错一块。
    </p>
    <p v-else class="calib-hint ok">实测比例 100.00%，与原大一致：纸上量多少就是多少。{{ calNote }}</p>

    <div class="cards">
      <article v-for="p in full.panels.panels" :key="p.id" class="card">
        <header>
          <h3>
            <span class="dot" :style="{ background: p.color }" />
            {{ p.label }}
          </h3>
          <span class="qty">× {{ p.qty }} 块</span>
        </header>
        <div class="diagram">
          <PanelDiagram :panel="p" />
        </div>
        <table class="dims">
          <tbody>
            <tr>
              <td>展开净尺寸</td>
              <td class="mono">上 {{ p.rawWidthTopMm.toFixed(1) }} / 下 {{ p.rawWidthBottomMm.toFixed(1) }} × 高 {{ p.rawHeightMm.toFixed(1) }}</td>
            </tr>
            <tr class="cut">
              <td>裁切尺寸</td>
              <td class="mono">上 {{ p.widthTopMm.toFixed(1) }} / 下 {{ p.widthBottomMm.toFixed(1) }} × 高 {{ p.heightMm.toFixed(1) }}</td>
            </tr>
            <tr v-if="showConvert" class="paper">
              <td>纸上读数</td>
              <td class="mono">{{ paperReading(p) }}</td>
            </tr>
            <tr>
              <td>形状 / 缝份</td>
              <td class="mono">{{ shapeName(p.shape) }} · +{{ p.seamAllowanceMm }}×2</td>
            </tr>
            <tr v-if="p.radiusMm">
              <td>净半径</td>
              <td class="mono">{{ p.radiusMm.toFixed(1) }}mm</td>
            </tr>
          </tbody>
        </table>
        <p class="note">{{ p.note }}</p>
        <details>
          <summary>对位标记（{{ p.marksMm.length }} 处）</summary>
          <ol>
            <li v-for="(m, i) in p.marksMm" :key="i">
              <b>{{ i + 1 }}</b> {{ m.label }}：x={{ m.x.toFixed(1) }} y={{ m.y.toFixed(1) }} mm
            </li>
          </ol>
        </details>
      </article>
    </div>

    <section class="palette">
      <h3>灯身分段配色清单（不做 3D 渲染）</h3>
      <table>
        <thead>
          <tr>
            <th>层</th>
            <th>颜色</th>
            <th class="num">分段高 (mm)</th>
            <th class="num">该层直径 (mm)</th>
            <th class="num">该层裁片种类</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in palette" :key="p.i">
            <td class="mono">第 {{ p.i }} 层</td>
            <td>
              <span class="dot" :style="{ background: p.color }" />
              <span class="mono">{{ p.color }}</span>
            </td>
            <td class="num mono">{{ p.height.toFixed(1) }}</td>
            <td class="num mono">{{ p.diameter.toFixed(1) }}</td>
            <td class="num mono">{{ p.panels }} 种</td>
          </tr>
        </tbody>
      </table>
    </section>

    <ChecksPanel
      :checks="full.checks.filter((c) => ['CHK-03', 'CHK-05', 'CHK-06', 'CHK-09'].includes(c.id))"
      :elapsed-ms="full.elapsedMs"
      title="裁片与分页自检"
    />
  </div>
</template>

<style scoped>
.panels-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
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
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
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

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 14px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--shadow);
}

.card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.card h3 {
  margin: 0;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid var(--line-strong);
}

.qty {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--red);
  background: #fbeae6;
  border-radius: 999px;
  padding: 2px 9px;
}

.diagram {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 6px;
}

.dims {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.dims td {
  padding: 3px 6px;
  border-bottom: 1px dashed var(--line);
}

.dims td:first-child {
  color: var(--ink-soft);
  width: 96px;
}

.dims tr.cut td {
  color: #8f1c19;
  font-weight: 600;
}

.dims tr.paper td {
  color: var(--blue);
  font-weight: 600;
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

.mono {
  font-family: var(--mono);
}

.note {
  margin: 0;
  font-size: 12px;
  color: var(--ink-soft);
}

details {
  font-size: 12px;
  color: var(--ink-soft);
}

summary {
  cursor: pointer;
}

ol {
  margin: 6px 0 0;
  padding-left: 18px;
}

.palette {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 16px;
  box-shadow: var(--shadow);
}

.palette h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.palette table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.palette th {
  text-align: left;
  color: var(--ink-soft);
  font-weight: 500;
  font-size: 11.5px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
}

.palette td {
  padding: 6px 10px;
  border-bottom: 1px dashed var(--line);
}

.num {
  text-align: right;
}

.missing {
  padding: 40px;
  text-align: center;
}
</style>
