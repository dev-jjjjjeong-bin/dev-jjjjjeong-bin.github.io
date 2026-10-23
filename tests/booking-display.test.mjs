import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupProductSummary, productSummary, priceNode, contactNode, scheduleNode, requestNode } from '../js/booking-display.js';

// Tiny text-only DOM: rendering checks never connect to Firebase or send notifications.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
}
const text = element => element.textContent + element.children.map(text).join(' ');
const product = { trainer: '담당 원장', title: '도수 재활 스트레칭', price: 70000, duration: 50 };

test('예약 표시: 저장된 금액·연락처를 유지하며 안전한 텍스트로 출력', t => {
  const original = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { globalThis.document = original; });
  const summary = productSummary(product, 50000);
  const amount = summary.children[1].children[1];
  assert.equal(amount.textContent, '50,000원'); // Use the booked price, not today's product price.
  assert.match(amount.className, /booking-text-unit/);
  const contact = contactNode({ name: '<script>name</script>', phone: '01012345678' });
  assert.equal(contact.children[0].textContent, '<script>name</script>');
  assert.equal(contact.children[1].textContent, '010-1234-5678');
  assert.equal(contact.children[1].href, 'tel:01012345678');
  assert.match(contact.children[1].className, /booking-text-unit/);
});

test('예약 및 변경 일정·상품 가격은 의미 단위 사이에서 줄바꿈 가능', t => {
  const original = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { globalThis.document = original; });
  const date = { date: '2026-10-22', time: '14:00' };
  for (const element of [scheduleNode(date), priceNode(product)]) {
    assert.equal(element.children.length, 2);
    assert.ok(element.children.every(child => child.className === 'booking-text-unit'));
  }
  assert.equal(text(scheduleNode(date)), '2026.10.22 · 14:00');
  assert.equal(text(priceNode(product)), '상담·체험 50분 70,000원');
  for (const admin of [true, false]) {
    const request = requestNode({ ...date, type: 'reschedule' }, admin);
    assert.equal(request.children[1].tagName, 'span');
    assert.equal(text(request.children[1]), '2026.10.22 · 14:00');
    assert.match(text(requestNode({ type: 'cancel' }, admin)), /취소/);
  }
});


test('고객 조회 상품 표시: 서버의 최신 담당자·프로그램·약정 금액·시간 사용', t => {
  const original = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { globalThis.document = original; });
  const result = lookupProductSummary({ product: { trainer: '윤수진 원장', title: '산전/산후 산모운동', price: 45000, duration: 80 } });
  assert.match(text(result), /윤수진 원장/);
  assert.match(text(result), /산전\/산후\s+산모운동/);
  assert.match(text(result), /45,000원/);
  assert.match(text(result), /80분/);
  assert.match(result.children[1].children[1].className, /booking-text-unit/);
  assert.match(text(lookupProductSummary({})), /확인 필요/);
  assert.ok(!text(lookupProductSummary({})).includes('undefined'));
});
