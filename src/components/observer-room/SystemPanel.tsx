import type { RoomWeather } from "@/lib/observer-weather";
import type { ObserverDesktopSnapshot } from "./desktopTypes";
import { WeatherStatus } from "./WeatherStatus";
import { date } from "./terminalFormat";
import { staticResearch, genreName } from "./observerTransport";
import styles from "./observer-room.module.css";
export function SystemPanel({ snapshot, weather }: { snapshot: ObserverDesktopSnapshot; weather: RoomWeather }) {
  return <div className={styles.systemContent}>
                <WeatherStatus weather={weather} />
                <p className={styles.eyebrow}>SYSTEM INFORMATION</p><h2>{staticResearch?'公開された考察の状態':'ローカル調査の状態'}</h2><p className={styles.metadata}>{staticResearch?'最終更新':'取得日時'} {date(snapshot.system.readAt)}{staticResearch?'（公開データの記録時点）':''}</p>
                <dl className={styles.systemGrid}>
                  <dt>保存データ</dt><dd>{staticResearch ? `公開された考察 ${snapshot.notes.length} 件` : snapshot.initialized ? "既存のデータベースに接続" : "データベースは未初期化"}</dd>
                  <dt>{staticResearch?'公開方法':'バックグラウンド監視'}</dt><dd>{staticResearch?'ローカルで生成した考察を静的配信':snapshot.system.supervisorActive ? "監視プロセスの応答あり" : "現在の応答を確認できません"}</dd>
                  <dt>調査ジョブ</dt><dd>{snapshot.worker.active ? "処理中" : "処理中のジョブなし"}</dd>
                  <dt>最終ワーカー応答</dt><dd>{date(snapshot.worker.lastSeenAt)}</dd>
                  <dt>巡回の確認間隔</dt><dd>{snapshot.system.pollSeconds} 秒</dd>
                  <dt>1サイクルの上限</dt><dd>{snapshot.system.maxJobsPerCycle} ジョブ</dd>
                  <dt>生成方式 / モデル</dt><dd>{snapshot.system.provider} / {snapshot.system.model}</dd>
                  <dt>端末のアクセス</dt><dd>読み取り専用</dd>
                  {snapshot.operation&&<><dt>実行時刻（日本時間）</dt><dd>{snapshot.operation.operation.runTimes?.join(' / ')}</dd><dt>次回の実行枠</dt><dd>{date(snapshot.operation.nextRunAt)}</dd><dt>直近の実行開始</dt><dd>{date(snapshot.operation.lastRunAt)}</dd><dt>自動運用の終了</dt><dd>{snapshot.operation.operation.continuous?'停止するまで継続':date(snapshot.operation.operation.endsAt)}</dd></>}
                  {snapshot.research&&<><dt>次の調査へ引き継ぐ問い</dt><dd>{snapshot.research.openInquiries} 件</dd><dt>追加資料を待つ問い</dt><dd>{snapshot.research.exhaustedInquiries} 件</dd><dt>ジャンルへの関心</dt><dd>{snapshot.research.interestScores.map(i=>`${genreName(i.genre)} ${i.score}`).join(' / ')}</dd></>}
                </dl>
                <h3>設定された出典</h3><ul className={styles.sources}>{snapshot.sources.map((source) => <li key={source.id}><strong>{source.name}</strong><span>{source.enabled ? "収集対象" : "無効"} · {snapshot.operation?'日次枠で取得':`${source.intervalMinutes} 分間隔`}</span></li>)}</ul>
                {!snapshot.sources.length && <p>出典は設定されていません。</p>}
                <h3>最近の処理</h3><ul className={styles.sources}>{snapshot.jobs.slice(0, 5).map((job) => <li key={job.id}><strong>{job.topic}</strong><span>{job.status}{job.stage ? ` / ${job.stage}` : ""}</span></li>)}</ul>
                {!snapshot.jobs.length && <p>処理履歴はありません。</p>}
    </div>;
}
