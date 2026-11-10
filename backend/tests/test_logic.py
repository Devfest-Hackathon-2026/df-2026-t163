"""外部 API を呼ばずに、スポットの整形とミッション組み立てを確認する。

  cd backend && python -m unittest discover -s tests
"""
import base64
import unittest
from unittest import mock

from app import config, gemini, missions, places, quota, rail, readings, stamp_art
from app.schemas import (
    GeminiMission, GeminiMissionPlan, LineColor, MissionsRequest, ReadingsRequest, StampArtRequest, StationReading,
)

ORIGIN = (34.8516, 135.6178)  # 高槻駅あたり


def raw(pid, name, dlat, ptype="cafe", types=None, reviews=100, status="OPERATIONAL"):
    return {
        "id": pid,
        "displayName": {"text": name},
        "location": {"latitude": ORIGIN[0] + dlat, "longitude": ORIGIN[1]},
        "primaryType": ptype,
        "types": types or [ptype],
        "userRatingCount": reviews,
        "rating": 4.1,
        "businessStatus": status,
    }


SAMPLE = [
    raw("P1", "高槻ベーカリー", 0.001, "bakery"),
    raw("P2", "野見神社", 0.004, "place_of_worship"),
    raw("P3", "城跡公園", 0.006, "park"),
    raw("P4", "珈琲館", 0.0005, "cafe"),
    raw("P5", "しろあと歴史館", 0.007, "museum"),
    raw("P6", "ラーメン一番", 0.002, "ramen_restaurant", ["ramen_restaurant", "restaurant"]),
    raw("P7", "和菓子 たかつき", 0.003, "confectionery"),
    raw("P8", "本の森書店", 0.0025, "book_store"),
    raw("P9", "センター街商店街", 0.0015, "shopping_mall"),
    raw("P10", "JR高槻駅", 0.0, "train_station", ["train_station"]),
    raw("P11", "閉店カフェ", 0.001, "cafe", status="CLOSED_PERMANENTLY"),
    raw("P12", "遠すぎ公園", 0.05, "park"),
]


class RailTest(unittest.TestCase):
    def _response(self, payload):
        res = mock.Mock()
        res.json.return_value = {"response": payload}
        return res

    def test_stations_keep_order_and_map_coordinates(self):
        rail.stations.cache_clear()
        raw = [
            {"name": "A", "line": "阪急X線", "prefecture": "大阪府", "x": 135.1, "y": 34.1, "prev": None, "next": "B"},
            {"name": "B", "line": "阪急X線", "prefecture": "大阪府", "x": 135.2, "y": 34.2, "prev": "A", "next": None},
        ]
        with mock.patch("app.rail.requests.get", return_value=self._response({"station": raw})):
            out = rail.stations("阪急X線")
        self.assertEqual([s["name"] for s in out], ["A", "B"])
        self.assertEqual((out[0]["lat"], out[0]["lng"]), (34.1, 135.1))

    def test_unknown_line_is_not_found(self):
        rail.stations.cache_clear()
        with mock.patch("app.rail.requests.get", return_value=self._response({"error": "Line not found."})):
            with self.assertRaises(rail.RailNotFound):
                rail.stations("存在しない線")

    def test_missions_use_given_station_coordinates(self):
        req = MissionsRequest(stationName="高槻市", lineName="阪急京都本線", lat=34.85, lng=135.62)
        with mock.patch("app.missions.places.nearby_spots", return_value=((0, 0), [])) as spots:
            with self.assertRaises(places.PlacesError):
                missions.generate(req)
        spots.assert_called_once_with("高槻市", 60, (34.85, 135.62))


class TextQuotaTest(unittest.TestCase):
    def test_limit_blocks_the_model_call(self):
        with mock.patch.object(gemini, "_text_quota", quota.DailyQuota(lambda: 0)), mock.patch.object(gemini, "_client") as client:
            with self.assertRaises(gemini.GeminiError):
                gemini.generate_json(["x"], GeminiMissionPlan, system="s")
        client.assert_not_called()

    def test_missions_fall_back_to_templates_at_the_limit(self):
        spots = [places.parse_place(p, ORIGIN) for p in SAMPLE[:9]]
        with mock.patch.object(places, "nearby_spots", return_value=(ORIGIN, spots)), \
             mock.patch.object(gemini, "_text_quota", quota.DailyQuota(lambda: 0)):
            res = missions.generate(MissionsRequest(stationName="高槻"))
        self.assertEqual(len(res.missions), 8)
        self.assertTrue(res.note)

    def test_counter_resets_on_a_new_day(self):
        q = quota.DailyQuota(lambda: 1)
        with mock.patch("app.quota.date") as day:
            day.today.return_value = "d1"
            self.assertTrue(q.take())
            self.assertFalse(q.take())
            day.today.return_value = "d2"
            self.assertTrue(q.take())


