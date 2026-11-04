/**
 * dsh-dafeiyu-pet —— 独立的桌宠插件。
 *
 * 自带 helper 与动作素材，不依赖 dsh-dafeiyu。装配前请先禁用官方桌宠，
 * 否则屏幕上会同时出现两只。
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { PetHelper } from './lib/helper.js'
import { CompanionReducer } from './lib/reducer.js'
import { ACTIONS, ACTION_HINT } from './lib/actions.js'
import { loadSchemastery } from './lib/hostdeps.js'
import {
  DEFAULT_CONFIG,
  readConfig,
} from './lib/config-store.js'
import { startSettingsServer } from './lib/settings-server.js'
import { hasAssets, installAssets } from './lib/assets.js'

export const name = 'dafeiyu-pet'
export const inject = ['tools', 'systemPrompt']

// schemastery 拿不到时为 null —— 插件照常加载，只是设置页降级（见 lib/hostdeps.js）
const z = await loadSchemastery(console)

export const Config = !z ? undefined : z.object({
  /** 总开关：关掉后不启动 helper，桌宠不出现 */
  enabled: z.boolean().default(true).extra('volatile', true),
  /** 动作延时（毫秒）：等回合结束的庆祝动画放完再播，否则会被它盖掉 */
  actionDelayMs: z.natural().default(4500).extra('volatile', true),
  /** 待机活跃度：quiet / normal / lively */
  activityLevel: z.string().default('lively').extra('volatile', true),
  /** 角色缩放、气泡缩放 */
  scale: z.number().default(0.6).extra('volatile', true),
  bubbleScale: z.number().default(0.8).extra('volatile', true),
  /** 是否把子代理的会话也算进来 */
  includeSubagents: z.boolean().default(false).extra('volatile', true),
  /** 往系统提示里注入「回完话让她动一下」的规则 */
  actionGuidance: z.boolean().default(true).extra('volatile', true),

  /** 语音音色（edge-tts 的 neural voice 名） */
  voiceName: z.string().default('zh-CN-XiaoyiNeural').extra('volatile', true),
  /** 语速倍率（1 = 原速）与音调偏移 */
  voiceRate: z.number().default(1.08).extra('volatile', true),
  voicePitch: z.string().default('+6Hz').extra('volatile', true),

  /** QQ 机器人：只用于把语音发成语音条，不填就只在本机出声 */
  qqAppId: z.string().default('').extra('volatile', true),
  qqAppSecret: z.string().default('').extra('volatile', true),
  /** 收语音条的用户 openid（不是 QQ 号） */
  qqOpenId: z.string().default('').extra('volatile', true),
})

const PET_CONTROL = process.env.DAFEIYU_PET_CONTROL_PORT
  ? `http://127.0.0.1:${process.env.DAFEIYU_PET_CONTROL_PORT}`
  : 'http://127.0.0.1:7799'

// 配置优先级：设置页存的文件 > cordis.patch.yml 里的 config > 内置默认。
// DSH 会把没设置的字段传成 `{}`，直接展开会把默认值整个覆盖掉（曾经因此让 helper
// 拿到 dict 做 `in {...}` 判断而抛 unhashable），所以对象/空值一律跳过。
function currentConfig(rawConfig) {
  const clean = {}
  for (const [key, value] of Object.entries(rawConfig || {})) {
    if (value === null || value === undefined || typeof value === 'object') continue
    clean[key] = value
  }
  return { ...DEFAULT_CONFIG, ...clean, ...(readConfig() || {}) }
}

