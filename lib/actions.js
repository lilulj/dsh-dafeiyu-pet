// 可播的一次性动作。循环动作（idle/thinking/working/waiting…）由 helper 自己跟状态切，
// 手动播会卡在那个姿势，所以不在这里。
export const ACTIONS = [
  // 官方
  'success', 'error', 'head_pat', 'poke', 'tail', 'eat_token', 'idle_stretch', 'idle_yawn',
  // 情绪
  'ext_angry', 'ext_shy', 'ext_happy', 'ext_startled', 'ext_gamefail', 'ext_tailslam',
  // 互动
  'ext_lookaround', 'ext_curtsy',
  // 说话
  'ext_chatter', 'ext_daze', 'ext_wipe', 'ext_deepthink', 'ext_whattoeat',
  // 工作
  'ext_work_pace', 'ext_work_tap', 'ext_work_think', 'ext_work_sort',
  'ext_coding', 'ext_notes',
  // 吃喝
  'ext_rice', 'ext_snack', 'ext_doze', 'ext_nap', 'ext_brush',
  'ext_breakfast', 'ext_lunch', 'ext_dinner', 'ext_bigsnack', 'ext_icecream',
  'ext_watermelon', 'ext_crab', 'ext_hotpot', 'ext_dumpling', 'ext_tangyuan',
  'ext_zongzi', 'ext_niangao', 'ext_qingtuan', 'ext_tanghulu', 'ext_laba',
  'ext_noodles', 'ext_chongyangcake',
  // 玩乐
  'ext_cat', 'ext_mirror', 'ext_cube', 'ext_hum', 'ext_gift', 'ext_balloon', 'ext_fan',
  'ext_dance', 'ext_maiddance', 'ext_sway', 'ext_spin', 'ext_violin', 'ext_flute',
  'ext_juggle', 'ext_cards', 'ext_gomoku', 'ext_spintop', 'ext_kite', 'ext_swing',
  'ext_jianzi', 'ext_hobbyhorse', 'ext_watergun', 'ext_toycar', 'ext_desktap', 'ext_outfit',
  // 小动作
  'ext_jumpsmash', 'ext_squish', 'ext_float', 'ext_run', 'ext_crabwalk',
  // 特效
  'ext_dove', 'ext_animals', 'ext_butterfly', 'ext_flower',
  'ext_whale', 'ext_ghost', 'ext_leaves',
  // 钱袋
  'ext_purse_broke', 'ext_purse_count', 'ext_purse_empty', 'ext_purse_jingle',
  'ext_purse_normal', 'ext_purse_full',
  // 节日
  'ext_firework', 'ext_redpacket', 'ext_midautumn', 'ext_double9', 'ext_qixi',
  'ext_fuzi', 'ext_lantern', 'ext_riverlantern', 'ext_lion', 'ext_snowman',
  'ext_christmas', 'ext_halloween',
]

export const ACTION_HINT = [
  '情绪：ext_angry 生气 / ext_shy 害羞 / ext_happy 开心 / ext_startled 被吓 / ext_gamefail 气急败坏 / ext_tailslam 尾巴拍地 / success 开心 / error 沮丧',
  '互动：poke 打招呼 / head_pat 被摸头 / tail 甩尾巴 / ext_lookaround 东张西望 / ext_curtsy 行礼 / idle_stretch 伸懒腰',
  '说话：ext_chatter 对屏碎碎念 / ext_daze 发呆 / ext_wipe 擦桌碎碎念 / ext_deepthink 深度思考 / ext_whattoeat 今天吃什么',
  '工作：ext_work_pace 踱步 / ext_work_tap 忙碌点按 / ext_work_think 思考冒泡 / ext_work_sort 清点 / ext_coding 写代码 / ext_notes 记录',
  '吃喝：eat_token 吃东西 / ext_rice 吃白饭 / ext_snack 偷吃零食 / ext_doze 打瞌睡 / ext_nap 打盹 / ext_brush 刷牙 / ext_breakfast ext_lunch ext_dinner 三餐 / ext_bigsnack 大口零食 / ext_icecream / ext_watermelon / ext_crab 大闸蟹 / ext_hotpot 火锅 / ext_dumpling / ext_tangyuan / ext_zongzi / ext_niangao / ext_qingtuan / ext_tanghulu / ext_laba / ext_noodles / ext_chongyangcake',
  '玩乐：ext_cat 撸猫 / ext_mirror 照镜子 / ext_cube 魔方 / ext_hum 哼歌 / ext_gift 拆礼物 / ext_balloon 吹气球 / ext_fan 扇扇子 / ext_dance 宅舞 / ext_maiddance 女仆舞 / ext_sway 摇摆舞 / ext_spin 转圈 / ext_violin 小提琴 / ext_flute 笛子 / ext_juggle 抛球 / ext_cards 扑克 / ext_gomoku 五子棋 / ext_spintop 陀螺 / ext_kite 风筝 / ext_swing 秋千 / ext_jianzi 毽子 / ext_hobbyhorse 木马 / ext_watergun 水枪 / ext_toycar 玩具车 / ext_desktap 敲桌 / ext_outfit 换装',
  '小动作：ext_jumpsmash 跳起 / ext_squish 下蹲 / ext_float 漂浮 / ext_run 奔跑 / ext_crabwalk 螃蟹走 / idle_stretch 伸懒腰 / idle_yawn 打哈欠',
  '特效：ext_dove 变鸽子 / ext_animals 动物环绕 / ext_butterfly 蝴蝶 / ext_flower 凭空生花 / ext_whale 蓝鲸 / ext_ghost 小幽灵 / ext_leaves 落叶',
  '钱袋：ext_purse_broke 分文不剩 / ext_purse_count 数金 / ext_purse_empty 袋空 / ext_purse_jingle 金袋叮当 / ext_purse_normal 钱袋如常 / ext_purse_full 满溢',
  '节日：ext_firework 烟花 / ext_redpacket 红包 / ext_midautumn 中秋 / ext_double9 重阳 / ext_qixi 七夕 / ext_fuzi 写福字 / ext_lantern 孔明灯 / ext_riverlantern 河灯 / ext_lion 舞狮 / ext_snowman 雪人 / ext_christmas 圣诞 / ext_halloween 万圣',
].join('\n')
