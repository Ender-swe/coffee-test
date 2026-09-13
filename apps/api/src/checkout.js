import { quote } from '@orlast/catalog';
import { currentUser, emailValue, hash } from './auth.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function syncPayment(db, session) {
  const id = session.metadata?.order_id;
  if (!id || !uuid.test(id)) return;
  // Only a verified Stripe response or signed webhook reaches this function.
  if (session.payment_status === 'paid') {
    await db.query(`UPDATE orders SET status='paid', total=$3, shipping_address=$4, paid_at=COALESCE(paid_at,now())
      WHERE id=$1 AND stripe_session_id=$2 AND $5='usd' AND $3>=subtotal+shipping`,
    [id, session.id, session.amount_total, JSON.stringify(session.collected_information?.shipping_details || session.shipping_details || null), session.currency]);
  } else if (session.status === 'expired') {
    await db.query("UPDATE orders SET status='expired' WHERE id=$1 AND stripe_session_id=$2 AND status='pending'", [id, session.id]);
  }
}
export function registerCheckout(app, { db, stripe, webUrl, automaticTax, limiter }) {
  app.post('/api/checkout', limiter, async (req, res) => {
    const email = emailValue(req.body?.email);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const key = req.get('Idempotency-Key');
    const accessToken = req.body?.accessToken;
    if (!email || name.length < 2 || name.length > 80 || !uuid.test(key || '') || !/^[a-f0-9]{64}$/.test(accessToken || '')) return res.status(400).json({ error: 'Please check your contact details and try again.' });
    let order;
    try { order = quote(req.body.items, req.body.shipping); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (!stripe) return res.status(503).json({ error: 'Payments are not available just yet. Your bag is saved; please try again soon.' });
    const user = await currentUser(db, req);
    const requestHash = hash(JSON.stringify({ items: order.lines.map(p => ({ id: p.id, quantity: p.quantity, price: p.price })), shipping: req.body.shipping, email, name, user: user?.id || null }));
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO orders(id,access_hash,request_hash,user_id,email,name,items,subtotal,shipping,total,shipping_method)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,
      [key, hash(accessToken), requestHash, user?.id || null, email, name, JSON.stringify(order.lines), order.subtotal, order.shipping, order.total, req.body.shipping]);
      const { rows: [saved] } = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [key]);
      if (saved.access_hash !== hash(accessToken) || saved.request_hash !== requestHash) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Your bag has changed. Refresh checkout and try again.' });
      }
      if (saved.status === 'paid') {
        await client.query('COMMIT');
        return res.json({ orderId: key, status: 'paid' });
      }
      if (saved.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This checkout has already finished. Start a new checkout from your bag.' });
      }
      if (saved.stripe_session_id) {
        const existing = await stripe.checkout.sessions.retrieve(saved.stripe_session_id);
        await syncPayment(client, existing);
        if (existing.payment_status === 'paid' || existing.status === 'complete') {
          await client.query('COMMIT');
          return res.json({ orderId: key, status: 'confirming' });
        }
        if (existing.status === 'expired') {
          await client.query('COMMIT');
          return res.status(409).json({ error: 'That payment session expired. Your bag is saved; click continue again for a fresh checkout.' });
        }
      }
      let url = saved.stripe_url;
      if (!saved.stripe_session_id) {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: email,
          client_reference_id: key,
          metadata: { order_id: key },
          line_items: order.lines.map(p => ({ quantity: p.quantity, price_data: { currency: 'usd', unit_amount: p.price, tax_behavior: 'exclusive', product_data: { name: p.name, description: p.subtitle } } })),
          shipping_address_collection: { allowed_countries: ['US'] },
          shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: order.shipping, currency: 'usd' }, display_name: order.option.name, tax_behavior: 'exclusive' } }],
          automatic_tax: { enabled: automaticTax },
          success_url: `${webUrl}/order.html?order=${key}`,
          cancel_url: `${webUrl}/checkout.html?canceled=1`,
        }, { idempotencyKey: `orlast-${key}` });
        url = session.url;
        await client.query('UPDATE orders SET stripe_session_id=$2,stripe_url=$3 WHERE id=$1', [key, session.id, url]);
      }
      await client.query('COMMIT');
      res.json({ url, orderId: key });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });
  app.get('/api/orders/:id', limiter, async (req, res) => {
    const token = req.get('X-Order-Token') || '';
    if (!uuid.test(req.params.id) || !/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({ error: 'Order not found on this device.' });
    const { rows: [order] } = await db.query('SELECT * FROM orders WHERE id=$1 AND access_hash=$2', [req.params.id, hash(token)]);
    if (!order) return res.status(404).json({ error: 'Order not found on this device.' });
    if (stripe && order.status === 'pending' && order.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      await syncPayment(db, session);
    }
    const { rows: [updated] } = await db.query('SELECT id,status,total,items,shipping_method FROM orders WHERE id=$1', [order.id]);
    res.json({ order: updated });
  });
}
