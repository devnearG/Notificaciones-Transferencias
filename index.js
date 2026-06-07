const express = require('express');
const axios = require('axios');
const { simpleParser } = require('mailparser');
const { JSDOM } = require('jsdom');
require('dotenv').config({ path: '../config/.env' });

const app = express();
app.use(express.json());
app.use(express.raw({ type: 'message/rfc822', limit: '10mb' }));
app.use(express.text({ type: ['text/plain', 'text/html'], limit: '10mb' }));

// ─── Validación de token secreto ─────────────────────────────────────────────

function validarToken(req, res, next) {
  const token = req.headers['x-webhook-secret'];
  if (!token || token !== process.env.WEBHOOK_SECRET) {
    console.log('⛔ Acceso rechazado - token inválido');
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ─── Parser BancoEstado (texto plano) ────────────────────────────────────────

function parsearBancoEstado(texto) {
  const r = { banco: 'BancoEstado', fecha: null, hora: null, remitente: null, monto: null, numeroOperacion: null, comentario: null, valido: false };
  if (!texto.includes('Transferencia Electronica de Fondos')) return r;
  const fechaM = texto.match(/hoy\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i);
  if (fechaM) { r.fecha = fechaM[1]; r.hora = fechaM[2]; }
  const remM = texto.match(/de nuestro\(a\) cliente\s+(.+?),\s+con los siguientes datos/i);
  if (remM) r.remitente = remM[1].trim();
  const montoM = texto.match(/Monto transferido:\s*\n\s*(\$[\d.]+)/i);
  if (montoM) r.monto = montoM[1].trim();
  const opM = texto.match(/N[uú]mero de Operaci[oó]n[:\s]+(\d+)/i);
  if (opM) r.numeroOperacion = opM[1].trim();
  const comM = texto.match(/Comentario[:\s]+(.+?)(?:\n|$)/i);
  if (comM) r.comentario = comM[1].trim();
  r.valido = !!(r.monto && r.fecha);
  return r;
}

// ─── Parser Banco de Chile (HTML) ────────────────────────────────────────────

function parsearBancoChile(html) {
  const r = { banco: 'Banco de Chile', fecha: null, hora: null, remitente: null, monto: null, numeroOperacion: null, comentario: null, valido: false };
  if (!html.includes('bancochile')) return r;
  try {
    const dom = new JSDOM(html);
    const texto = dom.window.document.body.textContent;
    const remM = html.match(/cliente <b>([^<]+)<\/b> ha efectuado/i);
    if (remM) r.remitente = remM[1].trim();
    const montoM = texto.match(/\$[\d.,]+/g);
    if (montoM) r.monto = montoM[0].trim();
    const fechaM = texto.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (fechaM) r.fecha = fechaM[1];
    const horaM = texto.match(/\d{4}\s+(\d{2}:\d{2})/);
    if (horaM) r.hora = horaM[1];
    const txM = texto.match(/TEF[A-Z0-9]{20,}/);
    if (txM) r.numeroOperacion = txM[0].trim();
    r.valido = !!(r.monto && r.fecha);
  } catch (e) {
    console.error('Error parseando Banco de Chile:', e.message);
  }
  return r;
}

// ─── Detectar banco y parsear ─────────────────────────────────────────────────

function parsearEmail(contenido) {
  if (contenido.includes('Transferencia Electronica de Fondos')) return parsearBancoEstado(contenido);
  if (contenido.includes('bancochile')) return parsearBancoChile(contenido);
  return { valido: false };
}

// ─── Formatear mensaje WhatsApp ───────────────────────────────────────────────

function formatearMensaje(d) {
  const comentario = d.comentario && d.comentario !== 'Sin mensaje' ? `\n💬 *Mensaje:* ${d.comentario}` : '';
  const operacion = d.numeroOperacion ? `\n🔢 *N° Comprobante:* ${d.numeroOperacion}` : '';
  const remitente = d.remitente ? `\n👤 *De:*  ${d.remitente}` : '';
  return `✅ *¡TRANSFERENCIA RECIBIDA!*
━━━━━━━━━━━━━━━━━

💰 *Monto:*  ${d.monto}
${remitente}
🏦 *Banco:*  ${d.banco}

📅 *Fecha:*  ${d.fecha}

🕐 *Hora:*  ${d.hora} hrs${operacion}${comentario}

━━━━━━━━━━━━━━━━━
_Notificación automática · Sanguichería_`.trim();
}

// ─── Enviar WhatsApp ──────────────────────────────────────────────────────────

async function enviarWhatsApp(numero, mensaje) {
  const url = `${process.env.EVOLUTION_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
  const response = await axios.post(url, { number: numero, text: mensaje }, {
    headers: { apikey: process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return response.data;
}

// ─── Webhook (protegido con token) ───────────────────────────────────────────

app.post('/webhook/email', validarToken, async (req, res) => {
  try {
    let contenido = '';
    if (typeof req.body === 'string') {
      contenido = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      const parsed = await simpleParser(req.body);
      contenido = parsed.html || parsed.text || '';
    } else if (req.body?.html) {
      contenido = req.body.html;
    } else if (req.body?.text) {
      contenido = req.body.text;
    }

    if (!contenido) return res.status(400).json({ error: 'Sin contenido' });

    const datos = parsearEmail(contenido);
    if (!datos.valido) {
      console.log('Email ignorado, no es transferencia reconocida.');
      return res.status(200).json({ status: 'ignorado' });
    }

    console.log('✅ Transferencia detectada:', datos);
    const mensaje = formatearMensaje(datos);
    const numeros = process.env.WHATSAPP_NUMEROS.split(',').map(n => n.trim());
    for (const numero of numeros) {
      await enviarWhatsApp(numero, mensaje);
      console.log(`📲 Enviado a ${numero}`);
    }
    return res.status(200).json({ status: 'ok', transferencia: datos });
  } catch (error) {
    console.error('❌ Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Health (público) ─────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'Sanguichería · Notificaciones', timestamp: new Date().toISOString() });
});

// ─── Test (protegido con token) ───────────────────────────────────────────────

app.post('/test', validarToken, async (req, res) => {
  const datos = {
    banco: 'BancoEstado',
    fecha: '27/04/2025',
    hora: '20:19:51',
    remitente: 'Marta Elena',
    monto: '$50.000',
    numeroOperacion: '8017800',
    comentario: null,
    valido: true,
  };
  const mensaje = formatearMensaje(datos);
  try {
    const numeros = process.env.WHATSAPP_NUMEROS.split(',').map(n => n.trim());
    for (const numero of numeros) await enviarWhatsApp(numero, mensaje);
    res.json({ status: 'ok', mensaje });
  } catch (error) {
    res.status(500).json({ error: error.message, mensaje });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📧 Webhook: POST /webhook/email (protegido)`);
  console.log(`🏥 Health:  GET  /health (público)`);
  console.log(`🧪 Test:    POST /test (protegido)`);
});