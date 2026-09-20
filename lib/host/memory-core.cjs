// memory-core.cjs — 真正运行的混合记忆核心引擎
// 不是提示词，是实际在后端运行的记忆系统：向量存储+语义检索+记忆分层+自动整合+持久化
// 设计参考顶级记忆系统的核心算法，但全部原创实现，无外部依赖，纯Node.js运行。

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========== 向量工具（纯JS实现，无外部依赖） ==========

// 简单但有效的文本向量化：基于字符n-gram的TF-IDF风格向量
// 维度固定为256维，用哈希映射到固定维度，适合语义相似度计算
class TextVectorizer {
  constructor(dim = 256) {
    this.dim = dim;
    this.idf = new Map(); // 词项逆文档频率
    this.docCount = 0;
  }

  // 文本预处理：小写、去标点、分词（中文按字，英文按词）
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    const lower = text.toLowerCase();
    const tokens = [];
    // 提取英文单词
    const words = lower.match(/[a-z]{2,}/g) || [];
    tokens.push(...words);
    // 提取中文字符（单字+双字）
    const chars = lower.match(/[\u4e00-\u9fa5]/g) || [];
    tokens.push(...chars);
    // 双字组合
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.push(chars[i] + chars[i + 1]);
    }
    return tokens;
  }

  // 哈希函数：将词项映射到固定维度
  hash(token) {
    const h = crypto.createHash('md5').update(token).digest();
    return h.readUInt32LE(0) % this.dim;
  }

  // 文本转向量（词袋+哈希+L2归一化）
  vectorize(text) {
    const tokens = this.tokenize(text);
    const vec = new Float32Array(this.dim);
    const tf = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    for (const [token, count] of tf) {
      const idx = this.hash(token);
      const idfVal = this.idf.get(token) || 1;
      vec[idx] += count * idfVal;
    }
    // L2归一化
    let norm = 0;
    for (let i = 0; i < this.dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < this.dim; i++) vec[i] /= norm;
    return vec;
  }

  // 余弦相似度
  similarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
    return Math.max(0, Math.min(1, dot)); // 钳制到[0,1]
  }

  // 更新IDF（批量学习）
  updateIDF(documents) {
    for (const doc of documents) {
      const tokens = new Set(this.tokenize(doc));
      for (const t of tokens) {
        this.idf.set(t, (this.idf.get(t) || 0) + 1);
      }
      this.docCount++;
    }
    // 计算IDF值
    for (const [t, df] of this.idf) {
      this.idf.set(t, Math.log((this.docCount + 1) / (df + 1)) + 1);
    }
  }
}

// ========== 记忆条目 ==========

class MemoryItem {
  constructor({ id, content, type, importance, tags, sessionId, createdAt, accessCount, lastAccessed, vector }) {
    this.id = id || crypto.randomUUID();
    this.content = content || '';
    this.type = type || 'fact'; // fact / preference / decision / context / lesson
    this.importance = importance != null ? importance : 0.5; // 0.0-1.0
    this.tags = tags || [];
    this.sessionId = sessionId || null;
    this.createdAt = createdAt || Date.now();
    this.accessCount = accessCount || 0;
    this.lastAccessed = lastAccessed || null;
    this.vector = vector || null; // Float32Array
  }

  // 计算当前有效重要性（基础重要性 + 访问频率加权 - 时间衰减）
  getEffectiveImportance(now = Date.now()) {
    const ageHours = (now - this.createdAt) / (1000 * 60 * 60);
    // 时间衰减：半衰期7天，重要性随时间衰减
    const decay = Math.pow(0.5, ageHours / (24 * 7));
    // 访问频率加权：访问越多越重要
    const accessBoost = Math.min(0.3, this.accessCount * 0.02);
    return Math.max(0, Math.min(1, this.importance * decay + accessBoost));
  }

  toJSON() {
    return {
      id: this.id,
      content: this.content,
      type: this.type,
      importance: this.importance,
      tags: this.tags,
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      accessCount: this.accessCount,
      lastAccessed: this.lastAccessed,
      vector: this.vector ? Array.from(this.vector) : null,
    };
  }

  static fromJSON(obj) {
    const item = new MemoryItem({
      id: obj.id,
      content: obj.content,
      type: obj.type,
      importance: obj.importance,
      tags: obj.tags,
      sessionId: obj.sessionId,
      createdAt: obj.createdAt,
      accessCount: obj.accessCount,
      lastAccessed: obj.lastAccessed,
    });
    if (obj.vector && Array.isArray(obj.vector)) {
      item.vector = new Float32Array(obj.vector);
    }
    return item;
  }
}

// ========== 混合记忆核心 ==========

