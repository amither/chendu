import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_pack as bp  # noqa: E402

WEEK = {"weeks": [{"week": "1", "days": [
    {"day": "1", "records": [
        {"poem_id": 1172, "total_times": "2", "poem_title": "咏鹅", "author_name": "骆宾王",
         "dynasty": "唐代", "form_title": "诗", "content": "鹅，鹅，鹅，曲项向天歌。\r\n白毛浮绿水，红掌拨清波。"}]},
    {"day": "2", "records": [
        {"poem_id": 1172, "total_times": "1", "poem_title": "咏鹅", "author_name": "骆宾王",
         "dynasty": "唐代", "form_title": "诗", "content": "鹅，鹅，鹅，曲项向天歌。\n白毛浮绿水，红掌拨清波。"}]}]}]}

POEM = {
    "poem_id": 1172, "poem_title": "咏鹅", "author_name": "骆宾王", "dynasty": "唐代", "form_title": "诗",
    "audio_url": "https://cdn.example/audio/xsc/poems/content/a_1172.mp3",
    "content_detail": json.dumps([{"z": [{"c": "鹅", "p": "é"}, {"c": "，", "p": ""}]}]),
    "detail_list": [
        {"type": 2, "info_json": json.dumps(["鹅，弯曲着脖子向天高歌。"]), "audio_url": None},
        {"type": 3, "info_json": json.dumps([{"list": [{"title": "曲项", "content": "弯曲的脖颈"}]}]), "audio_url": None},
    ],
}

PROSE = {"id": 104688, "title": "Apple Apple I Love You", "title_translate": "苹果苹果我爱你",
         "sentence_list": [{"sentence_content": "Apple round, apple red,\n", "translate": "苹果圆，苹果红，",
                            "audio": "https://cdn.example/situational/prose/s_1.mp3"}]}

EN_WEEK = {"weeks": [{"week": "1", "days": [
    {"day": "1", "records": [{"situational_id": 104688, "total_times": "2"}]}]}]}


class ConvertTest(unittest.TestCase):
    def test_audio_path(self):
        self.assertEqual(bp.audio_path("https://cdn.example/audio/x/a.mp3"), "audio/audio/x/a.mp3")

    def test_split_lines(self):
        self.assertEqual(bp.split_lines("a\r\n\n b \n"), ["a", "b"])

    def test_cn_plan(self):
        plan = bp.build_plan("cn", 7, [WEEK], "cn")
        self.assertEqual(plan["id"], "cn-7")
        self.assertEqual(plan["title"], "一年级上")
        self.assertEqual(plan["order"], 0)
        self.assertEqual(plan["weeks"][0]["week"], 1)
        self.assertEqual(plan["weeks"][0]["days"][1], {"day": 2, "items": [{"pieceId": "cn-1172", "times": 1}]})

    def test_times_clamped_to_1_2(self):
        import copy
        week = copy.deepcopy(WEEK)
        rec = week["weeks"][0]["days"][0]["records"][0]
        rec["total_times"] = "8"
        week["weeks"][0]["days"][1]["records"][0]["total_times"] = "0"
        plan = bp.build_plan("cn", 7, [week], "cn")
        self.assertEqual(plan["weeks"][0]["days"][0]["items"][0]["times"], 2)
        self.assertEqual(plan["weeks"][0]["days"][1]["items"][0]["times"], 1)

    def test_text_plan_uses_cnt_prefix(self):
        plan = bp.build_plan("cn", 8, [WEEK], "cnt")
        self.assertEqual(plan["weeks"][0]["days"][0]["items"][0]["pieceId"], "cnt-1172")

    def test_en_plan(self):
        plan = bp.build_plan("en", 1, [EN_WEEK], "en")
        self.assertEqual(plan["id"], "en-1")
        self.assertEqual(plan["subject"], "en")
        self.assertEqual(plan["weeks"][0]["days"][0]["items"], [{"pieceId": "en-104688", "times": 2}])

    def test_cn_piece_full(self):
        p = bp.cn_piece_full(POEM)
        self.assertEqual(p["id"], "cn-1172")
        self.assertEqual(p["subject"], "cn")
        self.assertEqual(p["lines"], [{"chars": [{"c": "鹅", "p": "é"}, {"c": "，", "p": ""}]}])
        self.assertEqual(p["audio"], "audio/audio/xsc/poems/content/a_1172.mp3")
        self.assertEqual(p["translation"], ["鹅，弯曲着脖子向天高歌。"])
        self.assertEqual(p["notes"], [{"title": "曲项", "content": "弯曲的脖颈"}])

    def test_cn_piece_flat_notes(self):
        poem = dict(POEM, detail_list=[
            {"type": 3, "info_json": json.dumps([{"title": "曲项", "content": "弯曲的脖颈"}]), "audio_url": None}])
        self.assertEqual(bp.cn_piece_full(poem)["notes"], [{"title": "曲项", "content": "弯曲的脖颈"}])

    def test_cn_piece_text(self):
        p = bp.cn_piece_text(WEEK["weeks"][0]["days"][0]["records"][0])
        self.assertEqual(p["id"], "cnt-1172")
        self.assertEqual(p["lines"], [{"text": "鹅，鹅，鹅，曲项向天歌。"}, {"text": "白毛浮绿水，红掌拨清波。"}])
        self.assertNotIn("audio", p)

    def test_en_piece(self):
        p = bp.en_piece(PROSE)
        self.assertEqual(p["id"], "en-104688")
        self.assertEqual(p["titleTranslate"], "苹果苹果我爱你")
        self.assertEqual(p["lines"], [{"text": "Apple round, apple red,", "translate": "苹果圆，苹果红，",
                                       "audio": "audio/situational/prose/s_1.mp3"}])


