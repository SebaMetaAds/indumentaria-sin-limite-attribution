import { sendJson, requireAdmin, isoRange } from '../lib/http.js';
import { patch, select } from '../lib/supabase.js';
import { listClients } from '../lib/clients.js';
import { clientMetaConfig, ensureWabaWebhookSubscription, getAdInsights, hasMetaToken } from '../lib/meta.js';

function enc(v) { return encodeURIComponent(v); }
function n(v) { return Number(v || 0); }
function arDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(value));
}
function daysBetween(a, b) {
  const x = new Date(a + 'T12:00:00Z');
  const y = new Date(b + 'T12:00:00Z');
  return Math.round((y - x) / 86400000);
}
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function monthStartOf(dateStr) { return dateStr.slice(0,8) + '01'; }
function nextMonthStart(dateStr) {
  const d = new Date(dateStr.slice(0,7) + '-15T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0,10);
}
function prevMonthStart(dateStr) {
  const d = new Date(dateStr.slice(0,7) + '-15T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1, 1);
  return d.toISOString().slice(0,10);
}
function arMidnightUtc(dateStr) { return dateStr + 'T03:00:00.000Z'; }
function deltaPct(current, previous) {
  current=n(current); previous=n(previous);
  if (!previous) return current ? null : 0;
  return (current - previous) / previous;
}

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

    const today = arDate();
    const monthStart = monthStartOf(today);
    const tomorrow = shiftDate(today,1);
    const yesterday = shiftDate(today,-1);
    const currentMonthNext = nextMonthStart(today);
    const previousMonthStart = prevMonthStart(today);
    const dayOfMonth = Number(today.slice(8,10));
    const daysInMonth = daysBetween(monthStart,currentMonthNext);
    let paymentQuery = `select=*&paid_at=gte.${enc(monthStart + 'T00:00:00.000Z')}&order=paid_at.desc&limit=2000`;
    let followUpQuery = 'select=*&follow_up_at=not.is.null&order=follow_up_at.asc&limit=2000';
    let taskQuery = 'select=*&status=eq.open&order=due_at.asc.nullslast,created_at.desc&limit=1000';
    let aliasPaymentQuery = 'select=*&payment_signal_detected_at=not.is.null&order=payment_signal_detected_at.desc&limit=2000';
    let currentMonthSalesQuery = `select=*&sold_at=gte.${enc(arMidnightUtc(monthStart))}&sold_at=lt.${enc(arMidnightUtc(currentMonthNext))}&order=sold_at.desc&limit=5000`;
    let previousMonthSalesQuery = `select=*&sold_at=gte.${enc(arMidnightUtc(previousMonthStart))}&sold_at=lt.${enc(arMidnightUtc(monthStart))}&order=sold_at.desc&limit=5000`;
    if (requestedClientId) {
      paymentQuery += `&client_id=eq.${enc(requestedClientId)}`;
      followUpQuery += `&client_id=eq.${enc(requestedClientId)}`;
      taskQuery += `&client_id=eq.${enc(requestedClientId)}`;
      aliasPaymentQuery += `&client_id=eq.${enc(requestedClientId)}`;
      currentMonthSalesQuery += `&client_id=eq.${enc(requestedClientId)}`;
      previousMonthSalesQuery += `&client_id=eq.${enc(requestedClientId)}`;
    }

    const [leads, sales, insightGroups, servicePayments, followUpLeads, agencyTasks, aliasPaymentLeads, currentMonthSales, previousMonthSales] = await Promise.all([
      select('leads', rangeQuery('first_message_at', since, until, requestedClientId)),
      select('sales', rangeQuery('sold_at', since, until, requestedClientId)),
      Promise.all(selectedClients.map(async client => {
        const insightRows = await getAdInsights(since, until, client);
        return insightRows.map(row => ({ ...row, client_id: client.id, client_name: client.name }));
      })),
      select('client_service_payments', paymentQuery),
      select('leads', followUpQuery),
      select('agency_tasks', taskQuery),
      select('leads', aliasPaymentQuery),
      select('sales', currentMonthSalesQuery),
      select('sales', previousMonthSalesQuery)
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
    const unpricedSales = (leads || []).filter(l => l.status === 'won' && !(salesByLead.get(l.id) || []).length).length;
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
        website_url: client.website_url || null,
        instagram_handle: client.instagram_handle || null,
        monthly_ad_budget: client.monthly_ad_budget == null ? null : Number(client.monthly_ad_budget),
        monthly_revenue_goal: client.monthly_revenue_goal == null ? null : Number(client.monthly_revenue_goal),
        business_goal: client.business_goal || null,
        internal_notes: client.internal_notes || null,
        primary_contact_name: client.primary_contact_name || null,
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

    const pipeline = { new:0, contacted:0, quoted:0, follow_up:0, won:0, lost:0 };
    for (const lead of leads || []) {
      const stage = lead.pipeline_stage || (lead.status === 'won' ? 'won' : lead.status === 'lost' ? 'lost' : 'new');
      if (Object.prototype.hasOwnProperty.call(pipeline, stage)) pipeline[stage] += 1;
    }

    const activeServiceClients = selectedClients.filter(c => c.status === 'active' && (c.service_status || 'active') === 'active');
    const mrr = activeServiceClients.reduce((acc, c) => {
      const fee = n(c.service_fee);
      const months = Math.max(1, n(c.renewal_period_months) || 1);
      return acc + fee / months;
    }, 0);
    const collectedThisMonth = (servicePayments || []).reduce((acc, p) => acc + n(p.amount), 0);
    const overdueClients = activeServiceClients.filter(c => c.renewal_date && daysBetween(today, c.renewal_date) < 0);
    const dueSoonClients = activeServiceClients.filter(c => {
      if (!c.renewal_date) return false;
      const d = daysBetween(today, c.renewal_date);
      return d >= 0 && d <= 7;
    });
    const overdueReceivable = overdueClients.reduce((acc, c) => acc + n(c.service_fee), 0);
    const dueSoonReceivable = dueSoonClients.reduce((acc, c) => acc + n(c.service_fee), 0);

    const dueFollowUps = (followUpLeads || [])
      .filter(l => !['won','lost'].includes(l.pipeline_stage) && arDate(l.follow_up_at) <= today)
      .map(l => ({
        ...l,
        client_name: clientById.get(l.client_id)?.name || 'Cliente',
        overdue: arDate(l.follow_up_at) < today
      }));

    const renewalAttention = activeServiceClients
      .filter(c => c.renewal_date && daysBetween(today, c.renewal_date) <= 3)
      .map(c => ({
        id:c.id, name:c.name, renewal_date:c.renewal_date,
        days:daysBetween(today, c.renewal_date),
        service_fee:c.service_fee == null ? null : Number(c.service_fee)
      }))
      .sort((a,b) => a.days - b.days);

    const openTasks = (agencyTasks || []).map(t => ({
      ...t,
      client_name: t.client_id ? (clientById.get(t.client_id)?.name || 'Cliente') : 'Agencia'
    }));
    const dueTasks = openTasks.filter(t => {
      if (!t.due_at) return t.priority === 'urgent';
      return arDate(t.due_at) <= today;
    }).map(t => ({
      ...t,
      overdue: Boolean(t.due_at && arDate(t.due_at) < today)
    }));

    const sellerMap = new Map();
    for (const l of leads || []) {
      const owner = String(l.assigned_to || '').trim();
      if (!owner) continue;
      if (!sellerMap.has(owner)) sellerMap.set(owner, { name:owner, chats:0, won:0, lost:0, open:0, followups_due:0, revenue:0 });
      const s = sellerMap.get(owner);
      s.chats += 1;
      const stage = l.pipeline_stage || (l.status === 'won' ? 'won' : l.status === 'lost' ? 'lost' : 'new');
      if (stage === 'won') s.won += 1;
      else if (stage === 'lost') s.lost += 1;
      else s.open += 1;
      for (const sale of salesByLead.get(l.id) || []) s.revenue += n(sale.amount);
      if (l.follow_up_at && !['won','lost'].includes(stage) && arDate(l.follow_up_at) <= today) s.followups_due += 1;
    }
    const sellerStats = [...sellerMap.values()].map(s => ({
      ...s,
      close_rate: s.chats ? s.won / s.chats : 0,
      average_ticket: s.won ? s.revenue / s.won : 0
    })).sort((a,b) => b.revenue - a.revenue || b.won - a.won || b.close_rate - a.close_rate || b.chats - a.chats);

    const lossMap = new Map();
    for (const l of leads || []) {
      const stage = l.pipeline_stage || (l.status === 'lost' ? 'lost' : null);
      if (stage !== 'lost') continue;
      const reason = String(l.loss_reason || '').trim() || 'Sin motivo';
      lossMap.set(reason, (lossMap.get(reason) || 0) + 1);
    }
    const lossReasons = [...lossMap.entries()]
      .map(([reason,count]) => ({reason,count}))
      .sort((a,b) => b.count - a.count);

    const paymentQueue = (aliasPaymentLeads || []).map(l => ({
      ...l,
      client_name: clientById.get(l.client_id)?.name || 'Cliente',
      sales: salesByLead.get(l.id) || []
    }));
    const pendingPayments = paymentQueue.filter(l => l.payment_check_status === 'pending');

    const aiOpportunities = enrichedLeads
      .filter(l => {
        const stage = l.pipeline_stage || (l.status === 'won' ? 'won' : l.status === 'lost' ? 'lost' : 'new');
        if (['won','lost'].includes(stage)) return false;
        return n(l.ai_score) >= 70 || l.ai_requires_attention === true;
      })
      .map(l => ({
        id:l.id,
        client_id:l.client_id,
        client_name:l.client_name,
        contact_name:l.contact_name,
        phone:l.phone,
        score:n(l.ai_score),
        intent:l.ai_intent,
        summary:l.ai_summary,
        next_action:l.ai_next_action,
        objections:Array.isArray(l.ai_objections) ? l.ai_objections : [],
        assigned_to:l.assigned_to || null,
        ai_analyzed_at:l.ai_analyzed_at || null
      }))
      .sort((a,b) => b.score - a.score);

    const todaySales=(currentMonthSales||[]).filter(s=>arDate(s.sold_at)===today);
    const yesterdaySales=(currentMonthSales||[]).filter(s=>arDate(s.sold_at)===yesterday);
    const todayRevenue=todaySales.reduce((a,s)=>a+n(s.amount),0);
    const yesterdayRevenue=yesterdaySales.reduce((a,s)=>a+n(s.amount),0);
    const monthRevenue=(currentMonthSales||[]).reduce((a,s)=>a+n(s.amount),0);
    const previousMonthRevenue=(previousMonthSales||[]).reduce((a,s)=>a+n(s.amount),0);
    const monthSalesCount=(currentMonthSales||[]).length;
    const previousMonthSalesCount=(previousMonthSales||[]).length;
    const monthlyGoal=selectedClients.reduce((a,client)=>a+n(client.monthly_revenue_goal),0);
    const projectedMonthRevenue=dayOfMonth ? (monthRevenue/dayOfMonth)*daysInMonth : monthRevenue;
    const goalProgress=monthlyGoal ? monthRevenue/monthlyGoal : null;
    const projectedGoalProgress=monthlyGoal ? projectedMonthRevenue/monthlyGoal : null;
    const byPaymentMethod=new Map();
    for(const s of sales||[]){
      const key=String(s.payment_method||'otro');
      const cur=byPaymentMethod.get(key)||{payment_method:key,sales:0,revenue:0};
      cur.sales+=1;cur.revenue+=n(s.amount);byPaymentMethod.set(key,cur);
    }
    const salesByClient=(byClient||[]).map(c=>({
      client_id:c.id,client_name:c.name,sales:c.purchases,revenue:c.revenue,
      average_ticket:c.purchases?c.revenue/c.purchases:0
    })).sort((a,b)=>b.revenue-a.revenue);
    const leadById=new Map((leads||[]).map(l=>[l.id,l]));
    const recentSales=(sales||[]).slice(0,50).map(s=>{
      const l=leadById.get(s.lead_id);
      return {...s,contact_name:l?.contact_name||null,phone:l?.phone||null,
        client_name:clientById.get(s.client_id)?.name||'Cliente',
        assigned_to:l?.assigned_to||null,ad_name:l?.meta_ad_name||l?.referral_headline||null};
    });

    const revenueAdRanking=rows
      .filter(r=>n(r.revenue)>0)
      .sort((a,b)=>n(b.revenue)-n(a.revenue) || n(b.purchases)-n(a.purchases))
      .slice(0,20)
      .map((r,index)=>({
        rank:index+1,
        client_id:r.client_id,
        client_name:r.client_name,
        campaign:r.campaign,
        ad:r.ad,
        spend:r.spend,
        sales:r.purchases,
        revenue:r.revenue,
        roas:r.roas,
        average_ticket:r.purchases ? r.revenue/r.purchases : 0
      }));

    const adAlerts = [];
    for (const row of rows) {
      if (row.spend >= 20000 && row.leads === 0) {
        adAlerts.push({
          severity:'critical', type:'spend_no_chats', client_id:row.client_id,
          client_name:row.client_name, ad_id:row.ad_id, ad:row.ad,
          message:`Gastó ${Math.round(row.spend).toLocaleString('es-AR')} sin generar chats`
        });
      } else if (row.spend >= 30000 && row.leads >= 3 && row.purchases === 0) {
        adAlerts.push({
          severity:'warning', type:'chats_no_sales', client_id:row.client_id,
          client_name:row.client_name, ad_id:row.ad_id, ad:row.ad,
          message:`${row.leads} chats y todavía ninguna venta`
        });
      } else if (row.leads >= 5 && row.close_rate != null && row.close_rate < 0.05) {
        adAlerts.push({
          severity:'warning', type:'low_close_rate', client_id:row.client_id,
          client_name:row.client_name, ad_id:row.ad_id, ad:row.ad,
          message:`Cierre bajo: ${(row.close_rate*100).toFixed(1)}%`
        });
      }
    }

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
        close_rate: (leads || []).length ? wonLeads.size/(leads || []).length : 0,
        unpriced_sales: unpricedSales
      },
      sales_center: {
        period_sales:(sales||[]).length,
        period_revenue:revenue,
        average_ticket:(sales||[]).length?revenue/(sales||[]).length:0,
        today_sales:todaySales.length,
        today_revenue:todayRevenue,
        yesterday_sales:yesterdaySales.length,
        yesterday_revenue:yesterdayRevenue,
        today_revenue_delta:deltaPct(todayRevenue,yesterdayRevenue),
        today_sales_delta:deltaPct(todaySales.length,yesterdaySales.length),
        month_sales:monthSalesCount,
        month_revenue:monthRevenue,
        previous_month_sales:previousMonthSalesCount,
        previous_month_revenue:previousMonthRevenue,
        month_revenue_delta:deltaPct(monthRevenue,previousMonthRevenue),
        month_sales_delta:deltaPct(monthSalesCount,previousMonthSalesCount),
        monthly_goal:monthlyGoal,
        goal_progress:goalProgress,
        projected_month_revenue:projectedMonthRevenue,
        projected_goal_progress:projectedGoalProgress,
        month_elapsed_days:dayOfMonth,
        month_total_days:daysInMonth,
        unpriced_sales:unpricedSales,
        payments_pending:pendingPayments.length,
        by_payment_method:[...byPaymentMethod.values()].sort((a,b)=>b.revenue-a.revenue),
        by_client:salesByClient,
        by_ad_revenue:revenueAdRanking,
        recent_sales:recentSales
      },
      agency_finance: {
        active_clients: activeServiceClients.length,
        mrr,
        collected_this_month: collectedThisMonth,
        payments_this_month: (servicePayments || []).length,
        overdue_clients: overdueClients.length,
        overdue_receivable: overdueReceivable,
        due_next_7_days: dueSoonClients.length,
        due_next_7_days_amount: dueSoonReceivable
      },
      pipeline,
      seller_stats: sellerStats,
      loss_reasons: lossReasons,
      tasks: openTasks,
      payment_queue: paymentQueue,
      today: {
        followups: dueFollowUps,
        tasks: dueTasks,
        renewals: renewalAttention,
        ai_opportunities: aiOpportunities.slice(0, 30),
        payments_pending: pendingPayments.slice(0, 30),
        ad_alerts: adAlerts.slice(0, 30)
      },
      clients: publicClients, by_client: byClient, by_ad: rows, leads: enrichedLeads
    });
  } catch (error) {
    console.error('dashboard', error);
    return sendJson(res, 500, { error: error.message });
  }
}
