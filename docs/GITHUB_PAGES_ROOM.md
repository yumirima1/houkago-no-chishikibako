# GitHub Pages: 観察者の部屋

公開URL: https://yumirima1.github.io/houkago-no-chishikibako/

公開ブランチは `fix/github-pages-room`。既存の `main`、`chore/rename-kousatsu`、実験ブランチの履歴は変更しない。このブランチへのpushを `.github/workflows/pages.yml` がビルドし、GitHub Actions方式のPagesへデプロイする。別ブランチの変更は、この公開ブランチへレビューして取り込むまで公開されない。Vercelのデプロイ処理は追加しない。

## 構成

- 既存 `/observer-room` の `ObserverStudyRoot` / `ObserverStudyScene` / `NightStudy` / `NightCity` を使用。カメラ、家具、照明、背景は既存のまま。
- `npm run build:pages` は `tmp/pages-build-*` という新しい作業用フォルダにフロントエンドのみを選択してコピーする。公開トップと `/observer-room/` は部屋のみを表示し、ローカル専用端末を開かない。
- 一時プロジェクトで `output: 'export'`、`basePath: '/houkago-no-chishikibako'`、`trailingSlash: true` を設定。生成された `out` のみをアップロードする。
- GLBは `publicAsset()` でbasePathを付加。フォントCSSとpreloadのパスも作業用コピーで同じprefixに揃える。元のローカル用layout/CSSは変更しない。
- 公開対象アセットは `public/assets/observer-room` と `public/fonts/geist` およびfavicon。GLBの相対テクスチャ、CC0ライセンスも含む。
- API Route、SQLite、Dドライブのデータ、ログ、認証情報は静的成果物に含めない。既存API・バックエンド実装はリポジトリ内に保持する。通常の `next.config.ts` とローカルのトップページは保持する。
- `deployment.json` に実際にビルドしたコミットを記録する。

## 検証

```powershell
npm ci
npm run build:pages
npm run verify:pages
# Windowsの既存Edgeを使う場合
$env:PAGES_BROWSER_CHANNEL='msedge'
npm run test:pages
# 公開ページを確認する場合
$env:PAGES_TEST_URL='https://yumirima1.github.io/houkago-no-chishikibako/'
npm run test:pages
```

ActionsではChromiumをインストールしてローカル静的成果物を描画検証してからデプロイし、公開URLも別ジョブで描画する。公開ページのコンソールエラー、HTTPエラー、WebGL context lost、GLBのbasePathを検査する。`public-room-browser` artifactに実際のスクリーンショットと実行情報を保存する。GPU/OSによる描画差は残るため、全機種を保証する検証ではない。

`npm run verify:pages -- --url=https://yumirima1.github.io/houkago-no-chishikibako/` は、同じコミットをローカルでビルドした後に、公開HTML・主要リソース・GLB・テクスチャを取得し、アセットのSHA-256と公開コミットを比較する。

## 停止・復旧

公開の更新を止める場合はGitHub ActionsでこのワークフローをDisableする。正常だったコミットを新しいrevertコミットで復元するか、正常コミットのActionsから再デプロイする。強制pushやブランチ削除は不要。

今回の変更前のPages設定は `build_type: legacy`、`source.branch: experiment/broadcast-room`、`source.path: /`。必要ならSettings → Pagesでその設定へ戻せる。ただし旧ブランチの画面が公開され、最新3Dルームは表示されなくなる。

バックグラウンドの開発・本番設定変更は、Pagesでの表示確認を優先するため中断中。途中の実装と既存データを保持している。
