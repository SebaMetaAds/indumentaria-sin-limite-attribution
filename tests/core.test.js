import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMessages } from '../lib/whatsapp.js';
import { buildBusinessMessagingPurchase } from '../lib/meta.js';

test('extrae WABA, phone_number_id y ctwa_clid del webhook de WhatsApp', () => {
  const body = {
    entry:[{
      id:'WABA123',
      changes:[{
        value:{
          metadata:{ phone_number_id:'PHONE123', display_phone_number:'5491112345678' },
          contacts:[{wa_id:'5491198765432',profile:{name:'Cliente'}}],
          messages:[{
            from:'5491198765432',id:'wamid.1',timestamp:'1791150000',type:'text',
            text:{body:'Hola'},
            referral:{ctwa_clid:'CLICK123',source_id:'AD123',headline:'Promo'}
          }]
        }
      }]
    }]
  };
  const [m] = extractMessages(body);
  assert.equal(m.waba_id, 'WABA123');
  assert.equal(m.phone_number_id, 'PHONE123');
  assert.equal(m.phone, '5491198765432');
  assert.equal(m.referral.ctwa_clid, 'CLICK123');
  assert.equal(m.referral.source_id, 'AD123');
});

test('construye Purchase CAPI por cliente', () => {
  const e = buildBusinessMessagingPurchase({
    ctwaClid:'CLICK123',
    amount:99999,
    currency:'ARS',
    eventId:'sale_1',
    wabaId:'WABA123',
    eventTime:1700000000
  });
  assert.equal(e.event_name, 'Purchase');
  assert.equal(e.action_source, 'business_messaging');
  assert.equal(e.messaging_channel, 'whatsapp');
  assert.equal(e.user_data.whatsapp_business_account_id, 'WABA123');
  assert.equal(e.user_data.ctwa_clid, 'CLICK123');
  assert.equal(e.custom_data.value, 99999);
});
