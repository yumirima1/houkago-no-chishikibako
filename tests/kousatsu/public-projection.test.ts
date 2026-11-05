import test from 'node:test';
import assert from 'node:assert/strict';
import {publicText,publicUrl,savedReasoning,assertPublicSafety} from '../../src/lib/kousatsu/public-projection';
test('public text preserves external sources while explicitly redacting local paths and credentials',()=>{
 const s=publicText('出典 https://www.riken.jp/press/ と D:/AI/private password=private-value user@example.org Bearer abcdefghijklmnop');
 assert(s.includes('https://www.riken.jp/press/'));assert(!s.includes('D:/AI'));assert(!s.includes('private-value'));assert(!s.includes('abcdefghijklmnop'));assert(!s.includes('user@example.org'));assertPublicSafety({note:s});
 assert.throws(()=>assertPublicSafety({note:'D:/AI/private'}),/PUBLIC_SAFETY_REJECTED/);
});
test('unsafe and credential-bearing URLs cannot enter public source metadata',()=>{
 assert.equal(publicUrl('http://127.0.0.1/a'),null);assert.equal(publicUrl('https://user:secret@example.org/a'),null);assert.equal(publicUrl('https://example.org/a?token=private&edition=2'),'https://example.org/a?edition=2');
});
test('saved reasoning retains uncertainty and counterarguments and excludes source dumps and runtime logs',()=>{
 const original='# 題\n## 出典が述べていること\nRAW_SOURCE_BODY\n## 分析・考察\n仮説であり効果は未確認。\n## 検証を待つ仮説\n別の説明も成立する。\n## 不明点・限界\n反証が残る。\n## 実行記録\nPRIVATE_DIAGNOSTIC';
 const actual=savedReasoning(original);assert(actual.includes('効果は未確認'));assert(actual.includes('別の説明'));assert(actual.includes('反証が残る'));assert(!actual.includes('RAW_SOURCE_BODY'));assert(!actual.includes('PRIVATE_DIAGNOSTIC'));assert(original.includes('PRIVATE_DIAGNOSTIC'));
});
