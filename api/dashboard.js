import { sendJson, requireAdmin, isoRange } from '../lib/http.js';
import { select } from '../lib/supabase.js';
import { getAdInsights } from '../lib/meta.js';

function enc(v) { return encodeURIComponent(v); }
function n(v) { return Number(v || 0); }

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método no permitido' });
  try {
    const { since, until, days } = isoRange(req.query || {});
    const [leads, sales, insights] = await Promise.all([
      select('leads', `select=*&first_message_at=gte.${enc(since)}&first_message_at=lte.${enc(until)}&order=first_message_at.desc&limit=1000`),
      select('sales', `select=*&sold_at=gte.${enc(since)}&sold_at=lte.${enc(until)}&order=sold_at.desc&limit=1000`),
      getAdInsights(since, until)
    ]);

    const salesByLead = new Map();
    for (const s of sales || []) {
      const arr = salesByLead.get(s.lead_id) || [];
      arr.push(s); salesByLead.set(s.lead_id, arr);
    }

    const spend = insights.reduce((acc, x) => acc + n(x.spend), 0);
    const revenue = (sales || []).reduce((acc, s) => acc + n(s.amount), 0);
    const wonLeads = new Set((sales || []).map(s => s.lead_id));
    const attributedLeads = (leads || []).filter(l => l.ctwa_clid);

    const byAd = new Map();
    for (const insight of insights) {
      byAd.set(insight.ad_id, {
        ad_id: insight.ad_id,
        campaign: insight.campaign_name || '',
        adset: insight.adset_name || '',
        ad: insight.ad_name || '',
        spend: n(insight.spend),
        leads: 0, purchases: 0, revenue: 0
      });
    }
    for (const l of leads || []) {
      const id = l.meta_ad_id || 'sin_ad';
      if (!byAd.has(id)) byAd.set(id, { ad_id:id, campaign:l.meta_campaign_name || '', adset:l.meta_adset_name || '', ad:l.meta_ad_name || l.referral_headline || 'Sin nombre', spend:0, leads:0, purchases:0, revenue:0 });
      const row = byAd.get(id); row.leads += 1;
      for (const s of salesByLead.get(l.id) || []) { row.purchases += 1; row.revenue += n(s.amount); }
    }

    const rows = [...byAd.values()].map(x => ({
      ...x,
      cost_per_lead: x.leads ? x.spend / x.leads : null,
      cpa: x.purchases ? x.spend / x.purchases : null,
      roas: x.spend ? x.revenue / x.spend : null,
      close_rate: x.leads ? x.purchases / x.leads : null
    })).sort((a,b) => b.revenue - a.revenue || b.spend - a.spend);

    const enrichedLeads = (leads || []).map(l => ({ ...l, sales: salesByLead.get(l.id) || [] }));

    return sendJson(res, 200, {
      range: { since, until, days },
      configured: {
        meta_insights: Boolean(process.env.META_AD_ACCOUNT_ID && process.env.META_ACCESS_TOKEN),
        meta_capi: Boolean(process.env.META_DATASET_ID && process.env.META_ACCESS_TOKEN && process.env.WABA_ID),
        mercado_pago: Boolean(process.env.MP_ACCESS_TOKEN)
      },
      totals: {
        spend,
        conversations: (leads || []).length,
        attributed_conversations: attributedLeads.length,
        purchases: (sales || []).length,
        unique_buyers: wonLeads.size,
        revenue,
        cost_per_conversation: (leads || []).length ? spend/(leads || []).length : 0,
        cpa: (sales || []).length ? spend/(sales || []).length : 0,
        roas: spend ? revenue/spend : 0,
        close_rate: (leads || []).length ? wonLeads.size/(leads || []).length : 0
      },
      by_ad: rows,
      leads: enrichedLeads
    });
  } catch (error) {
    console.error('dashboard', error);
    return sendJson(res, 500, { error: error.message });
  }
}
