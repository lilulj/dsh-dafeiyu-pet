/**
 * 素材按需下载。
 *
 * npm 包只装代码（<1MB），600MB 的动作素材和 helper 放 GitHub Release。
 * 首次启动检测到缺失就下下来解压到插件目录，之后启动直接命中。
 */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, renameSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { PLUGIN_ROOT } from './helper.js'

export const ASSETS_MANIFEST = join(PLUGIN_ROOT, 'assets', 'pet-manifest.json')
export const HELPER_EXE = join(PLUGIN_ROOT, 'runtime', 'bin', 'win32-x64', 'dsh-dafeiyu-helper.exe')

export function hasAssets() {
  return existsSync(ASSETS_MANIFEST) && existsSync(HELPER_EXE)
}

let urlCache
/** 下载地址优先取环境变量，其次 package.json 的 dsh.assets.url */
export function assetsUrl() {
  if (process.env.DAFEIYU_PET_ASSETS_URL) return process.env.DAFEIYU_PET_ASSETS_URL
  if (urlCache !== undefined) return urlCache
  try {
    const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'))
    urlCache = String(pkg?.dsh?.assets?.url || '')
  } catch {
    urlCache = ''
  }
  return urlCache
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '?'
  const mb = n / 1048576
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`
}

/** 用系统自带的 tar 解压（Windows 10 1803+ / macOS / Linux 都有） */
function extract(archive, dest, logger) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archive, '-C', dest], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.once('error', (error) => reject(new Error(`调用 tar 失败：${error.message}`)))
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar 解压失败（exit ${code}）：${stderr.slice(0, 300)}`))
    })
  })
}

/**
 * 用系统自带的 curl 下载，而不是 node 的 fetch。
 *
 * 原因：Windows 上的代理写在注册表里，node 的 fetch（undici）**不读系统代理**，
 * 只认 HTTPS_PROXY 环境变量；而 curl.exe 会自动走系统代理。
 * 国内用户基本都靠代理访问 GitHub，用 fetch 会直接超时。
 */
function download(url, dest, logger) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.${process.pid}.part`
    const args = [
      '-L',                 // 跟随重定向
      '--fail',             // 4xx/5xx 直接失败，别把错误页写成文件
      '--retry', '3',
      '--retry-delay', '2',
      '--connect-timeout', '30',
      '-o', tmp,
      url,
    ]
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    // curl 的进度是回车刷新的，直接转成定期汇报文件大小更好读
    let lastSize = 0
    let lastLog = Date.now()
    const ticker = setInterval(() => {
      const now = Date.now()
      if (now - lastLog < 5000) return
      lastLog = now
      let size = 0
      try { size = statSync(tmp).size } catch { return }
      if (size === lastSize) return
      lastSize = size
      logger.info?.(`dafeiyu-pet: 已下载 ${formatBytes(size)}`)
    }, 5000)
    ticker.unref?.()

    child.once('error', (error) => {
      clearInterval(ticker)
      reject(new Error(`调用 curl 失败：${error.message}`))
    })
    child.once('exit', (code) => {
      clearInterval(ticker)
      if (code !== 0) {
        try { unlinkSync(tmp) } catch {}
        const tail = stderr.split(/\r|\n/).filter(Boolean).slice(-2).join(' ')
        reject(new Error(`下载失败（curl exit ${code}）：${tail || '无输出'}`))
        return
      }
      try {
        const size = statSync(tmp).size
        if (size < 1024 * 1024) {
          unlinkSync(tmp)
          reject(new Error(`下载文件只有 ${formatBytes(size)}，不像素材包`))
          return
        }
        renameSync(tmp, dest)
        logger.info?.(`dafeiyu-pet: 下载完成 ${formatBytes(size)}`)
        resolve(size)
      } catch (error) {
        reject(error)
      }
    })
  })
}

/**
 * 下载并解压素材包。调用方负责 catch —— 失败不该让插件崩，
 * 只是桌宠这次不出现。
 */
export async function installAssets(logger = console) {
  const url = assetsUrl()
  if (!url) {
    throw new Error('素材缺失，但没有配置下载地址（设置环境变量 DAFEIYU_PET_ASSETS_URL）')
  }
  mkdirSync(PLUGIN_ROOT, { recursive: true })

  const archive = join(PLUGIN_ROOT, `.assets-${Date.now()}.tar.gz`)
  const size = await download(url, archive, logger)
  logger.info?.(`dafeiyu-pet: 下载完成 ${formatBytes(size)}，开始解压`)
  try {
    await extract(archive, PLUGIN_ROOT, logger)
  } finally {
    try { unlinkSync(archive) } catch {}
  }

  if (!hasAssets()) throw new Error('解压完成但仍找不到 assets/pet-manifest.json 或 helper，素材包结构可能不对')
  logger.info?.('dafeiyu-pet: 素材安装完成')
  return true
}
