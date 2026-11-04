/**
 * 桌宠 helper 进程管理：spawn、JSONL stdio、ready 握手、心跳、崩溃重启。
 *
 * 裁剪自 dsh-dafeiyu 的 helper-process.js（MIT），只保留独立运行需要的那部分：
 * 去掉余额、设置作用域、日志文件、快照刷新这些可选功能。
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CompanionMessageKind as K,
  createMessage,
  encodeMessage,
} from './protocol.js'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_ROOT = resolve(HERE, '..')

const COLD_START_TIMEOUT_MS = 180_000
const RESTART_START_TIMEOUT_MS = 90_000
const HEARTBEAT_MS = 5_000
const HEARTBEAT_TIMEOUT_MS = 12_000
const RESTART_DELAY_MS = 750
const STABLE_RUNTIME_MS = 30_000
const MAX_START_FAILURES = 5

export function helperPath() {
  const override = process.env.DSH_DAFEIYU_PET_HELPER
  if (override && existsSync(override)) return override
  return join(PLUGIN_ROOT, 'runtime', 'bin', 'win32-x64', 'dsh-dafeiyu-helper.exe')
}

export class PetHelper {
  constructor({ logger = console, stateDir, onSettingsChange } = {}) {
    this.logger = logger
    this.stateDir = stateDir
    this.onSettingsChange = onSettingsChange
    this.child = undefined
    this.ready = false
    this.stopping = false
    this.startFailures = 0
    this.queue = []
    this.restartTimer = undefined
    this.startupTimer = undefined
    this.heartbeatTimer = undefined
    this.lastPongAt = 0
  }

  start() {
    if (this.child || this.stopping) return
    const exe = helperPath()
    if (!existsSync(exe)) {
      this.logger.error?.(`dafeiyu-pet: 找不到 helper：${exe}`)
      return
    }
    const env = { ...process.env }
    if (this.stateDir) {
      mkdirSync(this.stateDir, { recursive: true })
      // 和官方桌宠共用默认位置会让两只宠物抢同一个坐标文件
      env.DSH_DAFEIYU_LAYOUT_PATH ||= join(this.stateDir, 'layout.json')
      env.DSH_DAFEIYU_LOG_FILE = join(this.stateDir, 'helper.log')
      // PyInstaller onefile 每次启动会把 Qt 运行库解压到 TEMP（约 100MB），
      // 指到自己的数据目录，别在系统 %TEMP% 里留一堆 _MEI 目录。
      const tmp = join(this.stateDir, 'tmp')
      mkdirSync(tmp, { recursive: true })
      env.TEMP = tmp
      env.TMP = tmp
    }

    let child
    try {
      child = spawn(exe, [], { cwd: PLUGIN_ROOT, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    } catch (error) {
      this.logger.error?.(`dafeiyu-pet: helper 启动失败 ${error.message}`)
      this.#scheduleRestart()
      return
    }
    this.child = child
    // 管道断开不能把宿主带崩
    child.stdin.on('error', () => {})
    child.stdout.on('error', () => {})
    child.stderr.on('error', () => {})

    const timeoutMs = this.startFailures > 0 ? RESTART_START_TIMEOUT_MS : COLD_START_TIMEOUT_MS
    this.startupTimer = setTimeout(() => {
      if (this.child === child && !this.ready) {
        this.logger.warn?.(`dafeiyu-pet: helper 就绪超时 ${timeoutMs}ms`)
        child.kill()
      }
    }, timeoutMs)
    this.startupTimer.unref?.()

    createInterface({ input: child.stdout }).on('line', (line) => this.#handleReply(line))
    createInterface({ input: child.stderr }).on('line', (line) => {
      if (line.trim()) this.logger.warn?.(`dafeiyu-pet helper: ${line}`)
    })

    child.once('error', (error) => {
      if (this.child !== child) return
      this.logger.error?.(`dafeiyu-pet: helper spawn 失败 ${error.message}`)
      this.#failStart()
    })

    child.once('exit', (code, signal) => {
      if (this.child !== child) return
      const wasReady = this.ready
      const runtimeMs = this.ready ? Date.now() - this.readyAt : 0
      this.child = undefined
      this.ready = false
      this.#clearTimers()
      if (this.stopping) return
      // 没到 ready 就退出、或刚 ready 就崩，都算启动失败；稳定跑过一段再挂才重启
      if (!wasReady || runtimeMs < STABLE_RUNTIME_MS) {
        this.#failStart(`exited code=${code} signal=${signal} runtime=${runtimeMs}ms`)
        return
      }
      this.startFailures = 0
      this.logger.warn?.(`dafeiyu-pet: helper 退出（code=${code}），750ms 后重启`)
      this.#scheduleRestart()
    })
  }

  send(message) {
    const line = encodeMessage(message)
    const child = this.child
    if (!child || !this.ready) {
      this.queue.push(line)
      if (this.queue.length > 50) this.queue.shift()
      return
    }
    this.#write(line)
  }

  setState(state, extra = {}) {
    this.send(createMessage(K.STATE, { state, ...extra }))
  }

  pulse(state, ttlMs = 1800, extra = {}) {
    this.send(createMessage(K.PULSE, { state, ttlMs, ...extra }))
  }

  stop() {
    this.stopping = true
    this.#clearTimers()
    const child = this.child
    this.child = undefined
    this.ready = false
    if (!child) return
    try { this.#write(encodeMessage(createMessage(K.SHUTDOWN, { reason: 'dafeiyu-pet-stop' }))) } catch {}
    try { child.stdin.end() } catch {}
    // helper 正常收 shutdown 会自己退；超时再强杀
    setTimeout(() => { try { child.kill() } catch {} }, 2000).unref?.()
  }

  #write(line) {
    const child = this.child
    if (!child || !child.stdin.writable || child.stdin.destroyed) return
    child.stdin.write(line)
  }

  #flush() {
    if (!this.ready) return
    const pending = this.queue.splice(0)
    for (const line of pending) this.#write(line)
  }

  #handleReply(line) {
    if (!line.trim()) return
    let reply
    try { reply = JSON.parse(line) } catch { return }
    if (reply?.protocolVersion !== 1) return

    if (reply.kind === K.READY) {
      if (this.ready) return
      this.ready = true
      this.readyAt = Date.now()
      this.lastPongAt = Date.now()
      this.startFailures = 0
      this.#clearStartup()
      this.#startHeartbeat()
      this.#flush()
      this.logger.info?.('dafeiyu-pet: helper 就绪')
      return
    }
    if (reply.kind === K.PONG) { this.lastPongAt = Date.now(); return }
    if (reply.kind === K.CLOSED) {
      // 用户从右键菜单关掉了她，别自动拉起来
      this.stopping = true
      this.logger.info?.('dafeiyu-pet: 桌宠已被用户关闭')
      return
    }
    if (reply.kind === K.SETTINGS) { this.onSettingsChange?.(reply); return }
    this.logger.debug?.(`dafeiyu-pet helper: ${line}`)
  }

  #startHeartbeat() {
    this.#clearHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const child = this.child
      if (!child || !this.ready) return
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this.logger.warn?.('dafeiyu-pet: 心跳超时，重启 helper')
        child.kill()
        return
      }
      this.#write(encodeMessage(createMessage(K.PING)))
    }, HEARTBEAT_MS)
    this.heartbeatTimer.unref?.()
  }

  #failStart(reason) {
    this.#clearTimers()
    this.startFailures += 1
    if (startFailuresExceeded(this.startFailures)) {
      this.logger.error?.(`dafeiyu-pet: helper 连续 ${this.startFailures} 次启动失败，本次运行不再重试（${reason ?? ''}）`)
      return
    }
    this.logger.warn?.(`dafeiyu-pet: helper 启动失败 ${this.startFailures}/${MAX_START_FAILURES}，稍后重试`)
    this.#scheduleRestart()
  }

  #scheduleRestart() {
    if (this.restartTimer || this.stopping) return
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      this.start()
    }, RESTART_DELAY_MS)
    this.restartTimer.unref?.()
  }

  #clearStartup() { if (this.startupTimer) clearTimeout(this.startupTimer); this.startupTimer = undefined }
  #clearHeartbeat() { if (this.heartbeatTimer) clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined }
  #clearTimers() {
    this.#clearStartup()
    this.#clearHeartbeat()
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = undefined }
  }
}

function startFailuresExceeded(count) {
  return count >= MAX_START_FAILURES
}
