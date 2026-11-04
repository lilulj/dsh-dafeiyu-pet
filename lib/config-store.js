/**
 * 插件自己的配置存储：`$DSH_HOME/dafeiyu-pet/config.json`。
 *
 * 不走 DSH 的 settings 服务——那个接口在不同版本上行为不一致
 * （0.1.7 上会报 "settings service has no register()"），
 * 而这里要存的是 QQ 密钥这类必须可靠落盘的东西。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_CONFIG = {
  enabled: true,
  actionDelayMs: 4500,
  activityLevel: 'lively',
  scale: 0.6,
  bubbleScale: 0.8,
  includeSubagents: false,
  actionGuidance: true,
  voiceName: 'zh-CN-XiaoyiNeural',
  voiceRate: 1.08,
  voicePitch: '+6Hz',
  qqAppId: '',
  qqAppSecret: '',
  qqOpenId: '',
  /** 空闲时气泡底部的常驻文案（气泡框靠它撑着，不填就没有气泡） */
  idleSummary: 'DSH · 待命中',
}

const SECRET_KEYS = new Set(['qqAppSecret'])

export function stateDir() {
  const home = process.env.DSH_DESKTOP_NEXT_HOME || process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'dafeiyu-pet')
}

export function configPath() {
  return join(stateDir(), 'config.json')
}

function coerce(key, value, fallback) {
  if (typeof fallback === 'number') {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback
  return typeof value === 'string' ? value : fallback
}

export function normalise(raw) {
  const out = {}
  for (const [key, fallback] of Object.entries(DEFAULT_CONFIG)) {
    out[key] = coerce(key, raw?.[key], fallback)
  }
  return out
}

/** 没有配置文件时返回 null，好让调用方区分"没设置过"和"设置成了默认值" */
export function readConfig() {
  const file = configPath()
  if (!existsSync(file)) return null
  try {
    return normalise(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

export function writeConfig(patch) {
  const next = normalise({ ...(readConfig() || {}), ...(patch || {}) })
  const file = configPath()
  mkdirSync(stateDir(), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
  return next
}

/** 给界面看的版本：密钥只报"有没有填"，不回传明文 */
export function publicView(config) {
  const out = { ...config }
  for (const key of SECRET_KEYS) out[key] = config[key] ? '********' : ''
  out.qqAppSecretSet = Boolean(config.qqAppSecret)
  return out
}

/** 界面传回 '********' 表示"没改"，别把占位符当成新密钥存下去 */
export function stripPlaceholders(patch) {
  const out = { ...(patch || {}) }
  for (const key of SECRET_KEYS) {
    if (out[key] === '********') delete out[key]
  }
  return out
}

export function isLocalRequest(req) {
  const address = req?.socket?.remoteAddress || ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

export async function readPatch(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  return JSON.parse(text)
}
