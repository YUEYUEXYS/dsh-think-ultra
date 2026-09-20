#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Think / vision-fovea  —  real foveation tile cutter (native side).

纯本地、无网络。唯一第三方依赖 Pillow。由 Node 侧 vision-fovea.js 以子进程调用：
    python vision_fovea.py <plan.json>
plan.json:
{
  "src": "<source image path>",
  "outDir": "<tile output dir>",
  "grid":  {"cols": 3, "rows": 3, "overlap": 0.12},   # 自适应宫格（None 可跳过）
  "pyramid": [0.5, 0.25],                              # 中心 fovea 各级取图边长比例（相对整图）
  "rois":  [[x0,y0,x1,y1], ...],                       # 归一化 ROI，可选
  "tileMax": 1024,                                     # 每张 tile 长边像素
  "quality": 80,
  "fmt": "jpeg",
  "globalTile": true                                   # 是否额外输出一张干净全局图
}
stdout 打印 manifest JSON：
{ "ok": true, "width":W,"height":H, "tiles":[{file,label,kind,bbox:[..归一化..],"scale":f}], "dropped":[] }
任何无法处理的情况都以 {"ok":false,"error": "..."} 退出码 0 返回（Node 侧据此 fail-open），不抛栈给用户。
"""
import sys, os, json, math

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()

def main():
    try:
        from PIL import Image
    except Exception as e:  # Pillow 缺失 -> Node 侧降级到指令式
        emit({"ok": False, "error": "NO_PILLOW:" + str(e)[:160]}); return

    plan_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not plan_path or not os.path.isfile(plan_path):
        emit({"ok": False, "error": "NO_PLAN"}); return
    try:
        with open(plan_path, "r", encoding="utf-8") as f:
            plan = json.load(f)
    except Exception as e:
        emit({"ok": False, "error": "BAD_PLAN:" + str(e)[:160]}); return

    src = plan.get("src"); outDir = plan.get("outDir")
    if not src or not os.path.isfile(src) or not outDir:
        emit({"ok": False, "error": "NO_SRC"}); return
    os.makedirs(outDir, exist_ok=True)

    tileMax = int(plan.get("tileMax", 1024) or 1024)
    tileMax = max(384, min(tileMax, 1536))
    quality = int(plan.get("quality", 80) or 80); quality = max(40, min(quality, 95))
    fmt = (plan.get("fmt") or "jpeg").lower()
    ext = "jpg" if fmt in ("jpeg", "jpg") else "png"

    try:
        im = Image.open(src)
        im.load()
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        elif im.mode == "L":
            im = im.convert("RGB")
        W, H = im.size
        if W < 16 or H < 16:
            emit({"ok": False, "error": "TOO_SMALL"}); return
    except Exception as e:
        emit({"ok": False, "error": "OPEN_FAIL:" + str(e)[:160]}); return

    tiles = []; dropped = []; seq = 0

    def save_tile(crop, label, kind, bbox):
        nonlocal seq
        try:
            cw, ch = crop.size
            if cw < 12 or ch < 12:
                dropped.append(label); return
            scale_l = tileMax / max(cw, ch)
            # 只放大或等比规整到 tileMax，不把超大图硬拉糊：上限 4x，避免过度插值
            target_l = min(max(cw, ch) * max(1.0, min(scale_l, 4.0)), tileMax) if scale_l >= 1.0 else min(max(cw, ch), tileMax)
            ratio = target_l / max(cw, ch)
            nw, nh = max(1, round(cw * ratio)), max(1, round(ch * ratio))
            out = crop.resize((nw, nh), Image.LANCZOS)
            seq += 1
            fname = "t%02d-%s.%s" % (seq, kind, ext)
            fpath = os.path.join(outDir, fname)
            if ext == "jpg":
                out.save(fpath, "JPEG", quality=quality, optimize=False)
            else:
                out.save(fpath, "PNG", optimize=False)
            tiles.append({"file": fpath, "label": label, "kind": kind,
                          "bbox": [round(b, 4) for b in bbox],
                          "size": [nw, nh],
                          "scale": round(ratio, 3)})
        except Exception as e:
            dropped.append(label + ":" + str(e)[:60])

    def clamp(v, lo, hi):
        return max(lo, min(hi, v))

    # 0) 干净全局图（保证模型同时拥有全局上下文，不被局部切碎）
    if plan.get("globalTile", True):
        save_tile(im.copy(), "GLOBAL", "global", [0.0, 0.0, 1.0, 1.0])

    # 1) 自适应宫格：长轴多切，overlap 外扩防漏缝
    g = plan.get("grid")
    if g:
        cols = int(g.get("cols", 3) or 3); rows = int(g.get("rows", 3) or 3)
        cols = max(1, min(cols, 5)); rows = max(1, min(rows, 5))
        ov = float(g.get("overlap", 0.12) or 0.0); ov = clamp(ov, 0.0, 0.35)
        cw, ch = 1.0 / cols, 1.0 / rows
        for r in range(rows):
            for c in range(cols):
                x0 = clamp(c * cw - ov * cw, 0.0, 1.0); y0 = clamp(r * ch - ov * ch, 0.0, 1.0)
                x1 = clamp((c + 1) * cw + ov * cw, 0.0, 1.0); y1 = clamp((r + 1) * ch + ov * ch, 0.0, 1.0)
                px = (round(x0 * W), round(y0 * H), round(x1 * W), round(y1 * H))
                crop = im.crop(px)
                save_tile(crop, "R%dC%d" % (r + 1, c + 1), "grid", [x0, y0, x1, y1])

    # 2) 中心 fovea 金字塔：逐级放大中心区域（远观->逼近）
    pyr = plan.get("pyramid") or []
    for idx, side in enumerate(pyr):
        side = clamp(float(side), 0.05, 1.0)
        m = (1.0 - side) / 2.0
        bbox = [m, m, m + side, m + side]
        px = (round(bbox[0] * W), round(bbox[1] * H), round(bbox[2] * W), round(bbox[3] * H))
        save_tile(im.crop(px), "FOCUS-L%d" % (idx + 1), "pyramid", bbox)

    # 3) 显式 ROI（归一化），zoom 由裁剪后放大自然完成
    for ri, bb in enumerate(plan.get("rois") or []):
        try:
            x0, y0, x1, y1 = [clamp(float(v), 0.0, 1.0) for v in bb[:4]]
            if x1 <= x0 or y1 <= y0: continue
            px = (round(x0 * W), round(y0 * H), round(x1 * W), round(y1 * H))
            save_tile(im.crop(px), "ROI-%d" % (ri + 1), "roi", [x0, y0, x1, y1])
        except Exception:
            continue

    if not tiles:
        emit({"ok": False, "error": "NO_TILES", "dropped": dropped}); return
    emit({"ok": True, "width": W, "height": H, "tiles": tiles, "dropped": dropped})

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit({"ok": False, "error": "FATAL:" + str(e)[:160]})
