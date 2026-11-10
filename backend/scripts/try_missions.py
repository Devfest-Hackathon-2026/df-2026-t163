"""ターミナルで 1 駅分のミッション生成を試す。

  python -m scripts.try_missions 高槻 --time 60
  python -m scripts.try_missions 高槻 --places-only   # Places の取得だけ確認
"""
import argparse
import json

from app import missions, places
from app.schemas import MissionsRequest

p = argparse.ArgumentParser()
p.add_argument("station")
p.add_argument("--time", type=int, default=60)
p.add_argument("--places-only", action="store_true")
a = p.parse_args()

if a.places_only:
    origin, spots = places.nearby_spots(a.station, a.time)
    print(f"駅の位置: {origin}  半径: {places.radius_for(a.time)}m  候補: {len(spots)}件")
    for s in spots:
        print(f"  [{s.category:7}] 徒歩{s.walk_minutes:2}分  {s.name}  ({s.primary_type}, ★{s.rating} / {s.rating_count}件)")
else:
    res = missions.generate(MissionsRequest(stationName=a.station, timeMinutes=a.time))
    print(json.dumps(res.model_dump(), ensure_ascii=False, indent=2))
