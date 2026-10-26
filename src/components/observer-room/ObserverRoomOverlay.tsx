"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  ObserverHotspotId,
  ObserverRoomState,
} from "./types";

type ObserverRoomOverlayProps = {
  data: ObserverRoomState;
  activeHotspot: ObserverHotspotId | null;
  onCloseHotspot: () => void;
};

/**
 * 観察者の部屋 UIオーバーレイ
 * 【絶対条件順守】
 * - 初期画面では一切のUI（タイトル、ボタン、ステータス、操作案内、パネル）を表示しません。
 * - オブジェクトをクリックした時のみ、右下に控えめで洗練されたカードを小さく表示します。
 */
export function ObserverRoomOverlay({
  data,
  activeHotspot,
  onCloseHotspot,
}: ObserverRoomOverlayProps) {
  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeHotspot) {
        onCloseHotspot();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeHotspot, onCloseHotspot]);

  return (
    <div className="observer-overlay-root">
      {/* 画面左上のごく控えめな戻るリンク（ホバー時のみ現れるミニマルボタン） */}
      <Link
        href="/"
        className="minimal-back-button"
        title="放送室へ戻る"
        aria-label="放送室へ戻る"
      >
        ← 放送室
      </Link>

      {/* =========================================
          オブジェクト選択時のみ表示される控えめなカード
      ========================================== */}
      {activeHotspot && (
        <div
          className="selected-object-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="card-header">
            <div className="header-meta">
              <span className="object-type-badge">
                {activeHotspot === "desk-notes" && "考察ノート"}
                {activeHotspot === "pc-workstation" && "記憶検索・研究管理"}
                {activeHotspot === "monitor-display" && "最新速報フィード"}
                {activeHotspot === "pinboard" && "未解決の問い・相関図"}
                {activeHotspot === "bookshelf" && "文献アーカイブ"}
                {activeHotspot === "radio-audio" && "RADIO 受信機"}
                {activeHotspot === "bed-rest" && "休息空間"}
                {activeHotspot === "window" && "外界観測"}
                {activeHotspot === "plant" && "思索のメモ"}
              </span>
              <h2 className="object-title">
                {activeHotspot === "desk-notes" && data.currentNote.title}
                {activeHotspot === "pc-workstation" && "記憶検索インデックス"}
                {activeHotspot === "monitor-display" && "観測速報・学術ニュース"}
                {activeHotspot === "pinboard" && "未解決の問い（Open Questions）"}
                {activeHotspot === "bookshelf" && "収集文献・研究成果"}
                {activeHotspot === "radio-audio" && data.radio.station}
                {activeHotspot === "bed-rest" && "休息・記憶の定着"}
                {activeHotspot === "window" && "窓辺の情景と大気記録"}
                {activeHotspot === "plant" && "観葉植物と小休止"}
              </h2>
            </div>
            <button
              type="button"
              className="card-close-btn"
              onClick={onCloseHotspot}
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>

          <div className="card-content">
            {/* 1. ノート */}
            {activeHotspot === "desk-notes" && (
              <div className="content-scroll">
                <div className="meta-row">
                  <span>分野: <strong>{data.currentNote.topic}</strong></span>
                  <span>検証: <strong className="status-ok">{data.currentNote.status === "verified" ? "根拠確認済" : "未検証"}</strong></span>
                  <span>抽出根拠: <strong>{data.currentNote.evidenceCount}件</strong></span>
                </div>
                <p className="summary-quote">{data.currentNote.summary}</p>
                <div className="markdown-box">
                  <pre>{data.currentNote.markdown}</pre>
                </div>
                <div className="source-tags">
                  <small>参照文献:</small>
                  {data.currentNote.sources.map((s, i) => (
                    <span key={i} className="source-pill">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 2. PC・記憶検索 */}
            {activeHotspot === "pc-workstation" && (
              <div className="content-scroll">
                <div className="search-bar-sim">
                  <span>🔍 蓄積された記憶断片: <strong>{data.growth.memoryCount}件</strong></span>
                </div>
                <h3 className="section-label">実行中の自律研究パイプライン</h3>
                <div className="item-stack">
                  {data.jobs.map((job) => (
                    <div key={job.id} className="stack-item">
                      <div className="item-line">
                        <strong>{job.title}</strong>
                        <span className={`status-pill ${job.status}`}>{job.status === "running" ? "実行中" : "完了"}</span>
                      </div>
                      <small>{job.stage} · {job.timestamp}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. モニター */}
            {activeHotspot === "monitor-display" && (
              <div className="content-scroll">
                <div className="item-stack">
                  {data.news.map((n) => (
                    <div key={n.id} className="stack-item">
                      <div className="item-line">
                        <strong>{n.title}</strong>
                        <small>{n.time}</small>
                      </div>
                      <span className="sub-tag">{n.source}</span>
                      <p className="item-desc">{n.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. ピンボード（未解決の問い） */}
            {activeHotspot === "pinboard" && (
              <div className="content-scroll">
                <h3 className="section-label">未解決の問い（{data.openQuestions.length}件）</h3>
                <div className="item-stack">
                  {data.openQuestions.map((q) => (
                    <div key={q.id} className="question-box">
                      <span className="q-tag">未解決問い · {q.category}</span>
                      <strong className="q-text">{q.question}</strong>
                      <p className="q-note"><strong>仮説メモ:</strong> {q.hypothesisDraft}</p>
                    </div>
                  ))}
                </div>
                <h3 className="section-label" style={{ marginTop: "1rem" }}>過去の経験・写真</h3>
                <div className="exp-stack">
                  {data.experiences.map((exp) => (
                    <div key={exp.id} className="exp-item">
                      <span className="exp-tag">{exp.tag} ({exp.date})</span>
                      <strong>{exp.title}</strong>
                      <p>{exp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. 本棚 */}
            {activeHotspot === "bookshelf" && (
              <div className="content-scroll">
                <div className="item-stack">
                  {data.sources.map((s) => (
                    <div key={s.id} className="stack-item">
                      <div className="item-line">
                        <strong>{s.name}</strong>
                        <span className="relevance-tag">関連度 {s.relevance}%</span>
                      </div>
                      <small>収録 {s.itemCount}件 · 最終確認: {s.lastChecked}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. ラジオ */}
            {activeHotspot === "radio-audio" && (
              <div className="content-scroll">
                <div className="radio-signal-badge">
                  <span className="radio-dot" />
                  <span>{data.radio.status === "on-air" ? "ON AIR / 受信中" : "STANDBY"}</span>
                </div>
                <h3 className="radio-headline">{data.radio.currentEpisode}</h3>
                <p className="radio-body">{data.radio.description}</p>
                <small className="radio-freq">周波数: {data.radio.frequency} · {data.radio.station}</small>
              </div>
            )}

            {/* 7. ベッド */}
            {activeHotspot === "bed-rest" && (
              <div className="content-scroll">
                <p className="summary-quote">{data.ambient.bedNote}</p>
                <div className="rest-reflection">
                  <strong>思考リセットと記憶の定着:</strong>
                  <p>「深い思考には無防備な休息が必要。睡眠の間に断片が再編され、新たな仮説が芽吹く。」</p>
                </div>
              </div>
            )}

            {/* 8. 窓 */}
            {activeHotspot === "window" && (
              <div className="content-scroll">
                <div className="meta-row">
                  <span>時間: <strong>{data.ambient.timeLabel}</strong></span>
                  <span>天候: <strong>{data.ambient.weather}</strong></span>
                </div>
                <p className="summary-quote">{data.ambient.windowNote}</p>
              </div>
            )}

            {/* 9. 植物 */}
            {activeHotspot === "plant" && (
              <div className="content-scroll">
                <p className="summary-quote">{data.ambient.plantNote}</p>
                <div className="markdown-box">
                  <p>「思考に行き詰まったら、一度筆を置き、緑の葉に触れること。急ぎすぎた推論は、往々にして重要な反証を見落とす。」</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================
          スタイリング
      ========================================== */}
      <style jsx>{`
        .observer-overlay-root {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 10;
          user-select: none;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        /* 控えめな戻るボタン（部屋の鑑賞を邪魔しない最小設計） */
        .minimal-back-button {
          pointer-events: auto;
          position: absolute;
          top: 1.25rem;
          left: 1.25rem;
          background: rgba(20, 24, 22, 0.45);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #c4b59d;
          text-decoration: none;
          font-size: 0.8rem;
          padding: 0.35rem 0.75rem;
          border-radius: 9999px;
          opacity: 0.5;
          transition: opacity 0.25s, color 0.25s, background 0.25s;
        }
        .minimal-back-button:hover {
          opacity: 1;
          color: #ffffff;
          background: rgba(20, 24, 22, 0.85);
        }

        /* 選択時のみ現れるコンパクトな情報カード（画面右下・邪魔にならない配置） */
        .selected-object-card {
          pointer-events: auto;
          position: absolute;
          bottom: 2rem;
          right: 2rem;
          width: 440px;
          max-width: calc(100vw - 3rem);
          max-height: calc(100vh - 6rem);
          background: rgba(22, 28, 25, 0.92);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(160, 190, 175, 0.25);
          border-radius: 10px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideUpFade 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 1rem 1.25rem;
          background: rgba(18, 22, 20, 0.6);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .object-type-badge {
          font-size: 0.68rem;
          color: #86efac;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          display: block;
          margin-bottom: 0.2rem;
        }

        .object-title {
          font-size: 1.05rem;
          margin: 0;
          color: #f7f4ec;
          font-weight: 600;
          line-height: 1.35;
        }

        .card-close-btn {
          background: transparent;
          border: none;
          color: #a8a39a;
          font-size: 1rem;
          cursor: pointer;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .card-close-btn:hover {
          color: #ffffff;
        }

        .card-content {
          padding: 1rem 1.25rem;
          overflow-y: auto;
          font-size: 0.88rem;
          color: #d1cdc4;
          line-height: 1.6;
        }

        .meta-row {
          display: flex;
          gap: 0.85rem;
          font-size: 0.78rem;
          color: #a8a296;
          margin-bottom: 0.85rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 0.5rem;
        }
        .meta-row strong { color: #f1ede4; }
        .status-ok { color: #86efac !important; }

        .summary-quote {
          font-style: italic;
          color: #cbd5e1;
          margin: 0 0 0.85rem 0;
          padding: 0.5rem 0.75rem;
          border-left: 2px solid #86efac;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 0 4px 4px 0;
        }

        .markdown-box {
          background: rgba(14, 18, 16, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 0.85rem;
          border-radius: 6px;
          margin-bottom: 0.85rem;
        }
        .markdown-box pre, .markdown-box p {
          margin: 0;
          white-space: pre-wrap;
          font-family: inherit;
          font-size: 0.82rem;
          color: #e5e0d4;
        }

        .source-tags {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
        }
        .source-pill {
          background: rgba(255, 255, 255, 0.05);
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          color: #cbd5e1;
        }

        .section-label {
          font-size: 0.82rem;
          color: #86efac;
          margin: 0 0 0.5rem 0;
          font-weight: 500;
        }

        .item-stack {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .stack-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 0.65rem 0.85rem;
          border-radius: 6px;
        }
        .item-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .item-line strong { font-size: 0.86rem; color: #f1ede4; }
        .status-pill {
          font-size: 0.7rem;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }
        .status-pill.running { background: rgba(234, 179, 8, 0.2); color: #facc15; }
        .status-pill.completed { background: rgba(132, 204, 22, 0.2); color: #86efac; }
        .item-desc { font-size: 0.8rem; color: #a8a296; margin: 0.25rem 0 0 0; }
        .sub-tag { font-size: 0.72rem; color: #94a3b8; display: block; margin: 0.2rem 0; }

        .search-bar-sim {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          color: #7dd3fc;
          margin-bottom: 0.85rem;
        }
        .search-bar-sim strong { color: #bae6fd; }

        .question-box {
          background: rgba(254, 240, 138, 0.06);
          border: 1px solid rgba(254, 240, 138, 0.2);
          border-radius: 6px;
          padding: 0.75rem;
        }
        .q-tag { font-size: 0.68rem; color: #ca8a04; display: block; margin-bottom: 0.2rem; }
        .q-text { font-size: 0.88rem; color: #fef08a; display: block; margin-bottom: 0.35rem; }
        .q-note { font-size: 0.8rem; color: #e5e0d4; margin: 0; }

        .exp-stack {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .exp-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 0.6rem 0.8rem;
          border-radius: 6px;
        }
        .exp-tag { font-size: 0.7rem; color: #a4cca8; display: block; margin-bottom: 0.15rem; }
        .exp-item strong { font-size: 0.84rem; color: #f1ede4; display: block; margin-bottom: 0.25rem; }
        .exp-item p { font-size: 0.78rem; color: #a8a296; margin: 0; }

        .relevance-tag {
          font-size: 0.7rem;
          background: rgba(132, 204, 22, 0.15);
          color: #86efac;
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
        }

        .radio-signal-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(220, 38, 38, 0.18);
          border: 1px solid rgba(220, 38, 38, 0.35);
          color: #fca5a5;
          padding: 0.2rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.72rem;
          margin-bottom: 0.6rem;
        }
        .radio-dot {
          width: 6px;
          height: 6px;
          background: #ef4444;
          border-radius: 50%;
        }
        .radio-headline { font-size: 1rem; color: #f5eedc; margin: 0 0 0.4rem 0; }
        .radio-body { font-size: 0.84rem; color: #cbd5e1; margin: 0 0 0.6rem 0; }
        .radio-freq { font-size: 0.75rem; color: #a8a296; }

        .rest-reflection {
          background: rgba(40, 55, 45, 0.35);
          border-left: 2px solid #84cc16;
          padding: 0.75rem;
          border-radius: 0 6px 6px 0;
          font-size: 0.82rem;
        }
        .rest-reflection strong { color: #86efac; display: block; margin-bottom: 0.25rem; }
        .rest-reflection p { margin: 0; color: #f5eedc; }

        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
