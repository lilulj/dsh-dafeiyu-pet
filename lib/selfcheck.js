/**
 * 启动自检：看看同一台机器上是不是还有另一个桌宠也在跑。
 *
 * 不能靠查 7799 端口——官方原版 helper 根本没有控制口，查不出来，
 * 但两只鱼照样会一起出现。直接读 profile 配置里 dsh-dafeiyu 有没有被禁用更准。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function dshHome() {
  return process.env.DSH_DESKTOP_NEXT_HOME || process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 在 yml 文本里找 `- id: <name>` 这一条，返回它的配置块 */
function entryBlock(text, name) {
  const parts = text.split(/^- id:\s*/m)
  for (const part of parts) {
    if (!part.startsWith(name)) continue
    // 到下一条 `- id:` 之前都算这条的
    const end = part.search(/^-\s/m)
    return end === -1 ? part : part.slice(0, end)
  }
  return null
}

export function detectConflictingPet() {
  const home = dshHome()
  const profilesDir = join(home, 'profiles')
  if (!existsSync(profilesDir)) return null

  let profiles = []
  try { profiles = readdirSync(profilesDir) } catch { return null }

  for (const profile of profiles) {
    const file = join(profilesDir, profile, 'cordis.patch.yml')
    if (!existsSync(file)) continue
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    const block = entryBlock(text, 'dsh-dafeiyu')
    if (!block) continue
    if (/^\s*disabled:\s*true\s*$/m.test(block)) continue
    return { profile, file }
  }
  return null
}

export function warnIfConflicting(logger) {
  const conflict = detectConflictingPet()
  if (!conflict) return false
  logger.warn?.(
    `dafeiyu-pet: 检测到另一个桌宠也在启用 —— profile「${conflict.profile}」里的 dsh-dafeiyu 没被禁用。`
    + '两个同时开会各起一个窗口、抢 7799 控制口。'
    + `处理办法：编辑 ${conflict.file}，在 dsh-dafeiyu 那一条里加一行 "disabled: true"，然后重启 DSH。`,
  )
  return true
}
