const SUPA_URL = 'https://rkritsqmaiqyjdonsqqn.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrcml0c3FtYWlxeWpkb25zcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTY1NzYsImV4cCI6MjA5MTg5MjU3Nn0.uej4YE67KOiL1UZsYaxO2ZD8BOyKL0qBPMrVoFKc-tI';

const supaHeaders = {
  'apikey': SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const event = req.body;

    // Clicksign envia evento quando documento é finalizado (todos assinaram)
    const eventName = event?.event?.name;
    const doc       = event?.document;
    const docKey    = doc?.key;

    if (!docKey) return res.status(200).json({ ok: true });

    // Evento: documento finalizado (todos assinaram)
    if (eventName === 'auto_close' || eventName === 'close') {
      // Atualiza status para 'assinou' no Supabase
      const upResp = await fetch(`${SUPA_URL}/rest/v1/contratos?document_key=eq.${docKey}`, {
        method: 'PATCH',
        headers: supaHeaders,
        body: JSON.stringify({ status: 'assinou' })
      });

      // Busca o contrato para registrar no histórico
      const getResp = await fetch(`${SUPA_URL}/rest/v1/contratos?document_key=eq.${docKey}&select=id,nome_cliente`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
      });
      const contratos = await getResp.json();

      if (contratos?.length > 0) {
        const hoje = new Date().toISOString().split('T')[0];
        await fetch(`${SUPA_URL}/rest/v1/contatos`, {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify({
            contrato_id: contratos[0].id,
            data_contato: hoje,
            resultado: 'assinou',
            canal: 'Clicksign',
            observacao: 'Contrato assinado por todos os signatários via Clicksign.',
            feito_por: 'Sistema'
          })
        });
      }
    }

    // Evento: signatário recusou assinar
    if (eventName === 'refusal') {
      const signerName  = event?.event?.data?.name  || 'Signatário';
      const signerEmail = event?.event?.data?.email || '';
      const motivo      = event?.event?.data?.reason || 'Motivo não informado';

      const getResp = await fetch(`${SUPA_URL}/rest/v1/contratos?document_key=eq.${docKey}&select=id`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
      });
      const contratos = await getResp.json();

      if (contratos?.length > 0) {
        const hoje = new Date().toISOString().split('T')[0];
        // Marca como recusado no Supabase
        await fetch(`${SUPA_URL}/rest/v1/contratos?document_key=eq.${docKey}`, {
          method: 'PATCH',
          headers: supaHeaders,
          body: JSON.stringify({ status: 'recusado' })
        });
        // Registra no histórico
        await fetch(`${SUPA_URL}/rest/v1/contatos`, {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify({
            contrato_id: contratos[0].id,
            data_contato: hoje,
            resultado: 'recusou',
            canal: 'Clicksign',
            observacao: `${signerName} (${signerEmail}) recusou assinar. Motivo: ${motivo}`,
            feito_por: 'Sistema'
          })
        });
      }
    }

    // Evento: signatário assinou (assinatura parcial)
    if (eventName === 'sign') {
      const signerName  = event?.event?.data?.name  || 'Signatário';
      const signerEmail = event?.event?.data?.email || '';

      const getResp = await fetch(`${SUPA_URL}/rest/v1/contratos?document_key=eq.${docKey}&select=id`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY }
      });
      const contratos = await getResp.json();

      if (contratos?.length > 0) {
        const hoje = new Date().toISOString().split('T')[0];
        await fetch(`${SUPA_URL}/rest/v1/contatos`, {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify({
            contrato_id: contratos[0].id,
            data_contato: hoje,
            resultado: 'sucesso',
            canal: 'Clicksign',
            observacao: `${signerName} (${signerEmail}) assinou o contrato.`,
            feito_por: 'Sistema'
          })
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch(e) {
    console.error('Webhook erro:', e.message);
    return res.status(200).json({ ok: true }); // Sempre retorna 200 para a Clicksign
  }
}
