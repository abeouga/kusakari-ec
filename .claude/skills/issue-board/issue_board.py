"""issue-board の決まった計算を受け持つスクリプト。

  prepare <issueのURL> [--board <ボードのURL>] [--items 5-7]
      config.json を読み書きし、gh で issue を読み、「決めること」を項目に分けて work/issue.json に保存する。
  build [--cards work/cards.json]
      work/elements/ (ArtifactData list の out_dir) と work/issue.json から、区画の位置・id・座標を決め、
      要素ごとのファイルを work/w/ に書き、ArtifactData batch に渡す writes を出力する。

モデルが考えるのは「どのコメントがどの項目の話か」と「8行に収まらないカードの短縮」だけにする。
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
# ArtifactData は .claude の中に保存できないので、作業用のフォルダは一時フォルダに置く
WORK = os.path.join(tempfile.gettempdir(), "issue-board")
CONFIG = os.path.join(HERE, "config.json")

BOARD_RE = re.compile(r"^https://claude\.ai/artifact/[A-Za-z0-9_-]+$")
ISSUE_RE = re.compile(r"^https://github\.com/[^/\s]+/[^/\s]+/issues/\d+$")

# 区画の寸法(SKILL.md の「区画の形」)
# カードは 16px の文字が8行入る高さ: 1行約24 × 8 + 上下の余白 40 = 232。行の間は 24
PAD, LEFT_W, GAP, RIGHT_W, CARD_H, ROW = 24, 600, 64, 660, 232, 256
FIRST_ROW = 69
SEC_W = PAD + LEFT_W + GAP + RIGHT_W + PAD  # 1372
LINE_CHARS, MAX_LINES = 35, 8


def fail(msg):
    print("ERROR: " + msg)
    sys.exit(1)


def p(path):
    return path.replace("\\", "/")


# ---------- prepare ----------

def load_config():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def parse_items_spec(spec, count):
    spec = spec.translate(str.maketrans("０１２３４５６７８９〜～ー－", "0123456789~~--"))
    picked = set()
    for part in re.split(r"[,、と\s]+", spec):
        if not part:
            continue
        m = re.fullmatch(r"(\d+)(?:~|-|から)(\d+)?(?:以降|から最後まで|まで)?", part) or re.fullmatch(r"(\d+)()(?:以降|から最後まで)", part)
        if m:
            a = int(m.group(1))
            b = int(m.group(2)) if m.group(2) else count
            picked.update(range(a, b + 1))
        elif part.isdigit():
            picked.add(int(part))
        else:
            fail(f"項目の番号を読み取れません: {spec!r}(例: 5-7、5,7、5-)")
    over = [n for n in picked if n < 1 or n > count]
    if over:
        fail(f"この issue の「決めること」は {count} 項目です。指定 {sorted(over)} は範囲外です。")
    return sorted(picked)


def find_section(text):
    lines = text.split("\n")
    head = re.compile(r"^\s*#{2,6}\s*【?\s*決めること\s*】?\s*$|^\s*【決めること】\s*$")
    for i, line in enumerate(lines):
        if head.match(line):
            out = []
            for l in lines[i + 1:]:
                if re.match(r"^\s*#{1,6}\s", l) or re.match(r"^\s*【[^】]+】\s*$", l) or l.strip() in ("---", "<details>"):
                    break
                out.append(l)
            return out
    return None


def split_items(section):
    box = re.compile(r"^\s*[-*]\s+\[( |x|X)\]\s+(.*)$")
    has_box = any(box.match(l) for l in section)
    bullet = re.compile(r"^[-*]\s+(.*)$")  # 字下げなしの箇条書き
    items = []
    for l in section:
        m = box.match(l) if has_box else bullet.match(l)
        if m:
            if has_box:
                checked, q = m.group(1) in "xX", m.group(2)
            else:
                checked, q = False, m.group(1)
            q = re.sub(r"^\d+[.．、)]\s*", "", q.strip()).replace("**", "")
            items.append({"question": q, "checked": checked, "has_box": has_box, "lines": []})
        elif items and l.strip():
            items[-1]["lines"].append(l.strip())
    return items


def cmd_prepare(a):
    if not ISSUE_RE.match(a.issue or ""):
        fail("issue の URL がありません。呼び方: /issue-board [WhiteboardのURL] <issueのURL> [書く項目の番号]")
    cfg = load_config()
    note = ""
    if a.board:
        if not BOARD_RE.match(a.board):
            fail("ボードの URL の形が違います(https://claude.ai/artifact/...)")
        if cfg.get("whiteboard_url") != a.board:
            note = "config.json のボードの URL を新しく保存しました" if not cfg.get("whiteboard_url") else "config.json のボードの URL を書き換えました"
            cfg["whiteboard_url"] = a.board
            with open(CONFIG, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
                f.write("\n")
    board = cfg.get("whiteboard_url", "")
    if not BOARD_RE.match(board or ""):
        fail("ボードの URL が保存されていません。一度だけ /issue-board <WhiteboardのURL> <issueのURL> で呼ぶと保存されます。")

    r = subprocess.run(["gh", "issue", "view", a.issue, "--json", "number,title,url,state,body,comments"], capture_output=True)
    if r.returncode != 0:
        fail("gh issue view が失敗しました: " + r.stderr.decode("utf-8", "replace").strip())
    iss = json.loads(r.stdout.decode("utf-8"))
    body = iss["body"].replace("\r\n", "\n")
    main, _, original = body.partition("<details>")
    section = find_section(main)
    if section is None:
        section = find_section(original)
    if section is None:
        fail(f"#{iss['number']} に「決めること」の見出しがありません。")
    items = split_items(section)
    if not items:
        fail(f"#{iss['number']} の「決めること」に項目がありません。")
    for i, it in enumerate(items, 1):
        it["n"] = i
    targets = parse_items_spec(a.items, len(items)) if a.items else [it["n"] for it in items]

    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(WORK)
    title = re.sub(r"^(\[[^\]]+\]\s*)+", "", iss["title"]).strip()
    data = {"board": board, "number": iss["number"], "title": title, "url": iss["url"], "state": iss["state"],
            "items": items, "targets": targets, "filtered": bool(a.items), "config_note": note}
    with open(os.path.join(WORK, "issue.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print(f"BOARD {board}")
    print(f"WORK {p(WORK)}")
    if note:
        print("NOTE " + note)
    print(f"#{iss['number']} {title} ({iss['state']})  決めること {len(items)} 項目 / 書く: {targets if a.items else 'すべて'}")
    for it in items:
        if it["n"] not in targets:
            continue
        st = "決定済み" if it["checked"] else ("未決" if it["has_box"] else "未決(チェック欄なし)")
        print(f"[{it['n']}] {st} | {it['question']}")
        for l in it["lines"]:
            print(f"      {l}")
    cs = iss.get("comments") or []
    print(f"コメント {len(cs)} 件")
    for i, c in enumerate(cs, 1):
        who = (c.get("author") or {}).get("login", "?")
        print(f"--- c{i} {who} {c.get('createdAt', '')[:10]}")
        print(c.get("body", "").strip())


# ---------- build ----------

SIZES = {"small": 14, "body": 16, "large": 28, "title": 48, "huge": 96}


def width_units(s):
    return sum(0.5 if ord(ch) < 128 else 1.0 for ch in s)


def plain(s):
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    return s.replace("**", "").replace("*", "").replace("`", "")


def card_lines(text):
    return sum(max(1, math.ceil(width_units(plain(l)) / LINE_CHARS)) for l in text.split("\n"))


def bbox(e):
    t = e.get("type")
    x, y = e.get("x"), e.get("y")
    if t in ("arrow", "sticker") or x is None or y is None:
        return None
    if t == "text":
        size = SIZES.get(e.get("size", "body"), 16)
        lines = (e.get("text") or "").split("\n")
        if e.get("wrap"):
            w = e["wrap"]
            n = sum(max(1, math.ceil(width_units(l) * size / w)) for l in lines)
        else:
            w = max(width_units(l) for l in lines) * size
            n = len(lines)
        return (x, y, w, n * size * 1.5)
    if t == "table":
        w = sum(c.get("w", 100) for c in (e.get("cols") or {}).values())
        return (x, y, w, len(e.get("rows") or {}) * 40)
    if t == "stroke":
        pts = e.get("points") or [0, 0]
        xs, ys = pts[0::2], pts[1::2]
        return (x + min(xs), y + min(ys), max(xs) - min(xs), max(ys) - min(ys))
    if t == "link":
        return (x, y, e.get("w", 320), e.get("h", 56))
    if t == "container":
        return (x, y - 40, e.get("w", 0), e.get("h", 0) + 40)
    return (x, y, e.get("w", 0), e.get("h", 0))


def overlaps(a, b, m=64):
    return a[0] < b[0] + b[2] + m and b[0] < a[0] + a[2] + m and a[1] < b[1] + b[3] + m and b[1] < a[1] + a[3] + m


def inside(e, c):
    b = bbox(e)
    if not b:
        return False
    cx, cy = b[0] + b[2] / 2, b[1] + b[3] / 2
    return c["x"] <= cx <= c["x"] + c["w"] and c["y"] <= cy <= c["y"] + c["h"]


def find_place(els, h):
    boxes = [b for b in (bbox(e) for e in els.values()) if b]
    need = lambda x, y: (x, y - 40, SEC_W, h + 40)
    free = lambda x, y: not any(overlaps(need(x, y), b) for b in boxes)
    if not boxes:
        return 0, 0
    # ほかの issue の区画があれば、そのいちばん下の区画の下 → 右
    secs = [e for e in els.values() if e.get("type") == "container" and any(
        t.get("type") == "text" and "github.com/" in (t.get("text") or "") and "/issues/" in (t.get("text") or "") and inside(t, e)
        for t in els.values())]
    if secs:
        low = max(secs, key=lambda c: c["y"] + c["h"])
        cand = [(low["x"], low["y"] + low["h"] + 104), (max(c["x"] + c["w"] for c in secs) + 104, low["y"])]
        for x, y in cand:
            if free(x, y):
                return round(x), round(y)
    x0 = min(b[0] for b in boxes); x1 = max(b[0] + b[2] for b in boxes)
    y0 = min(b[1] for b in boxes); y1 = max(b[1] + b[3] for b in boxes)
    best = None
    for y in range(int(y0) // 40 * 40, int(y1) + 120, 40):
        for x in range(int(x0) // 40 * 40, int(x1) + 120, 40):
            d = math.hypot(x, y)
            if (best is None or d < best[0]) and free(x, y):
                best = (d, x, y)
    if best:
        return best[1], best[2]
    return round(x0), round(y1 + 104)  # 下に置く


def card_text(it, cards):
    key = str(it["n"])
    if key in cards.get("text", {}):
        return cards["text"][key]
    out = [f"**{it['question']}**"]
    for l in it["lines"] + cards.get("extra", {}).get(key, []):
        if re.match(r"^(\*\*)?決定\s*[:：]", l) and not l.startswith("**"):
            l = f"**{l}**"
        out.append(l)
    return "\n".join(out)


def left_card(x, y, text, color):
    return {"type": "shape", "kind": "rounded", "x": x, "y": y, "w": LEFT_W, "h": CARD_H, "color": color,
            "size": "body", "textAlign": "left", "text": text}


def right_card(x, y):
    return {"type": "shape", "kind": "rounded", "x": x, "y": y, "w": RIGHT_W, "h": CARD_H, "hollow": True,
            "stroke": "ink", "textAlign": "left", "size": "body", "text": ""}


def cmd_build(a):
    with open(os.path.join(WORK, "issue.json"), encoding="utf-8") as f:
        iss = json.load(f)
    cards = {}
    cpath = a.cards or os.path.join(WORK, "cards.json")
    if os.path.exists(cpath):
        with open(cpath, encoding="utf-8") as f:
            cards = json.load(f)
    edir = os.path.join(WORK, "elements")
    if not os.path.isdir(edir):
        fail(f"{p(edir)} がありません。ArtifactData の list に out_dir: {p(WORK)} を付けて読んでください。")
    els = {}
    for fn in os.listdir(edir):
        if fn.endswith(".json"):
            with open(os.path.join(edir, fn), encoding="utf-8") as f:
                d = json.load(f)
            els[fn[:-5]] = d.get("data", d) if isinstance(d, dict) and "data" in d and "type" not in d else d

    nums = [int(m.group(1)) for k in els for m in [re.fullmatch(r"e(\d+)", k)] if m]
    next_id = [max(nums, default=0) + 1]

    def new_id():
        i = f"e{next_id[0]}"
        next_id[0] += 1
        return i

    items = {it["n"]: it for it in iss["items"]}
    targets = iss["targets"]
    color = lambda it: "white" if it["checked"] else "green"
    url = iss["url"]
    link_re = re.compile(re.escape(url) + r"(?!\d)")
    pending, warn, report = {}, [], []  # pending: id → [op, data]。同じ要素への書き込みは1つにまとめる

    def put(op, eid, data):
        if eid in pending:
            pending[eid][1].update(data)
        else:
            pending[eid] = [op, dict(data)]

    for n in targets:
        lines = card_lines(card_text(items[n], cards))
        if lines > MAX_LINES:
            warn.append(f"[{n}] 約 {lines} 行({MAX_LINES}行を超える)")

    link = next((k for k, e in els.items() if e.get("type") == "text" and link_re.search(e.get("text") or "")), None)
    sec = next((k for k, e in els.items() if link and e.get("type") == "container" and inside(els[link], e)), None)

    if not sec:
        h = FIRST_ROW + len(targets) * ROW
        X, Y = find_place(els, h)
        cid = new_id()
        put("set", cid, {"type": "container", "x": X, "y": Y, "w": SEC_W, "h": h, "text": f"#{iss['number']} {iss['title']}"})
        put("set", new_id(), {"type": "text", "x": X + PAD, "y": Y + PAD, "wrap": SEC_W - 2 * PAD, "size": "body",
                              "text": f"[issue #{iss['number']} を開く]({url})　｜　緑＝未決　白＝決定済み"})
        for k, n in enumerate(targets):
            y = Y + FIRST_ROW + k * ROW
            l, r = new_id(), new_id()
            put("set", l, left_card(X + PAD, y, card_text(items[n], cards), color(items[n])))
            put("set", r, right_card(X + PAD + LEFT_W + GAP, y))
            put("set", new_id(), {"type": "arrow", "from": l, "to": r, "fromSide": "right", "toSide": "left"})
        report.append(f"新しい区画 {cid} を ({X}, {Y}) に置く。{len(targets)} 行")
    else:
        c = els[sec]
        X, Y = c["x"], c["y"]
        title = f"#{iss['number']} {iss['title']}"
        if c.get("text") != title:
            put("update", sec, {"text": title})
        # 区画の中の左のカード(塗りのある shape、区画の左端から 24 付近)を行として読む
        rows = sorted([k for k, e in els.items() if e.get("type") == "shape" and not e.get("hollow") and inside(e, c)
                       and abs(e["x"] - (X + PAD)) < 40], key=lambda k: els[k]["y"])
        right_of = {e["from"]: e["to"] for e in els.values() if e.get("type") == "arrow" and isinstance(e.get("from"), str)}
        norm = lambda q: re.sub(r"[\s。．.]+", "", q)
        q_of = lambda k: plain((els[k].get("text") or "").split("\n")[0]).strip()
        by_q = {norm(q_of(k)): k for k in rows}
        order = list(rows)  # 行の並び(id)。新しい行は ("new", n)
        for n in targets:
            it = items[n]
            k = by_q.get(norm(it["question"]))
            if k:
                e = els[k]
                diff = {}
                t = card_text(it, cards)
                if e.get("text") != t:
                    diff["text"] = t
                if e.get("color") != color(it):
                    diff["color"] = color(it)
                if diff:
                    put("update", k, diff)
                    report.append(f"[{n}] {k} を書き換え({', '.join(diff)})")
            else:
                # issue の順で前にある項目のうち、ボードにある行のすぐ下へ
                pos = 0
                for m in range(n - 1, 0, -1):
                    pk = by_q.get(norm(items[m]["question"])) if m in items else None
                    hit = [i for i, o in enumerate(order) if o == pk or o == ("new", m)]
                    if hit:
                        pos = hit[0] + 1
                        break
                order.insert(pos, ("new", n))
        if not iss["filtered"]:
            qs = {norm(items[n]["question"]) for n in targets}
            for k in rows:
                if norm(q_of(k)) not in qs:
                    report.append(f"issue から消えた項目の行: {k}「{q_of(k)}」(消していない)")
        added = 0
        grown = set()
        for i, o in enumerate(order):
            y = Y + FIRST_ROW + i * ROW
            if isinstance(o, tuple):
                n = o[1]
                l, r = new_id(), new_id()
                put("set", l, left_card(X + PAD, y, card_text(items[n], cards), color(items[n])))
                put("set", r, right_card(X + PAD + LEFT_W + GAP, y))
                put("set", new_id(), {"type": "arrow", "from": l, "to": r, "fromSide": "right", "toSide": "left"})
                report.append(f"[{n}] 行を足す({l})")
                added += 1
            else:
                r = right_of.get(o)
                if round(els[o]["y"]) != round(y):
                    dy = y - els[o]["y"]
                    put("update", o, {"y": y})
                    if r in els:
                        put("update", r, {"y": els[r]["y"] + dy})
                # 前の大きさ(5行)で書いた行は、今の大きさまで伸ばす(右のカードは文字を変えず、高さだけ)
                for k in (o, r):
                    if k in els and els[k].get("h", 0) < CARD_H:
                        put("update", k, {"h": CARD_H})
                        grown.add(k)
        if grown:
            report.append(f"カード {len(grown)} 枚の高さを {CARD_H} に伸ばし、行の間をそろえる")
        new_h = FIRST_ROW + len(order) * ROW
        if new_h > c["h"]:
            delta = new_h - c["h"]
            put("update", sec, {"h": new_h})
            bottom = c["y"] + c["h"]
            below = [k for k, e in els.items() if e.get("type") == "container" and k != sec and e["y"] >= bottom
                     and e["x"] < X + c["w"] and X < e["x"] + e["w"]]
            moved = set()
            for b in below:
                for k, e in els.items():
                    if k not in moved and (k == b or inside(e, els[b])) and e.get("y") is not None and not e.get("locked"):
                        put("update", k, {"y": e["y"] + delta})
                        moved.add(k)
            if below:
                report.append(f"下の区画 {below} を {delta} 下へずらす")

    os.makedirs(os.path.join(WORK, "w"), exist_ok=True)
    writes, versioned = [], []
    for eid, (op, data) in pending.items():
        fp = os.path.join(WORK, "w", f"{eid}.json")
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        writes.append({"op": op, "collection": "elements", "doc_id": eid, "file_path": p(fp)})
        if op != "set":
            versioned.append(eid)

    for r in report:
        print(r)
    for w in warn:
        print("WARN " + w)
    if not writes:
        print("書くものはありません")
        return
    vs = sorted(set(versioned))
    if vs:
        print("if_version が要る(list の結果の version を入れる): " + ", ".join(vs))
    for i in range(0, len(writes), 50):
        chunk = writes[i:i + 50]
        print(f"BATCH {i // 50 + 1} ({len(chunk)} 件)")
        print(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("prepare")
    s.add_argument("issue", nargs="?")
    s.add_argument("--board")
    s.add_argument("--items")
    s.set_defaults(f=cmd_prepare)
    b = sub.add_parser("build")
    b.add_argument("--cards")
    b.set_defaults(f=cmd_build)
    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
