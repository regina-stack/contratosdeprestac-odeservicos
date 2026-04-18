export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  // ── Rota 1: Extração de dados com IA (Claude) ─────────────────────────────
  if (!action || action === 'extract') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada.' });
    try {
      const { messages } = req.body;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages })
      });
      if (!response.ok) return res.status(response.status).json({ error: await response.text() });
      return res.status(200).json(await response.json());
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Rota 2: Enviar contrato para Clicksign ────────────────────────────────
  if (action === 'clicksign') {
    const token = process.env.CLICKSIGN_TOKEN;
    if (!token) return res.status(500).json({ error: 'CLICKSIGN_TOKEN não configurado na Vercel.' });

    const BASE = 'https://app.clicksign.com/api/v1';
    const { pdfBase64, nomeCliente, cpfCliente, emailCliente, whatsappCliente, nomeDocumento } = req.body;

    try {
      // PASSO 1: Upload do documento (PDF em base64)
      const uploadRes = await fetch(`${BASE}/documents?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            path: `/${nomeDocumento || 'Contrato'}_${Date.now()}.pdf`,
            content_base64: `data:application/pdf;base64,${pdfBase64}`,
            deadline_at: null,
            auto_close: true,
            locale: 'pt-BR',
            sequence_enabled: true
          }
        })
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        return res.status(uploadRes.status).json({ error: 'Erro ao enviar documento: ' + err });
      }
      const uploadData = await uploadRes.json();
      const documentKey = uploadData.document.key;

      // PASSO 2: Criar signatário — CLIENTE
      const signerClienteRes = await fetch(`${BASE}/signers?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer: {
            email: emailCliente,
            phone_number: whatsappCliente ? whatsappCliente.replace(/\D/g,'') : undefined,
            auths: ['email'],
            name: nomeCliente,
            documentation: cpfCliente,
            has_documentation: !!cpfCliente,
            selfie_enabled: false,
            handwritten_enabled: false,
            official_document_enabled: false,
            liveness_enabled: false,
            facial_biometrics_enabled: false
          }
        })
      });
      if (!signerClienteRes.ok) {
        const err = await signerClienteRes.text();
        return res.status(signerClienteRes.status).json({ error: 'Erro ao criar signatário cliente: ' + err });
      }
      const signerClienteData = await signerClienteRes.json();
      const signerClienteKey = signerClienteData.signer.key;

      // PASSO 3: Criar signatário — REGINA (Digital+)
      const signerReginaRes = await fetch(`${BASE}/signers?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer: {
            email: 'regina@digitalmaiscontabilidade.com',
            auths: ['email'],
            name: 'Regina Duarte Reis',
            has_documentation: false
          }
        })
      });
      if (!signerReginaRes.ok) {
        const err = await signerReginaRes.text();
        return res.status(signerReginaRes.status).json({ error: 'Erro ao criar signatário Regina: ' + err });
      }
      const signerReginaData = await signerReginaRes.json();
      const signerReginaKey = signerReginaData.signer.key;

      // PASSO 4: Adicionar cliente ao documento
      const listClienteRes = await fetch(`${BASE}/lists?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          list: {
            document_key: documentKey,
            signer_key: signerClienteKey,
            sign_as: 'party',
            refusable: true,
            group: 1,
            message: `Olá ${nomeCliente}, segue o contrato de prestação de serviços da Digital+ Contabilidade para sua assinatura. Qualquer dúvida, estamos à disposição pelo WhatsApp.`
          }
        })
      });
      if (!listClienteRes.ok) {
        const err = await listClienteRes.text();
        return res.status(listClienteRes.status).json({ error: 'Erro ao adicionar cliente ao documento: ' + err });
      }
      const listClienteData = await listClienteRes.json();
      const requestSignatureKeyCliente = listClienteData.list.request_signature_key;

      // PASSO 5: Adicionar Regina ao documento
      const listReginaRes = await fetch(`${BASE}/lists?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          list: {
            document_key: documentKey,
            signer_key: signerReginaKey,
            sign_as: 'party',
            refusable: false,
            group: 2,
            message: `Novo contrato gerado para ${nomeCliente}. Por favor, assine para finalizar.`
          }
        })
      });
      if (!listReginaRes.ok) {
        const err = await listReginaRes.text();
        return res.status(listReginaRes.status).json({ error: 'Erro ao adicionar Regina ao documento: ' + err });
      }
      const listReginaData = await listReginaRes.json();
      const requestSignatureKeyRegina = listReginaData.list.request_signature_key;

      // PASSO 6: Notificar cliente por e-mail
      await fetch(`${BASE}/notifications?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_signature_key: requestSignatureKeyCliente,
          message: `Olá ${nomeCliente}, seu contrato com a Digital+ Contabilidade está pronto para assinatura. Clique no botão abaixo para assinar.`
        })
      });

      // PASSO 7: Notificar cliente por WhatsApp (se tiver número)
      if (whatsappCliente) {
        const foneWA = whatsappCliente.replace(/\D/g, '');
        await fetch(`${BASE}/whatsapp_documents?access_token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            whatsapp_document: {
              request_signature_key: requestSignatureKeyCliente,
              phone_number: foneWA,
              message: `Olá ${nomeCliente}, seu contrato com a Digital+ Contabilidade está pronto para assinatura. Por favor, clique no link abaixo para assinar digitalmente.`
            }
          })
        });
      }

      // Regina será notificada automaticamente pela Clicksign
      // quando o cliente (grupo 1) concluir a assinatura.

      // PASSO 8: Registrar contrato no Supabase
      const SUPA_URL = 'https://rkritsqmaiqyjdonsqqn.supabase.co';
      const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrcml0c3FtYWlxeWpkb25zcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTY1NzYsImV4cCI6MjA5MTg5MjU3Nn0.uej4YE67KOiL1UZsYaxO2ZD8BOyKL0qBPMrVoFKc-tI';
      const supaHeaders = {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      };

      try {
        const hoje = new Date().toISOString().split('T')[0];
        const supaResp = await fetch(SUPA_URL + '/rest/v1/contratos', {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify({
            nome_cliente: nomeCliente,
            email_cliente: emailCliente,
            whatsapp_cliente: whatsappCliente,
            data_envio: hoje,
            status: 'pendente',
            document_key: documentKey
          })
        });
        if (supaResp.ok) {
          const [contrato] = await supaResp.json();
          // Registra o envio no histórico
          if (contrato?.id) {
            await fetch(SUPA_URL + '/rest/v1/contatos', {
              method: 'POST',
              headers: supaHeaders,
              body: JSON.stringify({
                contrato_id: contrato.id,
                data_contato: hoje,
                resultado: 'sem-resposta',
                canal: 'Sistema',
                observacao: 'Contrato enviado via Clicksign para assinatura.',
                feito_por: 'Sistema'
              })
            });
          }
        }
      } catch(supaErr) {
        // Não bloqueia o fluxo se o Supabase falhar
        console.error('Supabase erro:', supaErr.message);
      }

      return res.status(200).json({
        success: true,
        documentKey,
        message: `Contrato enviado com sucesso! ${nomeCliente} receberá por e-mail${whatsappCliente ? ' e WhatsApp' : ''}. Regina também foi notificada.`
      });

    } catch (e) {
      return res.status(500).json({ error: 'Erro interno: ' + e.message });
    }
  }


  // ── Rota 3: Buscar documentos pendentes da Clicksign ──────────────────────
  if (action === 'clicksign_listar') {
    const token = process.env.CLICKSIGN_TOKEN;
    if (!token) return res.status(500).json({ error: 'CLICKSIGN_TOKEN não configurado.' });
    
    try {
      const BASE = 'https://app.clicksign.com/api/v1';
      
      // Busca todos os documentos com paginação
      let allDocs = [];
      let page = 1;
      while (true) {
        const resp = await fetch(`${BASE}/documents?access_token=${token}&page=${page}&per_page=25`, {
          headers: { 'Content-Type': 'application/json' }
        });
        if (!resp.ok) {
          const err = await resp.text();
          return res.status(resp.status).json({ error: 'Erro ao buscar documentos: ' + err });
        }
        const data = await resp.json();
        const docs = data.documents || [];
        allDocs = allDocs.concat(docs);
        if (docs.length < 25) break; // última página
        page++;
        if (page > 20) break; // segurança
      }

      // Log dos status encontrados para diagnóstico
      const statusEncontrados = [...new Set(allDocs.map(d => d.status))];
      console.log('Status encontrados:', statusEncontrados, 'Total docs:', allDocs.length);

      // Filtra pendentes — tenta running e outros possíveis nomes
      const pendentes = allDocs.filter(doc => 
        doc.status === 'running' || 
        doc.status === 'pending' || 
        doc.status === 'waiting' ||
        doc.status === 'open' ||
        doc.status === 'sent'
      );
      
      // Formata os dados relevantes
      const formatados = pendentes.map(doc => ({
        key: doc.key,
        status: doc.status,
        filename: doc.filename,
        status: doc.status,
        created_at: doc.created_at,
        deadline_at: doc.deadline_at,
        signers: (doc.signers || []).map(s => ({
          name: s.name,
          email: s.email,
          signed: s.signed_at ? true : false,
          signed_at: s.signed_at
        }))
      }));
      
      return res.status(200).json({ documents: formatados });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  
  // ── Rota 4: Baixar PDF assinado da Clicksign ─────────────────────────────
  if (action === 'clicksign_pdf') {
    const token = process.env.CLICKSIGN_TOKEN;
    if (!token) return res.status(500).json({ error: 'CLICKSIGN_TOKEN não configurado.' });

    const { documentKey } = req.body;
    if (!documentKey) return res.status(400).json({ error: 'documentKey é obrigatório.' });

    try {
      const BASE = 'https://app.clicksign.com/api/v1';
      
      // Busca os dados do documento para obter a URL do PDF
      const resp = await fetch(`${BASE}/documents/${documentKey}?access_token=${token}`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!resp.ok) {
        const err = await resp.text();
        return res.status(resp.status).json({ error: 'Erro ao buscar documento: ' + err });
      }

      const data = await resp.json();
      const doc = data.document;

      // Retorna a URL de download do PDF
      return res.status(200).json({
        filename: doc.filename,
        download_url: `${BASE}/documents/${documentKey}/download?access_token=${token}`
      });

    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

    return res.status(400).json({ error: 'Ação desconhecida.' });
}