class StampArtTest(unittest.TestCase):
    REQ = StampArtRequest(stationName="茨木", lat=34.8, lng=135.5, landmark="神社", category="shrine")
    NEARBY = [{"name": "茨木", "line": "JR京都線", "prefecture": "大阪府", "lat": 34.8161, "lng": 135.5625}]

    def setUp(self):
        stamp_art._quota = quota.DailyQuota(lambda: config.STAMP_DAILY_LIMIT)
        patches = [
            mock.patch.object(config, "STAMP_BUCKET", "bucket"),
            mock.patch.object(stamp_art, "_style_refs", return_value=()),
            mock.patch.object(stamp_art, "_blob"),
            mock.patch.object(stamp_art.gemini, "generate_image", return_value=(b"new", "image/png")),
            mock.patch.object(stamp_art.rail, "nearby", return_value=self.NEARBY),
        ]
        _, _, self.blob, self.draw, self.nearby = [p.start() for p in patches]
        for p in patches:
            self.addCleanup(p.stop)

    def test_unknown_station_is_rejected_before_generating(self):
        self.nearby.return_value = [{**self.NEARBY[0], "name": "別の駅"}]
        with self.assertRaises(rail.RailNotFound):
            stamp_art.generate(self.REQ)
        self.draw.assert_not_called()
        self.blob.assert_not_called()

    def test_storage_key_comes_from_station_data(self):
        self.blob.return_value.exists.return_value = False
        stamp_art.generate(self.REQ)
        stamp_art.generate(StampArtRequest(stationName="茨木", lat=34.81, lng=135.56))
        self.assertEqual({c.args[0] for c in self.blob.call_args_list}, {"茨木@34.816,135.562"})

    def test_shared_stamp_is_reused_without_generating(self):
        self.blob.return_value.exists.return_value = True
        self.blob.return_value.download_as_bytes.return_value = b"old"
        res = stamp_art.generate(self.REQ)
        self.assertEqual(base64.b64decode(res.imageBase64), b"old")
        self.draw.assert_not_called()

    def test_first_generation_is_saved_only_if_absent(self):
        self.blob.return_value.exists.return_value = False
        res = stamp_art.generate(self.REQ)
        self.assertEqual(base64.b64decode(res.imageBase64), b"new")
        self.blob.return_value.upload_from_string.assert_called_once_with(b"new", content_type="image/png", if_generation_match=0)

    def test_storage_failure_still_returns_a_stamp(self):
        self.blob.return_value.exists.side_effect = OSError("down")
        self.blob.return_value.upload_from_string.side_effect = OSError("down")
        self.assertEqual(base64.b64decode(stamp_art.generate(self.REQ).imageBase64), b"new")

    def test_daily_limit_blocks_generation_but_not_shared_stamps(self):
        self.blob.return_value.exists.return_value = False
        with mock.patch.object(config, "STAMP_DAILY_LIMIT", 1):
            stamp_art.generate(self.REQ)
            with self.assertRaises(stamp_art.DailyLimitExceeded):
                stamp_art.generate(self.REQ)
            self.blob.return_value.exists.return_value = True
            self.blob.return_value.download_as_bytes.return_value = b"old"
            self.assertEqual(base64.b64decode(stamp_art.generate(self.REQ).imageBase64), b"old")


class ReadingsTest(unittest.TestCase):
    def test_drops_unknown_names_and_invalid_colors(self):
        plan = readings._Details(
            readings=[StationReading(name="A駅", kana="えー", romaji="A"), StationReading(name="捏造", kana="ね", romaji="N")],
            lineColors=[LineColor(line="X線", color="#123abc"), LineColor(line="Y線", color="red"), LineColor(line="捏造線", color="#000000")],
        )
        with mock.patch("app.readings.gemini.generate_json", return_value=plan):
            res = readings.generate(ReadingsRequest(names=["A駅"], lines=["X線", "Y線"]))
        self.assertEqual([r.name for r in res.readings], ["A駅"])
        self.assertEqual([c.line for c in res.lineColors], ["X線"])