function stateDirOf() {
  const home = process.env.DSH_DESKTOP_NEXT_HOME || process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'dafeiyu-pet')
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export async function apply(ctx, rawConfig = {}) {
  const config = currentConfig(rawConfig)
  const logger = ctx.logger ?? console
  if (!config.enabled) {
    logger.info?.('dafeiyu-pet: 已在配置里禁用')
    return
  }

  const reducer = new CompanionReducer({ includeSubagents: config.includeSubagents })
  const helper = new PetHelper({ logger, stateDir: stateDirOf() })
  const unsubscribers = []

  // npm 包里不含 600MB 素材，首次启动才下。下载期间桌宠不出现，
  // 工具照常注册（调用会失败，日志里说清楚原因）。
  if (hasAssets()) {
    helper.start()
  } else {
    logger.warn('dafeiyu-pet: 素材未安装，开始下载（约 600MB，只此一次）')
    installAssets(logger)
      .then(() => helper.start())
      .catch((error) => logger.error?.(`dafeiyu-pet: 素材安装失败：${error.message}`))
  }

  // 把 DSH 会话事件翻译成 helper 能懂的状态消息。任何异常都不能漏进共享事件总线，
  // 否则会把别的订阅者一起打断——表现就像"装了桌宠把别的插件弄坏了"。
  unsubscribers.push(ctx.on('session/event', (session, event) => {
    try {
      for (const message of reducer.handle(session, event)) helper.send(message)
    } catch (error) {
      logger.error?.(`dafeiyu-pet: 处理会话事件失败 ${error.message}`)
    }
  }, { global: true }))
  unsubscribers.push(ctx.on('session/disposed', (session) => {
    try {
      for (const message of reducer.disposeSession(session)) helper.send(message)
    } catch (error) {
      logger.error?.(`dafeiyu-pet: 清理会话失败 ${error.message}`)
    }
  }, { global: true }))

  // 窗口大小、气泡、活动度这些走 config 消息，改完不用重启。
  // helper 那边直接 `activity_level in {...}` 判等，传进去非字符串（比如 DSH 传了对象）
  // 会抛 TypeError: unhashable type: 'dict'，所以发之前先规范化。
  const ACTIVITY_LEVELS = ['quiet', 'normal', 'lively']
  const BUBBLE_MODES = ['always', 'hidden', 'custom']
  const activityLevel = ACTIVITY_LEVELS.includes(config.activityLevel) ? config.activityLevel : 'lively'
  const bubbleMode = BUBBLE_MODES.includes(config.bubbleMode) ? config.bubbleMode : 'always'
  const scale = clampNumber(config.scale, 0.55, 1.4, 0.6)
  const bubbleScale = clampNumber(config.bubbleScale, 0.8, 1.2, 0.8)
  logger.info?.('dafeiyu-pet: config ' + JSON.stringify({
    activityLevel: config.activityLevel,
    bubbleMode: config.bubbleMode,
    scale: config.scale,
    bubbleScale: config.bubbleScale,
  }))

  helper.send({
    protocolVersion: 1,
    kind: 'config',
    timestamp: Date.now(),
    scale,
    bubbleScale,
    activityLevel,
    reducedMotion: false,
    soundEnabled: true,
    soundStates: ['ERROR'],
    bubbleMode,
    bubbleStates: ['SUCCESS', 'ERROR', 'WAITING'],
    openUrl: '',
    openLabel: '打开 DSH',
  })

  const tools = ctx.get('tools')
  if (!tools?.register) {
    logger.warn('dafeiyu-pet: tools 服务不可用，动作/语音工具未注册')
  } else {
    registerTools({ tools, logger, config, helper })
  }

  if (config.actionGuidance) registerActionGuidance(ctx, logger)
  const settingsServer = startSettingsServer({
    port: Number(process.env.DAFEIYU_PET_SETTINGS_PORT || 7811),
    logger,
  })

  ctx.effect?.(() => () => {
    for (const off of unsubscribers) {
      try { off?.() } catch {}
    }
    try { settingsServer?.close?.() } catch {}
    helper.stop()
  })

  logger.info?.(`dafeiyu-pet: 已启动（${ACTIONS.length} 个可播动作，控制口 ${PET_CONTROL}，设置页 http://127.0.0.1:${Number(process.env.DAFEIYU_PET_SETTINGS_PORT || 7811)}/）`)
}

