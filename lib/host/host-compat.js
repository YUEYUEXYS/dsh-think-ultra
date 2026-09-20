// host-compat.js — DeepSeek Harness 宿主版本兼容认证（纯函数、零副作用、fail-open）
//
// 背景：Think 只依赖宿主极小的稳定 API 面：
//   - @deepseek-ai/dsh-tools 的 defineTool
//   - agent 事件 agent/created | agent/session-start | agent/pre-step | agent/turn-stopping
//   - cordis 服务 llm / systemPrompt / agents / tools / settings / webServer
// 经逐版本比对（scripts_patch/probe-rc1-compat.cjs 实证）：
//   0.1.2-alpha.5 -> 0.1.2-rc.1 的 252 个改动文件全部是各子包 package.json 版本号，
//   零 .ts/.js 源码逻辑变更，因此整个 0.1.2 代（alpha.2 起、全部 rc、0.1.2 正式）API 同构，插件二进制级兼容。
//
// 本模块永不抛错：任何无法判定的情况都返回 level:'unknown' 且 supported:true（不因版本字符串阻断激活）。

export const HOST_COMPAT_BASELINE = Object.freeze({ major: 0, minor: 1, patch: 2, firstAlpha: 2 });

// 解析 "0.1.2-rc.1" / "0.1.2-alpha.5" / "0.1.2" -> 结构化版本，无法解析返回 null
export function parseHostVersion(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const m = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?(?:[+.].*)?$/i);
  if (!m) return null;
  const channel = m[4] ? m[4].toLowerCase() : 'release';
  return {
    major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]),
    channel, seq: m[5] ? Number(m[5]) : Number.POSITIVE_INFINITY, // release 视为同代最高
    raw: raw.trim(),
  };
}

function cmpCore(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  return 0;
}

// 返回兼容评估：{ version, parsed, level, supported, channel, note }
// level: 'ok' 同代认证兼容 | 'forward' 同 minor 更新版本(向前兼容) | 'cautious' minor 跃迁(谨慎,不阻断)
//        | 'legacy' 低于基线(不推荐) | 'unknown' 无法解析(fail-open)
export function assessHostCompat(rawVersion) {
  const parsed = parseHostVersion(rawVersion);
  const base = { major: HOST_COMPAT_BASELINE.major, minor: HOST_COMPAT_BASELINE.minor, patch: HOST_COMPAT_BASELINE.patch };
  if (!parsed) {
    return { version: String(rawVersion || 'unknown'), parsed: null, level: 'unknown', supported: true, channel: 'unknown', note: 'host-version-unreadable' };
  }
  const c = cmpCore(parsed, base);
  if (c === 0) {
    // 同为 0.1.2：alpha.2 起、任意 rc、正式版全部认证兼容（零 API 破坏）
    const tooEarlyAlpha = parsed.channel === 'alpha' && parsed.seq < HOST_COMPAT_BASELINE.firstAlpha;
    if (tooEarlyAlpha) {
      return { version: parsed.raw, parsed, level: 'legacy', supported: true, channel: parsed.channel, note: 'alpha-before-baseline-shim-present' };
    }
    return { version: parsed.raw, parsed, level: 'ok', supported: true, channel: parsed.channel, note: 'certified-same-generation' };
  }
  if (c > 0) {
    if (parsed.major === base.major && parsed.minor === base.minor) {
      // 0.1.x（x>2）：同 minor 向前兼容
      return { version: parsed.raw, parsed, level: 'forward', supported: true, channel: parsed.channel, note: 'forward-same-minor' };
    }
    // 更高 minor/major：可能引入破坏，不阻断激活但标记谨慎
    return { version: parsed.raw, parsed, level: 'cautious', supported: true, channel: parsed.channel, note: 'newer-generation-untested' };
  }
  // 低于 0.1.2
  return { version: parsed.raw, parsed, level: 'legacy', supported: true, channel: parsed.channel, note: 'below-baseline' };
}

// 一行人类可读认证摘要（写日志用）
export function compatLine(rawVersion) {
  const a = assessHostCompat(rawVersion);
  const tag = { ok: 'CERTIFIED', forward: 'FORWARD-OK', cautious: 'CAUTIOUS', legacy: 'LEGACY', unknown: 'UNVERSIONED' }[a.level] || 'UNKNOWN';
  return `[host-compat] harness=${a.version} channel=${a.channel} -> ${tag} (${a.note})`;
}
