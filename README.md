# AIニュース

生成AI・ビジネス活用・政策・研究のAIニュースとプレスリリースを自動で集め、分野別に一覧表示するサイトです。
収集は GitHub Actions、公開は Cloudflare Pages（無料枠）で動き、費用はかかりません。

## 仕組み

- **定期更新**（`.github/workflows/update.yml`）：毎日 8:07（日本時間）に1回、全収集元を取得します。サイト上の表示は「毎朝8時更新」です。
- **AI記事の絞り込み**：`config.json` の `must_include` の語句（AI、生成AI、ChatGPT など）を見出しか概要に含む記事だけを残します。
- **新着の通知**：更新のたびに、直近24時間の新着があれば ntfy に1通送ります。宛先のトピック名は GitHub の Secret `NTFY_TOPIC` に登録します（未設定なら通知しません）。
- **件数の記録**：収集元ごとの取得件数・新着件数を `stats/feed_log.csv` に追記します。

## 公開（Cloudflare Pages）

Cloudflare の「Workers & Pages」→「Pages」→ Git に接続（リポジトリは「Only select repositories」でこのリポジトリだけ許可）。Framework preset は **None**、Build command は空欄、Build output directory は **docs**。作成後、Settings → Builds の Build watch paths の Include に **docs/\*** を入れて Save（記事の更新があったときだけ公開し直すため）。

セキュリティ用のレスポンスヘッダー（CSP など）は `docs/_headers` に書いてあります。CSP でページ内に直接書いたスクリプトを禁止しているため、画面の動きは `docs/app.js` に分けています。

## 設定（`config.json`）

- `site_name` / `site_url`：サイト名と公開URL（通知のタイトル・リンク先に使います）
- `categories`：分野の表示順・名前・英字ラベル・色。`keywords` のキーと揃えます
- `must_include`：AIに関係する記事だけを残すための語句（どれか1つを含めば残す）
- `keywords`：記事をどの分野に振り分けるかの語句（英字だけの語句は単語として一致したときのみ）。どれにも当たらなければ収集元の `default_category` に入ります
- `topics`（任意）：分野ごとの細分類。`{"genai": {"新モデル": ["新モデル", "発表"], ...}}` のように書くと、上から順に判定して1つ付けます
- `exclude_patterns` / `exclude_sources`：取り込まない見出しのパターン・配信元
- `feeds`：収集元の一覧

## ローカルでの確認

```bash
python scripts/fetch_news.py          # 全収集元を取得して docs/data.json を更新
python -m unittest discover -s tests  # テスト
python -m http.server 8768 -d docs    # http://localhost:8768 で表示
```

## 補足

- 記事本文は保存せず、タイトルとリンクのみを表示します。
- 収集の多くは Google ニュースの RSS を経由しています。Google ニュースの RSS は個人の非商用利用に限られているため、広告などで収益化する場合は収集元の見直しが必要です。
- ヘッダー写真：Unsplash（Unsplash License、クレジット表記不要）
