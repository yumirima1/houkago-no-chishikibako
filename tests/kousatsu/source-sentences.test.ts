import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceSentences} from '../../src/lib/kousatsu/knowledge';

test('a quoted event title keeps the scheduled date and action in one exact source sentence',()=>{
  const sentence='2026年11月15日、図書館は「江戸のおもちゃ絵　知る！つくる！あそぶ！」を開催します。';
  const text=sentence+'参加方法も掲載されています。';
  assert.deepEqual(sourceSentences(text),[sentence,'参加方法も掲載されています。']);
  for(const quote of sourceSentences(text))assert(text.includes(quote));
});

test('nested Japanese quotations and existing English abbreviations retain their surrounding assertion',()=>{
  const japanese='紹介文は「『どこへ？』を読み、考える。」と述べる。';
  assert.deepEqual(sourceSentences(japanese+'次の資料を読む。'),[japanese,'次の資料を読む。']);
  const english='Teams near Bay St. Louis tested engine No. 10001 on Oct. 21, 2026.';
  assert.deepEqual(sourceSentences(english+' The test lasted 500 seconds.'),[english,'The test lasted 500 seconds.']);
});

test('a complete quoted utterance does not absorb the next independent sentence',()=>{
  assert.deepEqual(sourceSentences('「行こう！」次の話題に進む。'),['「行こう！」','次の話題に進む。']);
  assert.deepEqual(sourceSentences('He said “Ready!” Another person agreed.'),['He said “Ready!”','Another person agreed.']);
});