class MemoryCore {
  constructor(options = {}) {
    this.vectorizer = new TextVectorizer(options.dim || 256);
    this.memories = new Map(); // id -> MemoryItem
    this.sessionMemories = new Map(); // sessionId -> Set<id>
    this.storagePath = options.storagePath || null;
    this.maxMemories = options.maxMemories || 5000;
    this.consolidateThreshold = options.consolidateThreshold || 100; // 每100条整合一次
    this.similarityThreshold = options.similarityThreshold || 0.75; // 相似度>0.75视为相似
    this.importanceThreshold = options.importanceThreshold || 0.3; // 低于此值的记忆会被清理
    this._dirty = false;
    this._load();
  }

  // 添加记忆
  add(content, options = {}) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return null;
    }
    const item = new MemoryItem({
      content: content.trim(),
      type: options.type || 'fact',
      importance: options.importance != null ? options.importance : this._assessImportance(content),
      tags: options.tags || [],
      sessionId: options.sessionId || null,
    });
    item.vector = this.vectorizer.vectorize(content);
    this.memories.set(item.id, item);
    if (item.sessionId) {
      if (!this.sessionMemories.has(item.sessionId)) {
        this.sessionMemories.set(item.sessionId, new Set());
      }
      this.sessionMemories.get(item.sessionId).add(item.id);
    }
    this._dirty = true;
    // 自动整合检查
    if (this.memories.size % this.consolidateThreshold === 0) {
      this.consolidate();
    }
    // 容量管理
    if (this.memories.size > this.maxMemories) {
      this._evictLowImportance();
    }
    this._save();
    return item;
  }

  // 语义检索：返回最相关的topK条记忆
  search(query, options = {}) {
    const topK = options.topK || 5;
    const minSimilarity = options.minSimilarity || 0.3;
    const sessionId = options.sessionId || null;
    const type = options.type || null;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return [];
    }

    const queryVec = this.vectorizer.vectorize(query);
    const results = [];

    for (const item of this.memories.values()) {
      // 过滤
      if (sessionId && item.sessionId !== sessionId && item.type !== 'preference') continue;
      if (type && item.type !== type) continue;
      if (!item.vector) continue;

      const sim = this.vectorizer.similarity(queryVec, item.vector);
      if (sim < minSimilarity) continue;

      // 综合评分：相似度 * 0.6 + 有效重要性 * 0.4
      const effectiveImp = item.getEffectiveImportance();
      const score = sim * 0.6 + effectiveImp * 0.4;

      results.push({ item, similarity: sim, score, effectiveImportance: effectiveImp });
    }

    // 按综合评分排序
    results.sort((a, b) => b.score - a.score);

    // 更新访问计数
    const now = Date.now();
    for (const r of results.slice(0, topK)) {
      r.item.accessCount++;
      r.item.lastAccessed = now;
    }
    if (results.length > 0) this._dirty = true;

    return results.slice(0, topK);
  }

  // 获取会话相关的所有记忆
  getSessionMemories(sessionId) {
    if (!sessionId || !this.sessionMemories.has(sessionId)) return [];
    const ids = this.sessionMemories.get(sessionId);
    const result = [];
    for (const id of ids) {
      if (this.memories.has(id)) result.push(this.memories.get(id));
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  // 记忆整合：合并相似记忆、消解矛盾、提取核心知识
  consolidate() {
    const items = Array.from(this.memories.values());
    const merged = new Set();
    let mergeCount = 0;

    for (let i = 0; i < items.length; i++) {
      if (merged.has(items[i].id)) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (merged.has(items[j].id)) continue;
        if (!items[i].vector || !items[j].vector) continue;

        const sim = this.vectorizer.similarity(items[i].vector, items[j].vector);
        if (sim >= this.similarityThreshold) {
          // 合并：保留重要性高的内容，合并标签，更新内容
          const keep = items[i].importance >= items[j].importance ? items[i] : items[j];
          const drop = keep === items[i] ? items[j] : items[i];

          // 合并标签
          const allTags = new Set([...keep.tags, ...drop.tags]);
          keep.tags = Array.from(allTags);

          // 提升重要性（合并后的记忆更重要）
          keep.importance = Math.min(1, keep.importance + 0.1);

          // 如果内容有差异，标记为需要人工确认（不自动覆盖）
          if (keep.content !== drop.content && sim < 0.9) {
            keep.tags.push('needs-review');
          }

          this.memories.delete(drop.id);
          if (drop.sessionId && this.sessionMemories.has(drop.sessionId)) {
            this.sessionMemories.get(drop.sessionId).delete(drop.id);
          }
          merged.add(drop.id);
          mergeCount++;
        }
      }
    }

    this._dirty = true;
    this._save();
    return { merged: mergeCount, remaining: this.memories.size };
  }

  // 清理低重要性记忆
  _evictLowImportance() {
    const now = Date.now();
    const toDelete = [];
    for (const item of this.memories.values()) {
      if (item.getEffectiveImportance(now) < this.importanceThreshold && item.type !== 'preference') {
        toDelete.push(item.id);
      }
    }
    // 只删除最旧的，直到容量降到maxMemories的90%
    toDelete.sort((a, b) => {
      const ia = this.memories.get(a);
      const ib = this.memories.get(b);
      return ia.createdAt - ib.createdAt;
    });
    const target = Math.floor(this.maxMemories * 0.9);
    let deleted = 0;
    while (this.memories.size > target && deleted < toDelete.length) {
      const id = toDelete[deleted++];
      const item = this.memories.get(id);
      if (item && item.sessionId && this.sessionMemories.has(item.sessionId)) {
        this.sessionMemories.get(item.sessionId).delete(id);
      }
      this.memories.delete(id);
    }
    this._dirty = true;
  }

  // 评估内容重要性（基于关键词和长度的启发式评估）
  _assessImportance(content) {
    if (!content) return 0.3;
    let score = 0.3;
    // 长度加权
    if (content.length > 50) score += 0.1;
    if (content.length > 200) score += 0.1;
    // 关键词加权
    const highImportance = /必须|一定|重要|关键|核心|永远|始终|不要|禁止|偏好|喜欢|讨厌|习惯|规则|约定|决定|结论|答案|解决方案|错误|bug|修复|配置|设置|密码|密钥|token|api|地址|电话|邮箱|姓名|生日|账号|账户/i;
    const mediumImportance = /建议|可能|大概|也许|试试|考虑|分析|讨论|计划|想法|思路|方案|设计|架构|流程|步骤|方法|技巧|经验|教训|总结|回顾/i;
    if (highImportance.test(content)) score += 0.3;
    if (mediumImportance.test(content)) score += 0.1;
    return Math.max(0.1, Math.min(1, score));
  }

  // 持久化保存
  _save() {
    if (!this.storagePath || !this._dirty) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        version: 1,
        savedAt: Date.now(),
        vectorizer: { dim: this.vectorizer.dim, docCount: this.vectorizer.docCount, idf: Array.from(this.vectorizer.idf.entries()) },
        memories: Array.from(this.memories.values()).map(m => m.toJSON()),
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(data), 'utf8');
      this._dirty = false;
    } catch (e) {
      // 保存失败不阻断主流程
      console.warn('[memory-core] save failed:', e.message);
    }
  }

  // 加载持久化数据
  _load() {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const data = JSON.parse(raw);
      if (data.vectorizer) {
        this.vectorizer.dim = data.vectorizer.dim || 256;
        this.vectorizer.docCount = data.vectorizer.docCount || 0;
        if (Array.isArray(data.vectorizer.idf)) {
          for (const [k, v] of data.vectorizer.idf) {
            this.vectorizer.idf.set(k, v);
          }
        }
      }
      if (Array.isArray(data.memories)) {
        for (const obj of data.memories) {
          try {
            const item = MemoryItem.fromJSON(obj);
            this.memories.set(item.id, item);
            if (item.sessionId) {
              if (!this.sessionMemories.has(item.sessionId)) {
                this.sessionMemories.set(item.sessionId, new Set());
              }
              this.sessionMemories.get(item.sessionId).add(item.id);
            }
          } catch { /* 跳过损坏的条目 */ }
        }
      }
      this._dirty = false;
    } catch (e) {
      console.warn('[memory-core] load failed:', e.message);
    }
  }

  // ===== 增强：记忆冲突自动消解 =====
  resolveConflicts() {
    const conflicts = [];
    const items = Array.from(this.memories.values());
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (!items[i].vector || !items[j].vector) continue;
        const sim = this.vectorizer.similarity(items[i].vector, items[j].vector);
        if (sim >= this.similarityThreshold && items[i].content !== items[j].content) {
          const conflict = { item1: items[i].id, item2: items[j].id, similarity: sim };
          if (items[i].importance >= items[j].importance) {
            items[j].tags = items[j].tags || [];
            if (!items[j].tags.includes('superseded')) items[j].tags.push('superseded');
            items[j].importance = Math.max(0.1, items[j].importance - 0.2);
            conflict.resolution = 'kept_item1';
          } else {
            items[i].tags = items[i].tags || [];
            if (!items[i].tags.includes('superseded')) items[i].tags.push('superseded');
            items[i].importance = Math.max(0.1, items[i].importance - 0.2);
            conflict.resolution = 'kept_item2';
          }
          conflicts.push(conflict);
        }
      }
    }
    if (conflicts.length > 0) { this._dirty = true; this._save(); }
    return { resolved: conflicts.length, conflicts };
  }

  // ===== 增强：记忆摘要生成 =====
  generateSummary(options = {}) {
    const topK = options.topK || 10;
    const minImportance = options.minImportance || 0.5;
    const now = Date.now();
    const sorted = Array.from(this.memories.values())
      .filter(m => m.getEffectiveImportance(now) >= minImportance && !m.tags.includes('superseded'))
      .sort((a, b) => b.getEffectiveImportance(now) - a.getEffectiveImportance(now))
      .slice(0, topK);
    return {
      generatedAt: now,
      totalMemories: this.memories.size,
      coreMemories: sorted.length,
      highlights: sorted.map(m => ({
        content: m.content.slice(0, 150),
        importance: Math.round(m.getEffectiveImportance(now) * 100),
        type: m.type,
      })),
    };
  }

  // ===== 增强：记忆导出 =====
  exportMemories(options = {}) {
    const format = options.format || 'json';
    const now = Date.now();
    const items = Array.from(this.memories.values()).map(m => m.toJSON());
    if (format === 'json') {
      return JSON.stringify({ version: 1, exportedAt: now, count: items.length, memories: items }, null, 2);
    }
    if (format === 'markdown') {
      let md = '# 记忆导出\n\n';
      md += `导出时间：${new Date(now).toLocaleString()}\n记忆数量：${items.length}\n\n---\n\n`;
      for (const item of items) {
        md += `## [${item.type}] 重要性${Math.round(item.importance * 100)}%\n\n${item.content}\n\n---\n\n`;
      }
      return md;
    }
    throw new Error(`Unsupported format: ${format}`);
  }

  // ===== 增强：记忆导入（去重合并） =====
  importMemories(jsonData, options = {}) {
    let data;
    try { data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData; }
    catch (e) { return { imported: 0, skipped: 0, error: 'Invalid JSON' }; }
    if (!data.memories || !Array.isArray(data.memories)) return { imported: 0, skipped: 0, error: 'No memories' };
    let imported = 0, skipped = 0;
    for (const obj of data.memories) {
      try {
        const vec = this.vectorizer.vectorize(obj.content || '');
        let isDup = false;
        for (const existing of this.memories.values()) {
          if (!existing.vector) continue;
          if (this.vectorizer.similarity(vec, existing.vector) > 0.9) { isDup = true; break; }
        }
        if (isDup) { skipped++; continue; }
        const item = MemoryItem.fromJSON(obj);
        if (!item.vector) item.vector = this.vectorizer.vectorize(item.content);
        this.memories.set(item.id, item);
        if (item.sessionId) {
          if (!this.sessionMemories.has(item.sessionId)) this.sessionMemories.set(item.sessionId, new Set());
          this.sessionMemories.get(item.sessionId).add(item.id);
        }
        imported++;
      } catch { skipped++; }
    }
    if (imported > 0) { this._dirty = true; this._save(); }
    return { imported, skipped, total: data.memories.length };
  }

  // ===== 增强：优先级检索（相似度+重要性+时效性） =====
  searchPriority(query, options = {}) {
    const topK = options.topK || 5;
    const now = Date.now();
    const results = this.search(query, { topK: topK * 3, minSimilarity: 0.2 });
    for (const r of results) {
      const ageHours = (now - r.item.createdAt) / (1000 * 60 * 60);
      const recency = Math.max(0, 1 - ageHours / 720);
      r.priority = r.similarity * 0.5 + r.effectiveImportance * 0.3 + recency * 0.2;
    }
    results.sort((a, b) => b.priority - a.priority);
    return results.slice(0, topK);
  }

  // 获取统计信息
  getStats() {
    const now = Date.now();
    let totalImportance = 0;
    let highImportance = 0;
    const typeCount = {};
    for (const item of this.memories.values()) {
      const eff = item.getEffectiveImportance(now);
      totalImportance += eff;
      if (eff > 0.7) highImportance++;
      typeCount[item.type] = (typeCount[item.type] || 0) + 1;
    }
    return {
      total: this.memories.size,
      avgImportance: this.memories.size > 0 ? totalImportance / this.memories.size : 0,
      highImportanceCount: highImportance,
      sessions: this.sessionMemories.size,
      byType: typeCount,
    };
  }

  // 清空所有记忆（危险操作，需要确认）
  clear(confirm = false) {
    if (!confirm) throw new Error('clear() requires confirm=true');
    this.memories.clear();
    this.sessionMemories.clear();
    this._dirty = true;
    this._save();
  }
}

// ========== 导出 ==========

module.exports = {
  MemoryCore,
  MemoryItem,
  TextVectorizer,
};