function registerTools({ tools, logger, config, helper }) {
  // 模型偶尔一轮里连调好几个；延时播放的设计是「回合结束后播一个」，
  // 后一次调用直接顶掉前一次，免得前面几次白跑还刷日志。
  let pendingPlayTimer = null

  tools.register({
    name: 'dafeiyu_play_action',
    description: '让桌面上的大肥鱼做一个动作。回完话之后调用一次，让她的动作和你说的话对上。'
      + '挑语义最接近的那个；实在没有合适的就选 tail 或 ext_happy。\n' + ACTION_HINT,
    parameters: {
      type: 'object',
      properties: {
        clip: { type: 'string', enum: ACTIONS, description: '动作 id' },
      },
      required: ['clip'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, clip: { type: 'string' } },
        required: ['ok', 'clip'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: `桌宠动作：${value.clip}` }],
    },
    async execute(args) {
      const clip = String(args.clip || '').trim()
      if (!ACTIONS.includes(clip)) {
        logger.warn(`dafeiyu_play_action: 未知动作 ${clip}`)
        throw new Error(`未知动作：${clip}`)
      }
      const delay = Number(config.actionDelayMs ?? 4500)
      if (pendingPlayTimer) clearTimeout(pendingPlayTimer)
      pendingPlayTimer = setTimeout(async () => {
        pendingPlayTimer = null
        try {
          const res = await fetch(`${PET_CONTROL}/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clip }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.ok === false) logger.warn(`dafeiyu_play_action: ${clip} 播放失败 HTTP ${res.status}`)
          else logger.info(`dafeiyu_play_action: ${clip} 已播放`)
        } catch (error) {
          logger.warn(`dafeiyu_play_action: ${clip} 播放异常 ${error.message}`)
        }
      }, delay)
      pendingPlayTimer.unref?.()
      return { ok: true, clip }
    },
  })

  tools.register({
    name: 'dafeiyu_speak',
    description: '用大肥鱼的声音念一句话：桌面端直接在电脑上念，QQ 会话里发成一条语音条。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要念出来的话，一到两句，不要带括号旁白。' },
        channel: {
          type: 'string',
          enum: ['qq', 'local'],
          description: 'qq=发成 QQ 语音条（不在本机外放）；local=在电脑上念出来。QQ 里聊天时必须填 qq。',
        },
      },
      required: ['text', 'channel'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, mode: { type: 'string' } },
        required: ['ok', 'mode'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.mode === 'qq' ? '语音条已发送' : '已在电脑上念出' }],
    },
    async execute(args) {
      const text = String(args.text || '').trim()
      if (!text) throw new Error('要念的内容不能为空')
      const qq = String(args.channel || '').trim() === 'qq'
      const voice = await loadVoice(logger)
      if (!voice) throw new Error('语音模块不可用，检查插件目录 lib/voice.js 是否完整')
      // 用设置页里的最新值，改完 key 不用重启
      await voice.speak(text, { qq, config: currentConfig() })
      return { ok: true, mode: qq ? 'qq' : 'local' }
    },
  })
}

function registerActionGuidance(ctx, logger) {
  try {
    const systemPrompt = ctx.get('systemPrompt')
    if (!systemPrompt?.section) {
      logger.warn('dafeiyu-pet: systemPrompt 服务不可用，桌面端不会自动触发动作（QQ 的 directPrompt 不受影响）')
      return
    }
    const register = () => systemPrompt.section({
      name: 'dafeiyu:action-guidance',
      order: 150,
      text: [
        '桌面上的大肥鱼（蓝色鲸鱼娘）会跟着你说话做动作。',
        '每次回复主人时调用一次 dafeiyu_play_action，clip 从枚举里挑和内容最贴的：'
          + '聊吃的选对应菜名、被夸选 ext_shy/ext_happy、加班说 ext_work_tap/ext_coding、'
          + '过节选节日类、要她撒娇选 ext_angry/ext_shy，实在没贴切的用 tail。',
        '想让她出声就调 dafeiyu_speak，桌面端 channel 填 local，QQ 会话填 qq。',
        '纯技术执行、完全没有情绪的时候可以跳过。不要在回复里提工具名。',
      ].join('\n'),
    })
    if (typeof ctx.effect === 'function') ctx.effect(register)
    else register()
    logger.info('dafeiyu-pet: 动作提示已注入 systemPrompt（order 150）')
  } catch (error) {
    logger.warn(`dafeiyu-pet: systemPrompt 注入失败 ${error.message}`)
  }
}

let voiceModule
async function loadVoice(logger) {
  if (voiceModule !== undefined) return voiceModule
  try {
    voiceModule = await import('./lib/voice.js')
  } catch (error) {
    logger.warn(`dafeiyu-pet: 语音模块加载失败 ${error.message}`)
    voiceModule = null
  }
  return voiceModule
}
