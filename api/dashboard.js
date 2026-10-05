import { sendJson, requireAdmin, isoRange } from '../lib/http.js';
import { patch, select } from '../lib/supabase.js';
import { listClients } from '../lib/clients.js';
import { clientMetaConfig, ensureWabaWebhookSubscription, getAdInsights, hasMetaToken } from '../lib/meta.js';

function enc(v) { return encodeURIComponent(v); }
function n(v) { return Number(v || 0); }

function rangeQuery(column, since, until, clientId) {
  let q = `select=*&${column}=gte.${enc(since)}&${column}=lte.${enc(until)}&order=${column}.desc&limit=2000`;
  if (clientId) q += `&client_id=eq.${enc(clientId)}`;
  return q;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });

  try {
    const { since, until, days } = isoRange(req.query || {});
    const requestedClientId = req.query?.client_id && req.query.client_id !== 'all' ? req.query.client_id : null;
    const clients = await listClients();
    const selectedClients = requestedClientId
      ? clients.filter(c => c.id === requestedClientId)
      : clients.filter(c => c.status === 'active');

    if (requestedClientId && selectedClients.length === 0) {
      return sendJson(res, 404, { error: 'Cliente no encontrado' });
    }

    const tokenStatuses = new Map(await Promise.all(clients.map(async c => [c.id, await hasMetaToken(c)])));

    await Promise.all(selectedClients.map(async client => {
      const tokenReady = Boolean(tokenStatuses.get(client.id));
      if (!tokenReady || !client.waba_id || client.webhook_subscribed_at) return;
      try {
        await ensureWabaWebhookSubscription(client);
        const now = new Date().toISOString();
        client.webhook_subscribed_at = now;
        client.webhook_subscription_error = null;
        await patch('clients', { id: `eq.${client.id}` }, {
          webhook_subscribed_at: now,
          webhook_subscription_error: null,
          updated_at: now
        });
      } catch (e) {
        client.webhook_subscription_error = e.message;
        await patch('clients', { id: `eq.${client.id}` }, {
          webhook_subscription_error: e.message,
          updated_at: new Date().toISOString()
        }).catch(() => {});
        console.error('waba webhook subscription', { client_id: client.id, error: e.message });
      }
    }));

    const publicClients = clients.map(c => ({ ...c, meta_token_configured: Boolean(tokenStatuses.get(c.id)) }));

    const [leads, sales, insightGroups] = await Promise.all([
      select('leads', rangeQuery('first_message_at', since, until, requestedClientId)),
      select('sales', rangeQuery('sold_at', since, until, requestedClientId)),
      Promise.all(selectedClients.map(async client => {
        const rows = await getAdInsights(since, until, client);
        return rows.map(row => ({ ...row, client_id: client.id, client_name: client.name }));
      }))
    ]);

    const insights = insightGroups.flat();
    const clientById = new Map(clients.map(c => [c.id, c]));
    const salesByLead = new Map();
    for (const s of sales || []) {
      const arr = salesByLead.get(s.lead_id) || [];
      arr.push(s); salesByLead.set(s.lead_id, arr);
    }

    const spend = insights.reduce((acc, x) => acc + n(x.spend), 0);
    const revenue = (sales || []).reduce((acc, s) => acc + n(s.amount), 0);
    const wonLeads = new Set((leads || []).filter(l => l.status === 'won').map(l => l.id));
    const attributedLeads = (leads || []).filter(l => l.ctwa_clid);

    const byAd = new Map();
    for (const insight of insights) {
      const key = `${insight.client_id}:${insight.ad_id}`;
      byAd.set(key, {
        client_id: insight.client_id, client_name: insight.client_name,
        ad_id: insight.ad_id,
        campaign_id: insight.campaign_id || null,
        campaign: insight.campaign_name || '',
        adset_id: insight.adset_id || null,
        adset: insight.adset_name || '',
        ad: insight.ad_name || '',
        spend: n(insight.spend), leads: 0, purchases: 0, revenue: 0
      });
    }

    for (const l of leads || []) {
      const key = `${l.client_id}:${l.meta_ad_id || 'sin_ad'}`;
      const client = clientById.get(l.client_id);
      if (!byAd.has(key)) {
        byAd.set(key, {
          client_id: l.client_id, client_name: client?.name || 'Cliente',
          ad_id: l.meta_ad_id || 'sin_ad',
          campaign_id: l.meta_campaign_id || null,
          campaign: l.meta_campaign_name || '',
          adset_id: l.meta_adset_id || null,
          adset: l.meta_adset_name || '',
          ad: l.meta_ad_name || l.referral_headline || 'Sin nombre',
          spend: 0, leads: 0, purchases: 0, revenue: 0
        });
      }
      const row = byAd.get(key); row.leads += 1;
      if (l.status === 'won') row.purchases += 1;
      for (const s of salesByLead.get(l.id) || []) { row.revenue += n(s.amount); }
    }

    const rows = [...byAd.values()].map(x => ({
      ...x,
      cost_per_lead: x.leads ? x.spend / x.leads : null,
      cpa: x.purchases ? x.spend / x.purchases : null,
      roas: x.spend ? x.revenue / x.spend : null,
      close_rate: x.leads ? x.purchases / x.leads : null
    })).sort((a,b) => b.spend - a.spend || b.revenue - a.revenue);

    const byClient = selectedClients.map(client => {
      const cLeads = (leads || []).filter(l => l.client_id === client.id);
      const cSales = (sales || []).filter(s => s.client_id === client.id);
      const cSpend = insights.filter(i => i.client_id === client.id).reduce((a,x) => a + n(x.spend), 0);
      const cRevenue = cSales.reduce((a,x) => a + n(x.amount), 0);
      const cWon = cLeads.filter(l => l.status === 'won');
      const cBuyers = new Set(cWon.map(l => l.id));
      const config = clientMetaConfig(client);
      const tokenReady = Boolean(tokenStatuses.get(client.id));
      return {
        id: client.id, name: client.name, slug: client.slug, status: client.status,
        whatsapp_number: client.whatsapp_number, waba_id: client.waba_id,
        phone_number_id: client.phone_number_id, ad_account_id: client.ad_account_id,
        dataset_id: client.dataset_id, meta_token_configured: tokenReady,
        service_start_date: client.service_start_date || null,
        last_payment_at: client.last_payment_at || null,
        renewal_date: client.renewal_date || null,
        renewal_period_months: client.renewal_period_months || 1,
        billing_phone: client.billing_phone || null,
        service_fee: client.service_fee == null ? null : Number(client.service_fee),
        service_notes: client.service_notes || null,
        service_status: client.service_status || 'active',
        reminder_enabled: client.reminder_enabled !== false,
        reminder_days_before: client.reminder_days_before ?? 1,
        reminder_last_sent_for: client.reminder_last_sent_for || null,
        conversations: cLeads.length, purchases: cWon.length, unique_buyers: cBuyers.size,
        spend: cSpend, revenue: cRevenue,
        cpa: cWon.length ? cSpend / cWon.length : null,
        roas: cSpend ? cRevenue / cSpend : null,
        close_rate: cLeads.length ? cBuyers.size / cLeads.length : null,
        whatsapp_ready: Boolean(client.waba_id && client.phone_number_id),
        webhook_ready: Boolean(client.webhook_subscribed_at),
        webhook_subscription_error: client.webhook_subscription_error || null,
        meta_spend_ready: Boolean(config.adAccountId && tokenReady),
        meta_purchase_ready: Boolean(config.datasetId && config.wabaId && tokenReady)
      };
    });

    const enrichedLeads = (leads || []).map(l => ({
      ...l, client_name: clientById.get(l.client_id)?.name || 'Cliente',
      sales: salesByLead.get(l.id) || []
    }));

    return sendJson(res, 200, {
      range: { since, until, days },
      selected_client_id: requestedClientId,
      configured: {
        meta_insights: selectedClients.some(c => Boolean(clientMetaConfig(c).adAccountId && tokenStatuses.get(c.id))),
        meta_capi: selectedClients.some(c => Boolean(clientMetaConfig(c).datasetId && clientMetaConfig(c).wabaId && tokenStatuses.get(c.id))),
        mercado_pago: Boolean(process.env.MP_ACCESS_TOKEN)
      },
      totals: {
        spend, conversations: (leads || []).length,
        attributed_conversations: attributedLeads.length,
        purchases: wonLeads.size, unique_buyers: wonLeads.size, revenue,
        cost_per_conversation: (leads || []).length ? spend/(leads || []).length : 0,
        cpa: wonLeads.size ? spend/wonLeads.size : 0,
        roas: spend ? revenue/spend : 0,
        close_rate: (leads || []).length ? wonLeads.size/(leads || []).length : 0
      },
      clients: publicClients, by_client: byClient, by_ad: rows, leads: enrichedLeads
    });
  } catch (error) {
    console.error('dashboard', error);
    return sendJson(res, 500, { error: error.message });
  }
}
