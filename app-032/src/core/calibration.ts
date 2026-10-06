/**
 * 打印比例校验（1:1 放样图）
 *
 * 流程：打印 → 实测 100mm 校验尺 → 把量到的长度填回图纸页 →
 * 页面按标称长度算出这次实际的比例，并判定偏差有没有超过容差（±1mm）。
 *
 * - 未超差：把这次的比例记在这盏灯上（本机存档），各页角注、三份导出单子、
 *   构件表 / 裁片页的下料换算同用这一份比例；
 * - 超差：这套图纸标为不可用，给一条改法（关掉「适应页面」/ 换幅面更大的纸 / 分幅打印），
 *   并二选一处置、认下代价：
 *   · rescale 按实测比例换算下料 —— 图纸照旧能用，代价是每一次下刀都要按新比例重新读数；
 *   · reprint 要求重打到原大才放行 —— 图纸与随附单子要重出，已发到作坊的一套作废。
 *
 * 旧灯样没有校验记录时一律按「未校验」处理，不许当成原大。
 * 精度：量出来的长度 mm 留 1 位小数；比例按百分数留 2 位小数；换算成厘米只留 1 位小数。
 */
import type { IssuedDoc, IssuedDocKind, Lantern, PrintCalibration } from './types'

/** 校验尺 / 校验圆标称尺寸（mm）与容差（mm） */
export const CALIBRATION_RULER_MM = 100
export const CALIBRATION_CIRCLE_MM = 100
export const CALIBRATION_TOLERANCE_MM = 1

export type CalibrationStatus = 'unmeasured' | 'ok' | 'rejected' | 'rescale' | 'reprint'

/** 读取校验记录；旧灯样无此字段（或数据残缺）一律视为未校验，不按原大处理 */
export function calibrationOf(l: Lantern): PrintCalibration | null {
  const c = l.printCalibration
  if (!c) return null
  if (typeof c.measuredMm !== 'number' || typeof c.scale !== 'number') return null
  if (!isFinite(c.scale) || c.scale <= 0) return null
  return c
}

export function statusOf(l: Lantern): CalibrationStatus {
  const c = calibrationOf(l)
  if (!c) return 'unmeasured'
  if (c.withinTolerance) return 'ok'
  if (c.resolution === 'rescale') return 'rescale'
  if (c.resolution === 'reprint') return 'reprint'
  return 'rejected'
}

/**
 * 记录一次校验：按标称长度算出实测比例并判定容差，结果记在这盏灯上。
 * 超差时清空旧取舍，等待重新二选一；纸张 / 搭接量快照随记录保存。
 */
export function recordCalibration(l: Lantern, measuredMm: number): PrintCalibration {
  const measured = Math.round(measuredMm * 10) / 10
  const rec: PrintCalibration = {
    measuredMm: measured,
    nominalMm: CALIBRATION_RULER_MM,
    scale: measured / CALIBRATION_RULER_MM,
    withinTolerance: Math.abs(measured - CALIBRATION_RULER_MM) <= CALIBRATION_TOLERANCE_MM,
    resolution: null,
    pageSize: l.pageSize,
    overlapMm: l.overlapMm,
    at: new Date().toISOString()
  }
  l.printCalibration = rec
  return rec
}

/** 超差后选定处置（二选一，选定即认下代价） */
export function setResolution(l: Lantern, r: 'rescale' | 'reprint') {
  const c = calibrationOf(l)
  if (!c || c.withinTolerance) return
  c.resolution = r
}

export function clearCalibration(l: Lantern) {
  l.printCalibration = null
}

/**
 * 参与角注与下料换算的实测比例。
 * 未校验 / 超差待处置 / 作废待重打时为 null —— 这些状态一律不许按原大换算。
 */
export function activeScale(l: Lantern): number | null {
  const st = statusOf(l)
  if (st === 'ok' || st === 'rescale') return calibrationOf(l)!.scale
  return null
}

/** 纸上读数（mm，1 位小数展示）：这套图纸上实际量到的长度 = 标称 × 实测比例 */
export function toPaperReading(l: Lantern, nominalMm: number): number {
  const s = activeScale(l)
  return s ? nominalMm * s : nominalMm
}

/** 实际下料（mm）= 纸上读数 ÷ 实测比例；未校验时原样返回（界面须同时提示未校验） */
export function toActualCut(l: Lantern, paperMm: number): number {
  const s = activeScale(l)
  return s ? paperMm / s : paperMm
}

// ---------- 精度格式化（全站统一） ----------

