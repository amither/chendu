#!/usr/bin/env python3
"""Convert data/raw into importable content packs.

Usage: python3 scripts/build_pack.py   → dist-packs/chendu-g1.zip, dist-packs/chendu-text.zip
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CN_ORDER = [7, 31, 8, 32, 9, 33, 10, 34, 11, 35, 12, 36]
CN_TITLES = {7: "一年级上", 31: "一年级下", 8: "二年级上", 32: "二年级下", 9: "三年级上", 33: "三年级下",
             10: "四年级上", 34: "四年级下", 11: "五年级上", 35: "五年级下", 12: "六年级上", 36: "六年级下"}
EN_TITLES = {1: "英语初级（1-2年级）"}
G1_CN = [7, 31]
G1_EN = [1]
TEXT_CN = [8, 32, 9, 33, 10, 34, 11, 35, 12, 36]


def audio_path(url):
    return "audio/" + url.split("://", 1)[1].split("/", 1)[1]


def split_lines(text):
    return [line.strip() for line in text.replace("\r\n", "\n").split("\n") if line.strip()]


def build_plan(subject, source_id, week_files, prefix):
    """prefix: 'cn' / 'cnt' / 'en' — piece id prefix used in items."""
    key = "poem_id" if subject == "cn" else "situational_id"
    plan_id = f"{prefix}-{source_id}"

    def clamp(r, week, day):
        raw = int(r["total_times"])
        times = max(1, min(2, raw))
        if times != raw:
            print(f"warning: {plan_id} week {week} day {day}: total_times {raw} clamped to {times}", file=sys.stderr)
        return times

    weeks = []
    for wf in week_files:
        for w in wf["weeks"]:
            weeks.append({"week": int(w["week"]), "days": [
                {"day": int(d["day"]),
                 "items": [{"pieceId": f"{prefix}-{r[key]}", "times": clamp(r, w["week"], d["day"])} for r in d["records"]]}
                for d in w["days"]]})
    weeks.sort(key=lambda w: w["week"])
    if subject == "cn":
        return {"id": f"cn-{source_id}", "subject": "cn", "title": CN_TITLES[source_id],
                "order": CN_ORDER.index(source_id), "weeks": weeks}
    return {"id": f"en-{source_id}", "subject": "en", "title": EN_TITLES[source_id], "order": source_id, "weeks": weeks}


def _info(detail_list, type_):
    for item in detail_list or []:
        if item.get("type") == type_ and item.get("info_json"):
            return json.loads(item["info_json"])
    return None


def cn_piece_full(d):
    piece = {
        "id": f"cn-{d['poem_id']}", "subject": "cn", "title": d["poem_title"],
        "author": d.get("author_name"), "dynasty": d.get("dynasty"), "form": d.get("form_title"),
        "lines": [{"chars": [{"c": z["c"], "p": z.get("p") or ""} for z in row["z"]]}
                  for row in json.loads(d["content_detail"])],
        "audio": audio_path(d["audio_url"]),
    }
    translation = _info(d.get("detail_list"), 2)
    if translation:
        piece["translation"] = translation
    notes = _info(d.get("detail_list"), 3)
    if notes:
        piece["notes"] = [{"title": n["title"], "content": n["content"]} for n in notes[0]["list"]]
    return piece


def cn_piece_text(r):
    return {"id": f"cnt-{r['poem_id']}", "subject": "cn", "title": r["poem_title"],
            "author": r.get("author_name"), "dynasty": r.get("dynasty"), "form": r.get("form_title"),
            "lines": [{"text": line} for line in split_lines(r["content"])]}


def en_piece(d):
    return {"id": f"en-{d['id']}", "subject": "en", "title": d["title"],
            "titleTranslate": d.get("title_translate"),
            "lines": [{"text": s["sentence_content"].strip(), "translate": (s.get("translate") or "").strip(),
                       "audio": audio_path(s["audio"])} for s in d["sentence_list"]]}


def piece_audio(piece):
    paths = [piece["audio"]] if piece.get("audio") else []
    return paths + [line["audio"] for line in piece["lines"] if line.get("audio")]


def write_pack(out, pack_id, title, plans, pieces, audio_root):
    audio = sorted({p for piece in pieces for p in piece_audio(piece)})
    for path in audio:
        if not (audio_root / path.removeprefix("audio/")).exists():
            raise FileNotFoundError(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, ensure_ascii=False)  # noqa: E731
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", dump({"id": pack_id, "version": 1, "title": title,
                                          "plans": [p["id"] for p in plans]}))
        for p in plans:
            z.writestr(f"plans/{p['id']}.json", dump(p))
        for p in pieces:
            z.writestr(f"pieces/{p['id']}.json", dump(p))
        for path in audio:
            z.write(audio_root / path.removeprefix("audio/"), path, compress_type=zipfile.ZIP_STORED)
    return out


def _weeks(raw, subject, source_id):
    return [json.loads(f.read_text()) for f in sorted((raw / subject / str(source_id)).glob("week*.json"))]


def _records(week_files):
    for wf in week_files:
        for w in wf["weeks"]:
            for d in w["days"]:
                yield from d["records"]


def build_all(data_dir, out_dir):
    raw = data_dir / "raw"
    plans, pieces = [], {}
    for g in G1_CN:
        weeks = _weeks(raw, "cn", g)
        plans.append(build_plan("cn", g, weeks, "cn"))
        for r in _records(weeks):
            pid = r["poem_id"]
            if f"cn-{pid}" not in pieces:
                pieces[f"cn-{pid}"] = cn_piece_full(json.loads((raw / "poems" / f"{pid}.json").read_text()))
    for b in G1_EN:
        weeks = _weeks(raw, "en", b)
        plans.append(build_plan("en", b, weeks, "en"))
        for r in _records(weeks):
            sid = r["situational_id"]
            if f"en-{sid}" not in pieces:
                pieces[f"en-{sid}"] = en_piece(json.loads((raw / "prose" / f"{sid}.json").read_text()))
    g1 = write_pack(out_dir / "chendu-g1.zip", "g1", "一年级（语文上下册 + 英语初级）", plans,
                    list(pieces.values()), data_dir / "audio")

    plans, pieces = [], {}
    for g in TEXT_CN:
        weeks = _weeks(raw, "cn", g)
        plans.append(build_plan("cn", g, weeks, "cnt"))
        for r in _records(weeks):
            pieces.setdefault(f"cnt-{r['poem_id']}", cn_piece_text(r))
    text = write_pack(out_dir / "chendu-text.zip", "text", "二到六年级语文（原文）", plans,
                      list(pieces.values()), data_dir / "audio")
    return g1, text


if __name__ == "__main__":
    for p in build_all(ROOT / "data", ROOT / "dist-packs"):
        print(p, f"{p.stat().st_size / 1e6:.1f} MB", file=sys.stderr)
