# 大肥鱼桌宠 · dsh-dafeiyu-pet

桌面上的蓝色鲸鱼娘。**独立插件**：自带桌宠窗口、104 个动作和语音，不依赖官方 `dsh-dafeiyu`。

![platform](https://img.shields.io/badge/platform-Windows%20x64-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## 它能做什么

- **桌宠**：出现在桌面上，透明背景、可拖动、右键菜单、状态气泡
- **跟随 DSH**：你在 DSH 里思考、调工具、完成、出错时，她会切对应动画
- **104 个动作**：吃喝、玩乐、节日、情绪、工作、特效十大类，右键「播放动作」分 11 组
- **会说话**：msedge-tts 合成，本机播放；配好 QQ 机器人还能发成语音条
- **不需要 key**：除了 QQ 语音条那一项，其余开箱即用

## 装之前

| 条件 | 说明 |
|---|---|
| Windows x64 | helper 是 Windows 可执行文件，本机播放用 MediaPlayer COM |
| 已装 DSH | 0.1.7 及以上 |
| **禁用官方桌宠** | 见下方，必须做，否则两只桌宠抢同一个控制口 |

## 安装

### 1. 放到 profile 里

把整个 `dsh-dafeiyu-pet` 目录复制到：

```
<DSH 数据目录>\profiles\desktop\node_modules\dsh-dafeiyu-pet
```

例如本机是 `E:\llmood\dsh\profiles\desktop\node_modules\dsh-dafeiyu-pet`。

> 目录里要包含 `assets/`、`runtime/`、`lib/`、`index.js`、`package.json`。

### 2. 禁用官方桌宠

编辑 `<DSH 数据目录>\profiles\desktop\cordis.patch.yml`，找到 `dsh-dafeiyu` 那一条，加一行：

```yaml
- id: dsh-dafeiyu
  name: dsh-dafeiyu
  disabled: true          # ← 加这一行
  config:
    ...
```

### 3. 挂上插件

在同一个文件的末尾加：

```yaml
- insert:
    - id: dafeiyu-pet
      name: dsh-dafeiyu-pet
```

### 4. 重启 DSH

**完全退出**再打开（托盘里也要退）。第一次启动会慢十几秒——要把 Qt 运行库解压到数据目录。

见到桌宠就成功了。

## 配置

两个入口，功能一样：

- DSH **设置 → 左侧「大肥鱼桌宠」**
- 浏览器打开 **http://127.0.0.1:7811/**

### 必须配的：没有

不填任何东西就能用：桌宠、104 个动作、本机语音全部正常。

### 想让语音发到 QQ 语音条：填三项

| 字段 | 从哪拿 |
|---|---|
| AppID | `q.qq.com` 创建的机器人 |
| AppSecret | 创建时显示的那串，只显示一次 |
| OpenID | **收语音条的人的** openid，不是 QQ 号。在机器人日志 `Processing: scope=c2c peerId=...` 里找 |

> 每个人要用自己的机器人，AppSecret 不能共用。

### 其他选项都有合理默认值

| 项 | 默认 | 什么时候改 |
|---|---|---|
| 待机活跃度 | 活泼（12–22 秒动一下） | 嫌闹改「安静」（45–90 秒） |
| 角色大小 / 气泡大小 | 0.6 / 0.8 | 觉得太大太小 |
| 动作延时 | 4500 毫秒 | 她话没说完就动 → 调大 |
| 自动触发动作 | 开 | 只想手动叫她 → 关掉 |
| 音色 / 语速 / 音调 | XiaoyiNeural / 1.08 / +6Hz | 声音不满意 |

保存后语音和动作**下次调用生效**；角色大小、启用开关要重启 DSH。

## 怎么让她动

| 方式 | 说明 |
|---|---|
| 右键桌宠 | 「播放动作」子菜单，11 个分组 |
| 对话触发 | 插件会往系统提示注入规则，你回完话她自己动 |
| 手动调用 | `POST http://127.0.0.1:7799/play`，body `{"clip":"ext_cat"}` |
| QQ 里聊天 | 需要另外装 `@tencent-connect/dsh-qqbot`，并在它的 directPrompt 里要求调用 `dafeiyu_play_action` |

查看所有可用动作：

```powershell
Invoke-RestMethod http://127.0.0.1:7799/health | Select-Object -ExpandProperty clips
```

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 屏幕上两只大肥鱼 | 没禁用官方 `dsh-dafeiyu`，见安装第 2 步 |
| 桌宠不出现 | 看 `<DSH 数据目录>\dafeiyu-pet\helper.log` 和 `logs\desktop-next.log` 里 `dafeiyu-pet` 相关行 |
| 第一次启动特别慢 | 正常，正在解压 Qt 运行库（约 100MB），只此一次 |
| 设置页 7811 打不开 | 桌宠没在运行；或端口被占，设环境变量 `DAFEIYU_PET_SETTINGS_PORT` 换一个 |
| 右键菜单缺动作 | 重建过 helper 后没重启 DSH |
| 语音没声音 | 检查系统输出设备；本机播放走 Windows MediaPlayer |
| QQ 收不到语音条 | 三项配置没填全，或用户关了「允许主动发送」 |

## 数据放哪

`<DSH 数据目录>\dafeiyu-pet\`：

```
config.json    设置（含 QQ AppSecret 明文，别外发）
layout.json    窗口位置
helper.log     桌宠进程日志
voice/         语音临时文件，只留最近 10 条
tmp/           Qt 运行库解压目录
```

删掉整个目录 = 恢复默认设置和位置。

## 许可

- 插件代码：MIT
- 角色素材：来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，MIT，见 `ASSET_LICENSE.md`
- 桌宠运行时：基于 `dsh-dafeiyu`（MIT）改造，见 `LICENSE`
- 光标：Chromium 项目，BSD-3-Clause

本插件是非官方粉丝作品，与 DeepSeek 无关。