class PlacesTest(unittest.TestCase):
    def test_radius(self):
        self.assertEqual(places.radius_for(30), 320)
        self.assertEqual(places.radius_for(60), 640)
        self.assertEqual(places.radius_for(120), 960)

    def test_station_query(self):
        self.assertEqual(places.station_query("高槻"), "JR高槻駅")
        self.assertEqual(places.station_query("JR総持寺"), "JR総持寺駅")

    def test_categories(self):
        self.assertEqual(places.guess_category("野見神社", "place_of_worship", []), "shrine")
        self.assertEqual(places.guess_category("和菓子 たかつき", "confectionery", []), "sweets")
        self.assertEqual(places.guess_category("ラーメン一番", "ramen_restaurant", []), "food")
        self.assertEqual(places.guess_category("センター街商店街", "shopping_mall", []), "shop")

    def test_merge_filters_station_closed_and_far(self):
        spots = places.merge_spots([SAMPLE, SAMPLE[:3]], ORIGIN, radius_m=960)
        ids = {s.place_id for s in spots}
        self.assertEqual(len(ids), len(spots), "重複が残っている")
        self.assertNotIn("P10", ids)  # 駅
        self.assertNotIn("P11", ids)  # 閉店
        self.assertNotIn("P12", ids)  # 範囲外
        self.assertEqual(len(spots), 9)
        self.assertTrue(all(s.walk_minutes >= 0 for s in spots))


class AssembleTest(unittest.TestCase):
    def setUp(self):
        self.spots = places.merge_spots([SAMPLE], ORIGIN, radius_m=960)

    def test_rejects_unknown_and_duplicate_refs_and_fills_from_places(self):
        plan = GeminiMissionPlan(
            missions=[
                GeminiMission(ref="p1", title="A", description="d", category="cafe", photoHint="撮ってね"),
                GeminiMission(ref="p1", title="dup", description="d", category="cafe", photoHint=""),
                GeminiMission(ref="p999", title="幻の店", description="d", category="food", photoHint=""),
            ],
            stampRef="p999",
        )
        out, stamp = missions.assemble(plan, self.spots)
        self.assertEqual(len(out), 8)
        names = {s.name for s in self.spots}
        self.assertTrue(all(m.spotName in names for m in out), "実在しない spotName が混入")
        self.assertEqual(len({m.placeId for m in out}), 8)
        self.assertNotIn("幻の店", [m.title for m in out])
        self.assertEqual(out[0].spotName, self.spots[0].name)  # 店名は Places 側の値
        self.assertTrue(out[0].mapsUrl.startswith("https://www.google.com/maps/"))
        self.assertIsNotNone(stamp)
        self.assertEqual(stamp.category, "shrine")  # 優先順位で神社が選ばれる

    def test_generate_falls_back_when_gemini_fails(self):
        req = MissionsRequest(stationName="高槻")
        with mock.patch.object(places, "nearby_spots", return_value=(ORIGIN, self.spots)), \
             mock.patch.object(gemini, "generate_json", side_effect=gemini.GeminiError("boom")):
            res = missions.generate(req)
        self.assertEqual(len(res.missions), 8)
        self.assertIn("テンプレート", res.note)

    def test_generate_uses_gemini_plan(self):
        plan = GeminiMissionPlan(
            missions=[GeminiMission(ref=f"p{i}", title=f"ミッション{i}", description="説明", category="other",
                                    photoHint="") for i in range(1, 9)],
            stampRef="p2",
        )
        with mock.patch.object(places, "nearby_spots", return_value=(ORIGIN, self.spots)), \
             mock.patch.object(gemini, "generate_json", return_value=plan) as g:
            res = missions.generate(MissionsRequest(stationName="高槻", timeMinutes=30))
        self.assertEqual([m.title for m in res.missions], [f"ミッション{i}" for i in range(1, 9)])
        self.assertEqual(res.stamp.label, self.spots[1].name)
        prompt = g.call_args.args[0][0]
        self.assertIn(self.spots[0].name, prompt)

    def test_response_shape_matches_contract(self):
        out, stamp = missions.assemble(None, self.spots)
        keys = set(out[0].model_dump())
        self.assertEqual(keys, {"id", "title", "description", "spotName", "category", "walkMinutes",
                                "placeId", "mapsUrl", "photoHint"})


if __name__ == "__main__":
    unittest.main()
