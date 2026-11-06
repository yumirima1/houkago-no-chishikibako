import test from 'node:test';import assert from 'node:assert/strict';
import {specificResearchPeer} from '../../src/lib/kousatsu/relevance';
test('shared library vocabulary cannot make another institution or a reading contest evidence about Swiss renovation',()=>{
 const a={title:'スイス国立図書館、改修工事のために一時移転：2034年に竣工予定',summary:'スイス国立図書館の庁舎改修工事と一時移転を紹介する。',canonicalUrl:'https://current.ndl.go.jp/car/286401'};
 assert.equal(specificResearchPeer(a,{...a,title:'英国図書館の拡張工事に着工：2032年竣工予定',summary:'英国図書館の改修工事を紹介。',canonicalUrl:'https://current.ndl.go.jp/car/285262'}),false);
 assert.equal(specificResearchPeer(a,{...a,title:'泉佐野市、100冊読破の読書通帳コンテストを開催',summary:'泉佐野市⽴図書館の貸出カード所有者を対象とする図書館の事業。',canonicalUrl:'https://current.ndl.go.jp/car/286601'}),false);
 assert.equal(specificResearchPeer(a,{...a,title:'国立公文書館、「新館開館に向けた国立公文書館ビジョン」中期成果報告を公表',summary:'2026年10月29日付けで、国立公文書館が新館開館に向けた取組と成果を報告した。',canonicalUrl:'https://current.ndl.go.jp/car/286399'}),false);
 assert.equal(specificResearchPeer(a,{...a,title:'スイス国立図書館、庁舎の改修工事と一時移転を発表',canonicalUrl:'https://example.org/swiss-renovation'}),true);
});

test('an archive title cannot be overridden by Swiss library words in a background summary',()=>{
 const a={title:'スイス国立図書館、改修工事のため一時移転',summary:'スイス国立図書館の庁舎改修工事と一時移転を紹介する。',canonicalUrl:'https://example.org/swiss'};
 const b={title:'国立公文書館、新館開館に向けたビジョンの中期成果報告',summary:a.summary,canonicalUrl:'https://example.org/archive'};
 assert.equal(specificResearchPeer(a,b),false);
});
