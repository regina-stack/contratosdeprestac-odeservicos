export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Valida que o chamador é a Regina (verifica o token do usuário)
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autorizado.' });

  const userToken = authHeader.replace('Bearer ', '');
  const SUPA_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ADMIN_EMAIL = 'regina@digitalmaiscontabilidade.com';

  // Verifica quem é o usuário fazendo a requisição
  const userResp = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userToken}` }
  });
  const userData = await userResp.json();
  if (userData.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Acesso restrito à administradora.' });
  }

  const { action, userId, email, password, name } = req.body || {};

  try {
    // Listar usuários
    if (req.method === 'GET' || action === 'list') {
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=100`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // Criar usuário
    if (action === 'create') {
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } })
      });
      const data = await r.json();
      return res.status(r.ok ? 200 : 400).json(data);
    }

    // Trocar senha
    if (action === 'password') {
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await r.json();
      return res.status(r.ok ? 200 : 400).json(data);
    }

    // Excluir usuário
    if (action === 'delete') {
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      return res.status(r.ok ? 200 : 400).json({ ok: r.ok });
    }

    return res.status(400).json({ error: 'Ação desconhecida.' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