class WritePackTest(unittest.TestCase):
    def test_write_pack(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            audio_root = d / "audio"
            (audio_root / "audio/xsc/poems/content").mkdir(parents=True)
            (audio_root / "audio/xsc/poems/content/a_1172.mp3").write_bytes(b"mp3")
            plan = bp.build_plan("cn", 7, [WEEK], "cn")
            piece = bp.cn_piece_full(POEM)
            out = d / "p.zip"
            bp.write_pack(out, "g1", "一年级", [plan], [piece], audio_root)
            with zipfile.ZipFile(out) as z:
                names = z.namelist()
                self.assertEqual(names[0], "manifest.json")
                self.assertEqual(json.loads(z.read("manifest.json")),
                                 {"id": "g1", "version": 1, "title": "一年级", "plans": ["cn-7"]})
                self.assertIn("plans/cn-7.json", names)
                self.assertIn("pieces/cn-1172.json", names)
                self.assertEqual(z.read("audio/audio/xsc/poems/content/a_1172.mp3"), b"mp3")

    def test_missing_audio_raises(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(FileNotFoundError):
                bp.write_pack(Path(d) / "p.zip", "g1", "x", [bp.build_plan("cn", 7, [WEEK], "cn")],
                              [bp.cn_piece_full(POEM)], Path(d))


@unittest.skipUnless((ROOT / "data/raw/poems").exists(), "需要本地抓取的数据")
class RealDataTest(unittest.TestCase):
    def test_build_real_packs(self):
        with tempfile.TemporaryDirectory() as d:
            packs = bp.build_all(ROOT / "data", Path(d))
            g1, text = packs["g1"], packs["text"]
            with zipfile.ZipFile(g1) as z:
                names = z.namelist()
                self.assertEqual(sum(n.startswith("pieces/cn-") for n in names), 288)
                self.assertEqual(sum(n.startswith("pieces/en-") for n in names), 56)
                g1_ids = {n for n in names if n.startswith("pieces/")}
            with zipfile.ZipFile(text) as z:
                text_ids = {n for n in z.namelist() if n.startswith("pieces/")}
                self.assertFalse(any(n.startswith("audio/") for n in z.namelist()))
            self.assertFalse(g1_ids & text_ids)
            self.assertTrue(all(n.startswith("pieces/cnt-") for n in text_ids))

    def test_build_real_g2_pack(self):
        with tempfile.TemporaryDirectory() as d:
            packs = bp.build_all(ROOT / "data", Path(d))
            if "g2" not in packs:
                self.skipTest("需要二年级完整数据")
            with zipfile.ZipFile(packs["g2"]) as z:
                manifest = json.loads(z.read("manifest.json"))
                names = z.namelist()
            with zipfile.ZipFile(packs["text"]) as z:
                text_plans = json.loads(z.read("manifest.json"))["plans"]
            self.assertEqual(manifest["plans"], ["cn-8", "cn-32"])
            self.assertTrue(all(n.startswith("pieces/cn-") for n in names if n.startswith("pieces/")))
            self.assertTrue(any(n.startswith("audio/") for n in names))
            self.assertNotIn("cn-8", text_plans)
            self.assertNotIn("cn-32", text_plans)

    @unittest.skipUnless((ROOT / "data/raw/en/2").exists(), "需要英语中高级数据")
    def test_build_real_en_pack(self):
        with tempfile.TemporaryDirectory() as d:
            packs = bp.build_all(ROOT / "data", Path(d))
            with zipfile.ZipFile(packs["en"]) as z:
                names = z.namelist()
                manifest = json.loads(z.read("manifest.json"))
                en_ids = {n for n in names if n.startswith("pieces/")}
            with zipfile.ZipFile(packs["g1"]) as z:
                g1_ids = {n for n in z.namelist() if n.startswith("pieces/")}
            self.assertEqual(manifest["plans"], ["en-2", "en-3"])
            self.assertEqual(len(en_ids), 112)
            self.assertTrue(any(n.startswith("audio/") for n in names))
            self.assertFalse(en_ids & g1_ids)


if __name__ == "__main__":
    unittest.main()