/** mm，留 1 位小数 */
export const fmtMm = (v: number): string => (Math.round(v * 10) / 10).toFixed(1)
/** 百分数，留 2 位小数，如 96.50% */
export const fmtPct = (scale: number): string => `${(scale * 100).toFixed(2)}%`
/** mm → cm，只留 1 位小数 */
export const fmtCm = (mm: number): string => (mm / 10).toFixed(1)

// ---------- 角注（图纸每一页 / 三份导出单子 / 各页面同用这一份文案） ----------

/** 完整角注：用于导出单子、构件清单文档、裁片标签页与各页面提示 */
export function cornerNote(l: Lantern): string {
  const c = calibrationOf(l)
  switch (statusOf(l)) {
    case 'unmeasured':
      return '打印比例：未校验（本灯样还没有实测记录，不得按原大下料；打印后请实测 100mm 校验尺并回填）'
    case 'ok':
      return `打印比例 ${fmtPct(c!.scale)}（实测 ${fmtMm(c!.measuredMm)}mm / 标称 ${fmtMm(c!.nominalMm)}mm，偏差 ${fmtMm(
        Math.abs(c!.measuredMm - c!.nominalMm)
      )}mm ≤ ${fmtMm(CALIBRATION_TOLERANCE_MM)}mm，已校验并记在本灯样上）`
    case 'rejected':
      return `打印比例 ${fmtPct(c!.scale)}（实测 ${fmtMm(c!.measuredMm)}mm / 标称 ${fmtMm(c!.nominalMm)}mm，偏差 ${fmtMm(
        Math.abs(c!.measuredMm - c!.nominalMm)
      )}mm 超容差 ${fmtMm(CALIBRATION_TOLERANCE_MM)}mm）：本套图纸不可用，待处置`
    case 'rescale':
      return `打印比例 ${fmtPct(c!.scale)}：按实测比例换算下料，实际下料 = 纸上读数 ÷ ${c!.scale.toFixed(4)}；每一次下刀都要按此比例重新读数`
    case 'reprint':
      return '本套图纸作废：须重打到原大（100%）并重新校验后才可下料；已发出的图纸与单子一并作废'
  }
}

/** 短角注：1:1 放样图每一页的页脚 */
export function scaleTag(l: Lantern): string {
  const c = calibrationOf(l)
  switch (statusOf(l)) {
    case 'unmeasured':
      return '打印比例：未校验'
    case 'ok':
      return `打印比例 ${fmtPct(c!.scale)}（已校验）`
    case 'rejected':
      return `打印比例 ${fmtPct(c!.scale)}（超差·本套不可用）`
    case 'rescale':
      return `打印比例 ${fmtPct(c!.scale)}（按实测换算下料）`
    case 'reprint':
      return '本套作废·待重打原大'
  }
}

/** 列表短标签（我的灯样 / 本机存档一览） */
export function statusTag(l: Lantern): string {
  const c = calibrationOf(l)
  switch (statusOf(l)) {
    case 'unmeasured':
      return '未校验'
    case 'ok':
      return fmtPct(c!.scale)
    case 'rejected':
      return `${fmtPct(c!.scale)} 超差`
    case 'rescale':
      return `${fmtPct(c!.scale)} 换算下料`
    case 'reprint':
      return '作废待重打'
  }
}

// ---------- 已出具单据登记与老比例点名 ----------

/** 当前比例签名：状态 + 比例值；任何一处出具时都盖这个戳，对不上即按老比例出具 */
export function scaleSignature(l: Lantern): string {
  const st = statusOf(l)
  if (st === 'ok' || st === 'rescale') return `${st}:${calibrationOf(l)!.scale.toFixed(6)}`
  return st
}

/** 出具（导出 / 打印）一份图纸或单子时登记，同种类覆盖旧记录 */
export function markIssued(l: Lantern, kind: IssuedDocKind) {
  const docs = (l.issuedDocs ||= [])
  const rec: IssuedDoc = {
    kind,
    signature: scaleSignature(l),
    scale: activeScale(l),
    at: new Date().toISOString()
  }
  const i = docs.findIndex((d) => d.kind === kind)
  if (i >= 0) docs.splice(i, 1, rec)
  else docs.push(rec)
}

/** 仍按老比例出具的单子（改比例、改取舍后这些都要作废重来） */
export function staleDocs(l: Lantern): IssuedDoc[] {
  const sig = scaleSignature(l)
  return (l.issuedDocs || []).filter((d) => d.signature !== sig)
}

export function docKindName(k: IssuedDocKind): string {
  const map: Record<IssuedDocKind, string> = {
    loft: '1:1 放样图纸',
    members: '构件清单',
    panels: '裁片清单',
    materials: '备料单'
  }
  return map[k]
}
