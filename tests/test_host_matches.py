"""host_matches（URL のホスト名によるサイト判定）のテスト。

実行方法：python -m unittest discover -s tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from fetch_news import host_matches  # noqa: E402


class HostMatchesTest(unittest.TestCase):
    def test_本物のURLは当たる(self):
        self.assertTrue(host_matches("https://prtimes.jp/main/html/rd/p/000000123.000090370.html", "prtimes.jp"))
        self.assertTrue(host_matches("https://news.google.com/rss/articles/CBMi...", "news.google.com"))
        self.assertTrue(host_matches("https://news.google.com/rss/search?q=site:prtimes.jp", "news.google.com"))

    def test_サブドメインは当たる(self):
        self.assertTrue(host_matches("https://www.prtimes.jp/x", "prtimes.jp"))

    def test_大文字や末尾のポートがあっても当たる(self):
        self.assertTrue(host_matches("HTTPS://PRTIMES.JP:443/x", "prtimes.jp"))

    def test_URLの途中に名前が含まれるだけなら外れる(self):
        # 部分一致だと当たってしまっていた例
        self.assertFalse(host_matches("https://news.google.com/rss/search?q=site:prtimes.jp", "prtimes.jp"))
        self.assertFalse(host_matches("https://example.com/?u=https://news.google.com/", "news.google.com"))
        self.assertFalse(host_matches("https://example.com/prtimes.jp/page", "prtimes.jp"))

    def test_名前で終わる別ドメインは外れる(self):
        self.assertFalse(host_matches("https://fakeprtimes.jp/x", "prtimes.jp"))
        self.assertFalse(host_matches("https://prtimes.jp.example.com/x", "prtimes.jp"))
        self.assertFalse(host_matches("https://evil-news.google.com.attacker.net/", "news.google.com"))

    def test_空や不正な値は外れる(self):
        self.assertFalse(host_matches("", "prtimes.jp"))
        self.assertFalse(host_matches(None, "prtimes.jp"))
        self.assertFalse(host_matches("prtimes.jp", "prtimes.jp"))  # スキームなしはホスト名として扱わない


if __name__ == "__main__":
    unittest.main()
