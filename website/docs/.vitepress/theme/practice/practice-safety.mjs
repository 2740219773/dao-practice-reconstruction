const POSTURE_ISSUES = ['posture_pain', 'numbness', 'shoulder_neck_tension']
const REVIEW_REQUIRED_ISSUES = new Set(['dizziness_chest', 'perceptual_reality_change', 'function_impact'])

export function buildSafetyReview(stats, { periodLabel = '最近7天' } = {}) {
  const flags = []
  const issues = stats?.issueCountMap || {}

  if ((stats?.redCount || 0) > 0) {
    flags.push({ level: 'red', code: 'red_event', text: `${periodLabel}存在红色事件。优先停止相关实践并按安全边界处理；本工具不会在这种情况下推荐加量或高级练法。` })
  }
  if ((issues.function_impact || 0) > 0) {
    flags.push({ level: 'yellow', code: 'function_impact', text: '记录中出现现实功能受影响。优先减少负荷并观察，不把连续性放在睡眠、工作和生活之前。' })
  }
  if ((stats?.yellowCount || 0) >= 2) {
    flags.push({ level: 'yellow', code: 'repeated_yellow', text: `${periodLabel}黄色事件重复出现。优先暂停触发问题的单元、缩短或回退，而不是增加时长。` })
  }
  if ((issues.breath_control || 0) >= 2) {
    flags.push({ level: 'yellow', code: 'repeated_breath_control', text: '“主动控制呼吸”重复出现。可以暂时跳过察息，改用脚底、座面或环境声音；不要用主动调息来解决。' })
  }

  const postureCount = POSTURE_ISSUES.reduce((sum, key) => sum + Number(issues[key] || 0), 0)
  if (postureCount >= 2) {
    flags.push({ level: 'yellow', code: 'repeated_posture', text: '姿势相关问题重复出现。优先换普通支撑、缩短时长和允许微调，不要忍痛维持。' })
  }
  if ((stats?.overLimitCount || 0) >= 2) {
    flags.push({ level: 'yellow', code: 'repeated_over_limit', text: `${periodLabel}有多次实际时长超过当前卡片审查上限。记录应保留，但下一步优先回到已审查负荷，而不是把超时常态化。` })
  }

  if (!stats?.recordCount) {
    flags.push({ level: 'info', code: 'empty', text: `${periodLabel}还没有记录。可以从一次短时、低负荷的基础实践开始，也可以选择今天不练。` })
  } else if (!flags.length) {
    flags.push({ level: 'info', code: 'stable', text: `${periodLabel}没有触发重复安全规则。保持当前低负荷即可，不需要因为“状态不错”自动增加时长。` })
  }

  const rank = { red: 3, yellow: 2, info: 1 }
  flags.sort((a, b) => rank[b.level] - rank[a.level])
  return {
    level: flags[0]?.level || 'info',
    primary: flags[0]?.text || '',
    flags
  }
}

export function reviewDraftSafety(record) {
  if (!record) return []
  const notices = []
  const issues = new Set(Array.isArray(record.issues) ? record.issues : [])

  if (record.severity === 'red') {
    notices.push({ level: 'red', text: '已标记红色事件：保存后停止相关实践，并优先查看安全边界。' })
    return notices
  }

  const requiresReview = [...REVIEW_REQUIRED_ISSUES].some((id) => issues.has(id)) || record.afterState === 'affected'
  if (requiresReview && record.severity === 'none') {
    notices.push({
      level: 'yellow',
      text: '当前记录包含头晕/胸闷、异常感知、现实功能影响等需要重点关注的项目，但安全分流仍为“无升级事件”。请重新核对是否应标记黄色或红色；系统不自动替你做医学判断。'
    })
  }

  if (record.breathState === 'clearly_controlled' && record.practiceId === 'practice.basic.natural_breath') {
    notices.push({ level: 'yellow', text: '本次“自然察息”记录为明显主动控制呼吸。建议按事实保存，并优先回退到身体接触或环境声音，不用主动调息纠正。' })
  }

  return notices
}
