/**
 * 语音：msedge-tts 合成 mp3（纯 JS，免费、不需要 key），
 * 本机用 Windows MediaPlayer COM 播放，QQ 里作为语音条发出。
 *
 * 和直播那套 Python edge-tts 的区别：这里不依赖 Python、ffmpeg 或系统 PATH，
 * 换台电脑只要 npm 装了这个插件就能出声。
 */

import { mkdirSync, writeFileSync, unlinkSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

const QQ_API = 'https://api.sgroup.qq.com'
const KEEP = 10

function voiceDir() {
  const home = process.env.DSH_DESKTOP_NEXT_HOME || process.env.DSH_HOME || join(homedir(), '.dsh')
  const dir = join(home, 'dafeiyu-pet', 'voice')
  mkdirSync(dir, { recursive: true })
  return dir
}

async function synthesize(text, config) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  const tts = new MsEdgeTTS()
  const voice = config.voiceName || 'zh-CN-XiaoyiNeural'
  const format = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
  if (format === undefined) throw new Error('msedge-tts 里找不到 MP3 输出格式')
  await tts.setMetadata(voice, format)
  const { audioStream } = tts.toStream(text, {
    rate: Number(config.voiceRate ?? 1.08),
    pitch: String(config.voicePitch ?? '+6Hz'),
  })
  const chunks = []
  for await (const chunk of audioStream) chunks.push(Buffer.from(chunk))
  if (!chunks.length) throw new Error('合成结果为空')
  return Buffer.concat(chunks)
}

function playLocal(file) {
  // WMP 的 COM 在 Win11 上通常还在；用 media player 播 mp3 就不必带 ffmpeg
  const script = `
$ErrorActionPreference = 'Stop'
$w = New-Object -ComObject WMPlayer.OCX
try {
  $w.URL = '${file.replace(/'/g, "''")}'
  $w.controls.play()
  $deadline = (Get-Date).AddSeconds(60)
  Start-Sleep -Milliseconds 400
  while ($w.playState -eq 3 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 150 }
} finally {
  try { $w.controls.stop() } catch {}
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($w)
}
`
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}

async function qqToken(appId, secret) {
  const res = await fetch('https://bots.qq.com/app/getAppAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret: secret }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.access_token) throw new Error(`取 token 失败：${JSON.stringify(data).slice(0, 160)}`)
  return data.access_token
}

async function sendQQ(file, { appId, secret, openId }) {
  const token = await qqToken(appId, secret)
  const b64 = readFileSync(file).toString('base64')
  const up = await fetch(`${QQ_API}/v2/users/${openId}/files`, {
    method: 'POST',
    headers: { Authorization: `QQBot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_type: 3, file_data: b64, srv_send_msg: false }),
  })
  const ud = await up.json().catch(() => ({}))
  if (!up.ok || !ud.file_info) throw new Error(`上传失败 HTTP ${up.status}：${JSON.stringify(ud).slice(0, 160)}`)
  const res = await fetch(`${QQ_API}/v2/users/${openId}/messages`, {
    method: 'POST',
    headers: { Authorization: `QQBot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 7, media: { file_info: ud.file_info }, content: '' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`发送失败 HTTP ${res.status}：${JSON.stringify(data).slice(0, 160)}`)
  return data
}

function trimOld(dir) {
  try {
    const leftovers = readdirSync(dir).filter((f) => f.startsWith('say-')).sort()
    while (leftovers.length > KEEP) {
      try { unlinkSync(join(dir, leftovers.shift())) } catch {}
    }
  } catch {}
}

export async function speak(text, { qq = false, config = {} } = {}) {
  const dir = voiceDir()
  const file = join(dir, `say-${Date.now()}.mp3`)
  const audio = await synthesize(text, config)
  writeFileSync(file, audio)

  const problems = []
  if (!qq) {
    const ok = await playLocal(file)
    if (!ok) problems.push('本机播放失败')
  } else {
    const appId = String(config.qqAppId || '').trim()
    const secret = String(config.qqAppSecret || '').trim()
    const openId = String(config.qqOpenId || '').trim()
    if (!appId || !secret || !openId) {
      problems.push('QQ 未配置（需要在设置里填 appId / appSecret / openId）')
    } else {
      try { await sendQQ(file, { appId, secret, openId }) }
      catch (error) { problems.push(`QQ 发送失败：${error.message}`) }
    }
  }

  try { unlinkSync(file) } catch {}
  trimOld(dir)
  if (problems.length) throw new Error(problems.join('；'))
  return true
}
