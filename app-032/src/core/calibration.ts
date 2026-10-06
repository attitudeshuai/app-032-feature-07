/**
 * 打印比例校验（1:1 放样图的实测比例闭环）
 *
 * 流程：按 100% 打印 → 用钢尺量校验尺 → 把实测长度填回页面 →
 *   实测比例 = 实测长度 / 标称长度（100.0mm）
 * 偏差 |实测 − 标称| ≤ 1.0mm 才允许把这次比例记到灯样上；
 * 超差则本套图纸判不可用，改法：关闭「适应页面」按 100% 重打 / 换更大幅面的纸 / 分幅打印。
 *
 * 比例的唯一来源是 lantern.calibration：1:1 放样图每页角注、三份导出单子角注、
 * 骨架构件表与蒙面裁片页的换算列、本机存档，全部由它算出（CHK-09 断言各出口同源）。
 * 改纸张或搭接量后这些出口随灯样数据一起刷新；哪一处还按老比例/老环境显示，CHK-09 会点名。
 * 旧灯样没有该字段 → 按「未测量」处理，绝不当成原大。
 *
 * 单位与精度：实测长度 mm 留 1 位小数；比例按百分数留 2 位小数；换算成 cm 只留 1 位小数。
 */
import type { Lantern, PageSize, PrintCalibration } from './types'

/** 校验尺标称长度（mm） */
export const NOMINAL_RULER_MM = 100
/** 校验尺误差容差（mm）：|实测 − 标称| ≤ 1.0mm 才算合格 */
export const TOLERANCE_MM = 1
/** 实测长度合理范围（mm）：超出视为误输入，拒绝记录 */
export const MEASURE_MIN_MM = 50
export const MEASURE_MAX_MM = 150

export interface CalibrationEval {
  measuredMm: number
  nominalMm: number
  /** 实测比例（1 = 原大） */
  scale: number
  /** 偏差（实测 − 标称，带符号，mm） */
  deviationMm: number
  /** 偏差是否 ≤ 容差 1.0mm */
  withinTolerance: boolean
}

/** 由实测长度核算实测比例与偏差 */
export function evaluateMeasured(measuredMm: number, nominalMm: number = NOMINAL_RULER_MM): CalibrationEval {
  const scale = measuredMm / nominalMm
  const deviationMm = measuredMm - nominalMm
  return {
    measuredMm,
    nominalMm,
    scale,
    deviationMm,
    withinTolerance: Math.abs(deviationMm) <= TOLERANCE_MM + 1e-9
  }
}

/** mm，1 位小数（带单位） */
export const fmtMm = (v: number): string => `${(Math.round(v * 10) / 10).toFixed(1)}mm`

/** cm，只留 1 位小数（带单位） */
export const fmtCm = (vMm: number): string => `${(Math.round(vMm) / 10).toFixed(1)}cm`

/** 比例 → 百分数字符串，2 位小数（如 98.04%） */
export const fmtScalePct = (scale: number): string => `${(scale * 100).toFixed(2)}%`

/** 带符号偏差，mm 1 位小数（如 −2.0mm） */
export const fmtDeviation = (v: number): string => `${v >= 0 ? '+' : '−'}${(Math.round(Math.abs(v) * 10) / 10).toFixed(1)}mm`

/** 纸上读数 = 实际下料尺寸 × 实测比例（在这套图纸上应量到的长度，mm 1 位小数展示） */
export const actualToPaper = (actualMm: number, scale: number): number => actualMm * scale

/** 实际下料尺寸 = 纸上读数 ÷ 实测比例 */
export const paperToActual = (paperMm: number, scale: number): number => paperMm / scale

/** 比例是否与原大一致（按百分数 2 位小数的显示精度判定） */
export const isOriginalScale = (scale: number): boolean => Math.abs(scale - 1) < 0.00005

/**
 * 当前记录在案的实测比例；未测量（或数据损坏）返回 null。
 * 调用方必须把 null 当「未校验」处理，不得按原大（1.0）显示。
 */
