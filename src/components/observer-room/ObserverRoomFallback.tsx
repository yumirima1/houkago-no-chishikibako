"use client";

import Link from "next/link";
import { Component, ReactNode } from "react";
import { ObserverHotspotId, ObserverRoomState } from "./types";

type ObserverRoomFallback2DProps = {
  data: ObserverRoomState;
  activeHotspot: ObserverHotspotId | null;
  onSelectHotspot: (id: ObserverHotspotId) => void;
};

export function ObserverRoomFallback2D({
  data,
  activeHotspot,
  onSelectHotspot,
}: ObserverRoomFallback2DProps) {
  return (
    <div className="fallback-container">
      <header className="fallback-header">
        <Link href="/" className="back-link">
          ← 放送室へ戻る
        </Link>
        <h1>観察者の部屋（2D見取り図）</h1>
        <p className="notice">
          ※3Dレンダリング環境が制限されているかオフラインのため、2D書斎図面で探索できます。
        </p>
      </header>

      <main className="study-map">
        <div className="map-grid">
          {/* 窓辺 */}
          <button
            type="button"
            className={`map-node node-window ${activeHotspot === "window" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("window")}
          >
            <span className="node-icon">🪟</span>
            <strong>木製格子窓</strong>
            <small>自然の景色・環境観測</small>
          </button>

          {/* 壁の掲示板 */}
          <button
            type="button"
            className={`map-node node-pinboard ${activeHotspot === "pinboard" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("pinboard")}
          >
            <span className="node-icon">📌</span>
            <strong>壁の掲示板</strong>
            <small>未解決の問い（{data.growth.unresolvedCount}件）・写真</small>
          </button>

          {/* 本棚 */}
          <button
            type="button"
            className={`map-node node-bookshelf ${activeHotspot === "bookshelf" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("bookshelf")}
          >
            <span className="node-icon">📚</span>
            <strong>書架（知識源）</strong>
            <small>{data.sources.length}件の文献アーカイブ</small>
          </button>

          {/* 研究机・ノート */}
          <button
            type="button"
            className={`map-node node-desk ${activeHotspot === "desk-notes" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("desk-notes")}
          >
            <span className="node-icon">✍️</span>
            <strong>研究机・ノート</strong>
            <small>{data.currentNote.title}</small>
          </button>

          {/* PC・記憶検索 */}
          <button
            type="button"
            className={`map-node node-pc ${activeHotspot === "pc-workstation" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("pc-workstation")}
          >
            <span className="node-icon">💻</span>
            <strong>PC・記憶検索</strong>
            <small>記憶 {data.growth.memoryCount}件 / 自律研究</small>
          </button>

          {/* モニター */}
          <button
            type="button"
            className={`map-node node-monitor ${activeHotspot === "monitor-display" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("monitor-display")}
          >
            <span className="node-icon">🖥️</span>
            <strong>モニター（速報）</strong>
            <small>{data.news.length}件の最新配信フィード</small>
          </button>

          {/* ラジオ */}
          <button
            type="button"
            className={`map-node node-radio ${activeHotspot === "radio-audio" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("radio-audio")}
          >
            <span className="node-icon">📻</span>
            <strong>RADIO受信機</strong>
            <small>{data.radio.currentEpisode}</small>
          </button>

          {/* ベッド */}
          <button
            type="button"
            className={`map-node node-bed ${activeHotspot === "bed-rest" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("bed-rest")}
          >
            <span className="node-icon">🛏️</span>
            <strong>ベッド（休息）</strong>
            <small>思考リセット・精神の充電</small>
          </button>

          {/* 植物 */}
          <button
            type="button"
            className={`map-node node-plant ${activeHotspot === "plant" ? "is-active" : ""}`}
            onClick={() => onSelectHotspot("plant")}
          >
            <span className="node-icon">🌿</span>
            <strong>観葉植物</strong>
            <small>小休止・思索メモ</small>
          </button>
        </div>
      </main>

      <style jsx>{`
        .fallback-container {
          min-height: 100vh;
          background: #181f1b;
          color: #f0ebe1;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .fallback-header {
          max-width: 800px;
          margin: 0 auto 2.5rem;
        }
        .back-link {
          color: #a4cca8;
          text-decoration: none;
          font-size: 0.88rem;
          display: inline-block;
          margin-bottom: 0.75rem;
        }
        h1 {
          font-size: 1.5rem;
          margin: 0 0 0.5rem 0;
          font-weight: 600;
        }
        .notice {
          font-size: 0.82rem;
          color: #a8a296;
          margin: 0;
        }
        .study-map {
          max-width: 800px;
          margin: 0 auto;
        }
        .map-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.25rem;
        }
        .map-node {
          background: #222b26;
          border: 1px solid rgba(160, 190, 170, 0.2);
          border-radius: 8px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          cursor: pointer;
          color: inherit;
          transition: all 0.2s;
        }
        .map-node:hover {
          background: #2a3530;
          border-color: rgba(160, 190, 170, 0.4);
          transform: translateY(-2px);
        }
        .map-node.is-active {
          border-color: #84cc16;
          background: rgba(132, 204, 22, 0.1);
        }
        .node-icon {
          font-size: 1.8rem;
          margin-bottom: 0.5rem;
        }
        .map-node strong {
          font-size: 1rem;
          margin-bottom: 0.25rem;
          color: #f7f4ec;
        }
        .map-node small {
          font-size: 0.8rem;
          color: #b0aba0;
        }
      `}</style>
    </div>
  );
}

export function ObserverRoomLoading() {
  return (
    <div className="observer-loading-root">
      <div className="loading-card">
        <div className="spinner" />
        <h2>観察者の部屋を準備中</h2>
        <p>生活と研究の空間を構築しています…</p>
      </div>
      <style jsx>{`
        .observer-loading-root {
          width: 100%;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #181e1d;
          color: #e5e0d4;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .loading-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(160, 190, 170, 0.2);
          border-top-color: #84cc16;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1.25rem;
        }
        h2 {
          font-size: 1.15rem;
          font-weight: 500;
          margin: 0 0 0.5rem 0;
          color: #f5eedc;
        }
        p {
          font-size: 0.85rem;
          color: #a8a296;
          margin: 0;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class ObserverRoomErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div>
          {this.props.fallback}
          <div
            style={{
              position: "fixed",
              bottom: "1rem",
              right: "1rem",
              background: "rgba(35, 45, 40, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              color: "#e5e0d4",
              fontSize: "0.82rem",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <span>3Dの描画で問題が発生しました。2D見取り図で探索を継続しています。</span>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              style={{
                background: "#3e5746",
                border: "none",
                color: "#fff",
                padding: "0.3rem 0.6rem",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              再試行
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
