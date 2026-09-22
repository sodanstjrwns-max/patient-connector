-- Patient Connect 영상 라이브러리(플랫폼 공용, 구글 드라이브 폴더에서 동기화) + 병원 자료함 반영 추적
CREATE TABLE IF NOT EXISTS library_materials (
  key TEXT PRIMARY KEY,                          -- drive:GUM-002
  topic_id TEXT NOT NULL,                        -- GUM-002
  kind TEXT NOT NULL,                            -- explain | disease | notice
  category TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  images_json TEXT NOT NULL DEFAULT '[]',        -- [{key: library/…mp4, media_type: video, poster_key, duration_seconds, caption}]
  rev TEXT NOT NULL,                             -- 내용 해시(영상·포스터·문안 포함). 바뀌면 병원 자료함의 미수정 사본을 갱신
  source TEXT,                                   -- 드라이브 폴더 경로
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE materials ADD COLUMN library_rev TEXT;                        -- 마지막으로 반영한 라이브러리 rev
ALTER TABLE materials ADD COLUMN library_locked INTEGER NOT NULL DEFAULT 0; -- 병원이 직접 수정한 라이브러리 사본(자동 갱신 제외)
