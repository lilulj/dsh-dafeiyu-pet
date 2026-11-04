window.__ModuleLoader__.load({
  id: 'dsh-dafeiyu-pet',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { useEffect, useState } = React

    // 设置读写走插件自己的本地服务（7811），不碰 DSH 的 webServer——
    // 那条路在 0.1.7 上注册不上，白折腾。
    const ENDPOINT = 'http://127.0.0.1:7811/config'

    const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '8px 0' }
    const inputStyle = { minWidth: 260, padding: '7px 10px', borderRadius: 8, border: '1px solid #8886', background: 'transparent', color: 'inherit' }
    const hintStyle = { display: 'block', opacity: 0.6, fontWeight: 400, marginTop: 2 }
    const groupStyle = { display: 'grid', gap: 2, padding: '6px 0 14px' }
    const titleStyle = { fontWeight: 700, margin: '14px 0 4px' }

    function Row({ label, hint, children }) {
      return React.createElement('div', { style: rowStyle },
        React.createElement('div', null,
          React.createElement('span', null, label),
          hint ? React.createElement('small', { style: hintStyle }, hint) : null,
        ),
        children,
      )
    }

    function TextRow({ label, hint, type = 'text', value, placeholder, onChange }) {
      return React.createElement(Row, { label, hint },
        React.createElement('input', {
          type, value: value ?? '', placeholder, style: inputStyle,
          onChange: (event) => onChange(event.target.value),
        }),
      )
    }

    function NumberRow({ label, hint, value, step, min, max, onChange }) {
      return React.createElement(Row, { label, hint },
        React.createElement('input', {
          type: 'number', value: value ?? 0, step, min, max, style: inputStyle,
          onChange: (event) => onChange(Number(event.target.value)),
        }),
      )
    }

    function ToggleRow({ label, hint, value, onChange }) {
      return React.createElement(Row, { label, hint },
        React.createElement('input', {
          type: 'checkbox', checked: Boolean(value),
          onChange: (event) => onChange(event.target.checked),
        }),
      )
    }

    function SelectRow({ label, hint, value, options, onChange }) {
      return React.createElement(Row, { label, hint },
        React.createElement('select', {
          value, style: inputStyle,
          onChange: (event) => onChange(event.target.value),
        }, ...options.map(([v, text]) => React.createElement('option', { key: v, value: v }, text))),
      )
    }

    function PetSettingsSection() {
      const [config, setConfig] = useState(null)
      const [status, setStatus] = useState('')
      const [statusKind, setStatusKind] = useState('')
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        let alive = true
        fetch(ENDPOINT, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
          .then((next) => { if (alive) setConfig(next) })
          .catch((error) => {
            if (!alive) return
            setStatus('读取配置失败：' + error.message)
            setStatusKind('err')
          })
        return () => { alive = false }
      }, [])

      const set = (key) => (value) => setConfig((previous) => ({ ...previous, [key]: value }))

      const save = async () => {
        setBusy(true)
        setStatus('保存中…')
        setStatusKind('')
        try {
          const response = await fetch(ENDPOINT, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.error || ('HTTP ' + response.status))
          setConfig(data)
          setStatus('已保存。语音和动作下次调用生效；窗口大小需要重启 DSH。')
          setStatusKind('ok')
        } catch (error) {
          setStatus('保存失败：' + error.message)
          setStatusKind('err')
        } finally {
          setBusy(false)
        }
      }

      if (!config) {
        return React.createElement('div', { style: { padding: 16 } },
          React.createElement('p', null, '大肥鱼桌宠 · 独立插件（自带动作与语音）'),
          React.createElement('p', { style: { opacity: 0.7 } }, status || '读取配置…'),
          React.createElement('p', { style: { opacity: 0.55, fontSize: 12 } },
            '如果一直读不到，确认桌宠正在运行，或直接在浏览器打开 http://127.0.0.1:7811/'),
        )
      }

      return React.createElement('div', { style: { padding: '8px 4px' } },
        React.createElement('h3', { style: { margin: '0 0 4px' } }, '大肥鱼桌宠'),
        React.createElement('p', { style: { opacity: 0.65, margin: 0 } }, '独立插件：自带 104 个动作与语音，不依赖官方桌宠插件。'),

        React.createElement('div', { style: titleStyle }, 'QQ 语音条'),
        React.createElement('div', { style: groupStyle },
          React.createElement(TextRow, {
            label: 'AppID', hint: 'QQ 开放平台的机器人 AppID',
            value: config.qqAppId, placeholder: '1906280003', onChange: set('qqAppId'),
          }),
          React.createElement(TextRow, {
            label: 'AppSecret',
            hint: config.qqAppSecretSet ? '已设置，留空不修改' : '只显示一次，填完点保存',
            type: 'password', value: config.qqAppSecret, placeholder: config.qqAppSecretSet ? '已设置' : '未设置',
            onChange: set('qqAppSecret'),
          }),
          React.createElement(TextRow, {
            label: 'OpenID', hint: '收语音条的用户 openid，不是 QQ 号',
            value: config.qqOpenId, onChange: set('qqOpenId'),
          }),
          React.createElement('small', { style: { opacity: 0.55, marginTop: 4 } }, '不填也能用，只是语音只在本机播放。'),
        ),

        React.createElement('div', { style: titleStyle }, '语音'),
        React.createElement('div', { style: groupStyle },
          React.createElement(TextRow, {
            label: '音色', hint: 'edge-tts 的音色名',
            value: config.voiceName, placeholder: 'zh-CN-XiaoyiNeural', onChange: set('voiceName'),
          }),
          React.createElement(NumberRow, {
            label: '语速', hint: '1 = 原速',
            value: config.voiceRate, step: 0.01, min: 0.5, max: 2, onChange: set('voiceRate'),
          }),
          React.createElement(TextRow, {
            label: '音调', hint: '例如 +6Hz',
            value: config.voicePitch, placeholder: '+6Hz', onChange: set('voicePitch'),
          }),
        ),

        React.createElement('div', { style: titleStyle }, '桌宠'),
        React.createElement('div', { style: groupStyle },
          React.createElement(ToggleRow, {
            label: '启用桌宠', hint: '关掉后不启动窗口，改动需要重启 DSH',
            value: config.enabled, onChange: set('enabled'),
          }),
          React.createElement(SelectRow, {
            label: '待机活跃度', hint: '空闲时多久自己动一下',
            value: config.activityLevel, onChange: set('activityLevel'),
            options: [['quiet', '安静'], ['normal', '标准'], ['lively', '活泼']],
          }),
          React.createElement(NumberRow, {
            label: '角色大小', hint: '0.55 – 1.4',
            value: config.scale, step: 0.05, min: 0.55, max: 1.4, onChange: set('scale'),
          }),
          React.createElement(NumberRow, {
            label: '气泡大小', hint: '0.8 – 1.2',
            value: config.bubbleScale, step: 0.05, min: 0.8, max: 1.2, onChange: set('bubbleScale'),
          }),
          React.createElement(NumberRow, {
            label: '动作延时', hint: '毫秒，等她说完话再动',
            value: config.actionDelayMs, step: 100, min: 0, max: 20000, onChange: set('actionDelayMs'),
          }),
          React.createElement(ToggleRow, {
            label: '自动触发动作', hint: '往系统提示注入规则，让她回完话自己动',
            value: config.actionGuidance, onChange: set('actionGuidance'),
          }),
        ),

        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 } },
          React.createElement('button', { onClick: save, disabled: busy }, busy ? '保存中…' : '保存'),
          React.createElement('span', {
            style: { opacity: 0.8, color: statusKind === 'err' ? '#dc2626' : statusKind === 'ok' ? '#16a34a' : 'inherit' },
          }, status),
        ),
      )
    }

    const name = 'dafeiyu-pet-client'
    const inject = ['slots']

    function apply(ctx) {
      const slots = ctx?.slots
      if (!slots) return
      try {
        slots.inject('settings.section', () => slots.register({
          name: 'settings.section',
          id: 'dafeiyu-pet',
          order: 41,
          label: '大肥鱼桌宠',
        }, PetSettingsSection))
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dafeiyu-pet] 注册设置页失败:', error)
        }
      }
    }

    module.exports = { name, inject, apply }
    return module.exports
  },
})
