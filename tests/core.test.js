import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMessages } from '../lib/whatsapp.js';
import { buildBusinessMessagingPurchase } from '../lib/meta.js';

test('extrae ctwa_clid del webhook de WhatsApp', () => {
  const body = { entry:[{changes:[{value:{contacts:[{wa_id:'5491112345678',profile:{name:'Cliente'}}],messages:[{from:'5491112345678',id:'wamid.1',timestamp:'1791150000',type:'text',text:{body:'Hola'},referral:{ctwa_clid:'CLICK123',source_id:'AD123',headline:'Promo'}}]}}]}] };
  const [m] = extractMessages(body);
  assert.equal(m.phone, '5491112345678');
  assert.equal(m.referral.ctwa_clid, 'CLICK123');
  assert.equal(m.referral.source_id, 'AD123');
});

test('construye Purchase CAPI de mensajería', () => {
  process.env.WABA_ID = 'WABA123';
  const e = buildBusinessMessagingPurchase({ ctwaClid:'CLICK123', amount:99999, currency:'ARS', eventId:'sale_1', eventTime:1700000000 });
  assert.equal(e.event_name, 'Purchase');
  assert.equal(e.action_source, 'business_messaging');
  assert.equal(e.messaging_channel, 'whatsapp');
  assert.equal(e.user_data.ctwa_clid, 'CLICK123');
  assert.equal(e.custom_data.value, 99999);
});
