const test=require('node:test');
const assert=require('node:assert/strict');
const {siteOf,decide,withRule}=require('./site-access.js');

test('a site is the host name without www, and only for web pages',()=>{
  assert.equal(siteOf('https://www.YouTube.com/watch?v=x'),'youtube.com');
  assert.equal(siteOf('http://video.example.com:8080/a'),'video.example.com');
  assert.equal(siteOf('chrome://extensions'),'');
  assert.equal(siteOf('file:///C:/a.mp4'),'');
  assert.equal(siteOf('not a url'),'');
});
test('rules cover subdomains, the closest rule wins, and undecided sites ask',()=>{
  const rules={'example.com':'allow','ads.example.com':'block','other.org':'block'};
  assert.equal(decide(rules,'example.com'),'allow');
  assert.equal(decide(rules,'video.example.com'),'allow');
  assert.equal(decide(rules,'ads.example.com'),'block');
  assert.equal(decide(rules,'x.ads.example.com'),'block');
  assert.equal(decide(rules,'other.org'),'block');
  assert.equal(decide(rules,'new.net'),'ask');
  assert.equal(decide(rules,''),'ask');
  assert.equal(decide(null,'example.com'),'ask');
  // A rule for a bare top-level domain is never applied.
  assert.equal(decide({com:'allow'},'example.com'),'ask');
  // Inherited object keys are not rules.
  assert.equal(decide({},'constructor'),'ask');
  assert.equal(decide({'m.youtube.com':'allow'},'youtube.com'),'ask');
  assert.equal(decide({'youtube.com':'allow'},'m.youtube.com'),'allow');
});
test('rules are changed without mutating the original and reject bad input',()=>{
  const rules={'a.com':'allow'};
  assert.deepEqual(withRule(rules,'b.com','block'),{'a.com':'allow','b.com':'block'});
  assert.deepEqual(withRule(rules,'a.com','ask'),{});
  assert.deepEqual(rules,{'a.com':'allow'});
  assert.deepEqual(withRule(rules,'b.com','maybe'),rules);
  assert.deepEqual(withRule(rules,'<script>','allow'),rules);
  assert.deepEqual(withRule(rules,'','allow'),rules);
  assert.deepEqual(withRule(undefined,'b.com','allow'),{'b.com':'allow'});
});
