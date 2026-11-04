/**
 * 从宿主那棵树里取 `@deepseek-ai/schemastery`。
 *
 * 不能裸 import：桌面版 profile 是 `autoInstallPeers: false`，这个包是 optional peer，
 * 永远装不上，裸 import 会让整条插件不激活（官方 life 插件踩过这个坑）。
 *
 * 取不到就返回 null —— 插件照常加载，只是没有设置页。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SELF_MODULES = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@deepseek-ai')

function candidateRoots() {
  const out = []
  const push = (p) => { if (p && !out.includes(p)) out.push(p) }
  push(process.env.DSH_HOST_MODULES)

  const appdata = process.env.APPDATA
  if (appdata) {
    const npm = join(appdata, 'npm', 'node_modules')
    push(join(npm, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
    push(join(npm, '@deepseek-ai'))
    try {
      for (const name of readdirSync(join(npm, '@deepseek-ai'))) {
        push(join(npm, '@deepseek-ai', name, 'node_modules', '@deepseek-ai'))
      }
    } catch { /* 没有就算了 */ }
  }

  // profile 树：有时这些包被别的插件 hoist 到 profile 根上
  try {
    const dshHome = process.env.DSH_DESKTOP_NEXT_HOME || process.env.DSH_HOME || join(homedir(), '.dsh')
    for (const profile of readdirSync(join(dshHome, 'profiles'))) {
      push(join(dshHome, 'profiles', profile, 'node_modules', '@deepseek-ai'))
    }
  } catch { /* 没有就算了 */ }

  push(SELF_MODULES)
  return out
}

function entryUrlFor(root, name) {
  try {
    const dir = join(root, name)
    const pkgFile = join(dir, 'package.json')
    if (!existsSync(pkgFile)) return null
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
    const dot = pkg.exports?.['.']
    const rel = typeof dot === 'string'
      ? dot
      : (dot?.import || dot?.default || pkg.module || pkg.main)
    if (!rel) return null
    const file = join(dir, String(rel).replace(/^\.\//, ''))
    return existsSync(file) ? pathToFileURL(file).href : null
  } catch { return null }
}

export async function loadSchemastery(logger) {
  for (const root of candidateRoots()) {
    if (root === SELF_MODULES) continue
    const url = entryUrlFor(root, 'schemastery')
    if (!url) continue
    try {
      const mod = await import(url)
      logger?.info?.('dafeiyu-pet: schemastery 从宿主树取到')
      return mod?.default ?? mod ?? null
    } catch { /* 换下一个 */ }
  }
  try {
    const mod = await import('@deepseek-ai/schemastery')
    logger?.info?.('dafeiyu-pet: schemastery 用自己依赖里那份')
    return mod?.default ?? mod ?? null
  } catch {
    logger?.warn?.('dafeiyu-pet: schemastery 拿不到，设置页会降级（插件本体照常跑）')
    return null
  }
}
