/**
 * 设置页：插件自己起一个本地小服务，浏览器打开就能填 key。
 *
 * 不走 DSH 的 client slot —— 那个加载约定和版本绑得太紧，加载失败会把整个渲染进程带崩。
 * 这里只有 http + 一段 HTML，端口固定，和 DSH 版本无关。
 */

import { createServer } from 'node:http'
import {
  DEFAULT_CONFIG,
  readConfig,
  writeConfig,
  publicView,
  stripPlaceholders,
  isLocalRequest,
  jsonResponse,
  readPatch,
} from './config-store.js'

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>大肥鱼桌宠 · 设置</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.6 system-ui, "Microsoft YaHei", sans-serif; max-width: 720px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { opacity: .65; margin-bottom: 24px; }
  fieldset { border: 1px solid #8884; border-radius: 10px; padding: 16px 18px; margin: 0 0 18px; }
  legend { padding: 0 6px; font-weight: 600; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 7px 0; }
  .row label { font-weight: 500; }
  .row small { display: block; opacity: .6; font-weight: 400; }
  input[type=text], input[type=password], input[type=number], select {
    min-width: 240px; padding: 7px 10px; border-radius: 8px; border: 1px solid #8886; background: transparent; color: inherit;
  }
  button { padding: 9px 22px; border-radius: 8px; border: 0; background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  #status { margin-left: 12px; opacity: .8; }
  .ok { color: #16a34a; } .err { color: #dc2626; }
</style>
</head>
<body>
<h1>大肥鱼桌宠</h1>
<div class="sub">独立插件：自带动作与语音，不依赖官方桌宠插件。设置保存在 dafeiyu-pet\\config.json。</div>
<form id="f">
  <fieldset>
    <legend>QQ 语音条</legend>
    <div class="row"><label>AppID<small>QQ 开放平台的机器人 AppID</small></label><input type="text" name="qqAppId" placeholder="1906280003"></div>
    <div class="row"><label>AppSecret<small>只显示一次，保存后回显为 ****</small></label><input type="password" name="qqAppSecret" placeholder="未设置"></div>
    <div class="row"><label>OpenID<small>收语音条的用户 openid，不是 QQ 号</small></label><input type="text" name="qqOpenId"></div>
    <div class="sub" style="margin:8px 0 0">不填也能用，只是语音只在本机播放。</div>
  </fieldset>

  <fieldset>
    <legend>语音</legend>
    <div class="row"><label>音色<small>edge-tts 的音色名</small></label><input type="text" name="voiceName" placeholder="zh-CN-XiaoyiNeural"></div>
    <div class="row"><label>语速<small>1 = 原速</small></label><input type="number" name="voiceRate" step="0.01" min="0.5" max="2"></div>
    <div class="row"><label>音调<small>例如 +6Hz</small></label><input type="text" name="voicePitch" placeholder="+6Hz"></div>
  </fieldset>

  <fieldset>
    <legend>桌宠</legend>
    <div class="row"><label>启用<small>关掉后不启动窗口，重启 DSH 生效</small></label><input type="checkbox" name="enabled"></div>
    <div class="row"><label>待机活跃度</label><select name="activityLevel">
      <option value="quiet">安静</option><option value="normal">标准</option><option value="lively">活泼</option>
    </select></div>
    <div class="row"><label>角色大小<small>0.55 – 1.4</small></label><input type="number" name="scale" step="0.05" min="0.55" max="1.4"></div>
    <div class="row"><label>气泡大小<small>0.8 – 1.2</small></label><input type="number" name="bubbleScale" step="0.05" min="0.8" max="1.2"></div>
    <div class="row"><label>动作延时<small>毫秒，等说完话再动</small></label><input type="number" name="actionDelayMs" step="100" min="0" max="20000"></div>
    <div class="row"><label>自动触发动作<small>往系统提示注入规则</small></label><input type="checkbox" name="actionGuidance"></div>
  </fieldset>

  <button type="submit" id="save">保存</button><span id="status"></span>
</form>
<script>
const F = document.getElementById('f');
const S = document.getElementById('status');
const BOOLS = ['enabled', 'actionGuidance'];
const NUMS = ['voiceRate', 'scale', 'bubbleScale', 'actionDelayMs'];
let current = null;

function fill(cfg) {
  current = cfg;
  for (const el of F.elements) {
    if (!el.name) continue;
    if (BOOLS.includes(el.name)) el.checked = Boolean(cfg[el.name]);
    else el.value = cfg[el.name] ?? '';
  }
  if (cfg.qqAppSecretSet) F.elements.qqAppSecret.placeholder = '已设置（留空不修改）';
}

function collect() {
  const out = {};
  for (const el of F.elements) {
    if (!el.name) continue;
    if (BOOLS.includes(el.name)) out[el.name] = el.checked;
    else if (NUMS.includes(el.name)) out[el.name] = Number(el.value) || 0;
    else out[el.name] = el.value;
  }
  return out;
}

fetch('/config', { cache: 'no-store' })
  .then(r => r.json())
  .then(fill)
  .catch(e => { S.textContent = '读取失败：' + e.message; S.className = 'err'; });

F.addEventListener('submit', async (event) => {
  event.preventDefault();
  const btn = document.getElementById('save');
  btn.disabled = true;
  S.textContent = '保存中…'; S.className = '';
  try {
    const res = await fetch('/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    fill(data);
    S.textContent = '已保存。语音和动作下次调用生效；窗口大小需要重启 DSH。';
    S.className = 'ok';
  } catch (e) {
    S.textContent = '保存失败：' + e.message;
    S.className = 'err';
  } finally {
    btn.disabled = false;
  }
});
</script>
</body>
</html>`

export function startSettingsServer({ port = 7811, logger = console } = {}) {
  const server = createServer(async (req, res) => {
    // DSH 渲染进程里的设置卡片要跨端口读这里，给本机页面放行
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (!isLocalRequest(req)) {
      jsonResponse(res, 403, { error: 'local access only' })
      return
    }
    const url = req.url || '/'

    if (url === '/' || url.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(HTML)
      return
    }

    if (url.startsWith('/config')) {
      if (req.method === 'GET') {
        jsonResponse(res, 200, publicView({ ...DEFAULT_CONFIG, ...(readConfig() || {}) }))
        return
      }
      if (req.method !== 'PATCH') {
        jsonResponse(res, 405, { error: 'method not allowed' })
        return
      }
      try {
        const next = writeConfig(stripPlaceholders(await readPatch(req)))
        logger.info?.('dafeiyu-pet: 设置已保存到 config.json')
        jsonResponse(res, 200, publicView(next))
      } catch (error) {
        jsonResponse(res, 400, { error: error.message })
      }
      return
    }

    jsonResponse(res, 404, { error: 'not found' })
  })

  server.on('error', (error) => {
    logger.warn?.(`dafeiyu-pet: 设置页端口 ${port} 起不来（${error.message}），不影响桌宠本体`)
  })
  server.listen(port, '127.0.0.1', () => {
    logger.info?.(`dafeiyu-pet: 设置页 http://127.0.0.1:${port}/`)
  })
  server.unref?.()
  return server
}