export function recordedScale(l: Lantern): number | null {
  const c = l.calibration
  if (!c || !(c.scale > 0) || !Number.isFinite(c.scale)) return null
  return c.scale
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 比例角注（完整版）：三份导出单子、屏显页面、构件清单打印页共用这同一段文字。
 * 所有出口由同一份 lantern.calibration 算出，改纸张/搭接量后一起刷新。
 */
export function calibrationNote(l: Lantern): string {
  const c = l.calibration
  if (!c) {
    return `比例未校验：请按 100% 打印后实测 ${NOMINAL_RULER_MM.toFixed(1)}mm 校验尺并回填（未测量不按原大处理）`
  }
  const base =
    `实测比例 ${fmtScalePct(c.scale)}（校验尺 ${c.measuredMm.toFixed(1)}/${c.nominalMm.toFixed(1)}mm` +
    ` · ${fmtDate(c.at)} · ${c.paper} · 搭接 ${c.overlapMm.toFixed(1)}mm）`
  if (c.policy === 'reprint') return `${base} · 判不可用：重打到原大并重新校验后才放行`
  if (!isOriginalScale(c.scale)) {
    return `${base} · 按实测比例换算下料：实际下料 = 纸上读数 ÷ ${fmtScalePct(c.scale)}`
  }
  return `${base} · 与原大一致`
}

/** 比例角注（紧凑版）：1:1 图纸每页页脚用，与完整版同一份比例 */
export function calibrationNoteCompact(l: Lantern): string {
  const c = l.calibration
  if (!c) return '比例未校验'
  const pol = c.policy === 'reprint' ? '待重打' : isOriginalScale(c.scale) ? '原大' : '换算下料'
  return `比例 ${fmtScalePct(c.scale)}（${c.measuredMm.toFixed(1)}/${c.nominalMm.toFixed(1)}mm·${c.paper}·${pol}）`
}

export interface ScaleOutlet {
  /** 出口名称（不一致时点名用） */
  name: string
  /** 该出口当前取到的比例（null = 显示「未校验」） */
  scale: number | null
}

/**
 * 全部比例出口清单：放样图每页角注、三份导出单子角注、构件表/裁片页换算列、本机存档。
 * 每一处都必须从 lantern.calibration 取数（CHK-09 断言同源，改纸张/搭接量后一起刷新）。
 */
export function calibrationOutlets(l: Lantern): ScaleOutlet[] {
  const s = recordedScale(l)
  return [
    { name: '1:1 放样图每页角注', scale: s },
    { name: '构件清单角注', scale: s },
    { name: '裁片清单角注', scale: s },
    { name: '备料单角注', scale: s },
    { name: '构件表/裁片页换算列', scale: s },
    { name: '本机存档记录', scale: s }
  ]
}

/** 存档环境与当前图纸环境不符之处（换纸张/改搭接量后点名「本机存档记录」这一处） */
export function staleOutlets(l: Lantern): string[] {
  const c = l.calibration
  if (!c) return []
  const out: string[] = []
  if (c.paper !== l.pageSize) {
    out.push(`本机存档记录（纸张仍记 ${c.paper}，当前 ${l.pageSize}）`)
  }
  if (Math.abs(c.overlapMm - l.overlapMm) > 1e-9) {
    out.push(`本机存档记录（搭接仍记 ${c.overlapMm.toFixed(1)}mm，当前 ${l.overlapMm.toFixed(1)}mm）`)
  }
  return out
}

/** 生成一条校验记录（仅在容差内调用；policy 缺省沿用上一记录，否则 convert）。
 *  实测长度先按 mm 留 1 位小数舍入，比例由舍入后的长度算出，保证存档自洽。 */
export function buildCalibration(
  measuredMm: number,
  paper: PageSize,
  overlapMm: number,
  policy: PrintCalibration['policy'] = 'convert'
): PrintCalibration {
  const rounded = Math.round(measuredMm * 10) / 10
  const e = evaluateMeasured(rounded)
  return {
    nominalMm: e.nominalMm,
    measuredMm: rounded,
    scale: e.scale,
    at: new Date().toISOString(),
    paper,
    overlapMm,
    policy
  }
}
