const express = require('express');
const axios = require('axios');
const { simpleParser } = require('mailparser');
require('dotenv').config({ path: '../config/.env' });

const app = express();
app.use(express.json());
app.use(express.raw({ type: 'message/rfc822', limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

// ─── Parser del email de BancoEstado ─────────────────────────────────────────

function parsearEmailBancoEstado(textoPlano) {
  const resultado = {
    fecha: null,
    hora: null,
    remitente: null,
    monto: null,
    numeroOperacion: null,
    comentario: null,
    valido: false,
  };

  // Verifica que sea un email de BancoEstado TEF
  if (!textoPlano.includes('Transferencia Electronica de Fondos')) {
    return resultado;
  }

  // Fecha y hora: "hoy 27/04/2025 20:19:51"
  const fechaMatch = textoPlano.match(
    /hoy\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i
  );
  if (fechaMatch) {
    resultado.fecha = fechaMatch[1];
    resultado.hora = fechaMatch[2];
  }

  // Remitente: "de nuestro(a) cliente NOMBRE, con"
  const remitenteMatch = textoPlano.match(
    /de nuestro\(a\) cliente\s+(.+?),\s+con los siguientes datos/i
  );
  if (remitenteMatch) {
    resultado.remitente = remitenteMatch[1].trim();
  }

  // Monto: "$50.000"
  const montoMatch = textoPlano.match(/Monto transferido:\s*\n\s*(\$[\d.]+)/i);
  if (montoMatch) {
    resultado.monto = montoMatch[1].trim();
  }

  // Número de operación
  const opMatch = textoPlano.match(/N[uú]mero de Operaci[oó]n[:\s]+(\d+)/i);
  if (opMatch) {
    resultado.numeroOperacion = opMatch[1].trim();
  }

  // Comentario
  const comentMatch = textoPlano.match(/Comentario[:\s]+(.+?)(?:\n|$)/i);
  if (comentMatch) {
    resultado.comentario = comentMatch[1].trim();
  }

  // Solo es válido si tenemos los campos mínimos
  resultado.valido = !!(resultado.monto && resultado.remitente && resultado.fecha);
  return resultado;
}

// ─── Formatear mensaje WhatsApp ───────────────────────────────────────────────

function formatearMensajeWhatsApp(datos) {
  const comentario =
    datos.comentario && datos.comentario !== 'Sin mensaje'
      ? `\n💬 *Mensaje:* ${datos.comentario}`
      : '';

  const operacion = datos.numeroOperacion
    ? `\n🔢 *N° Operación:* ${datos.numeroOperacion}`
    : '';

  return `✅ *¡TRANSFERENCIA RECIBIDA!*
━━━━━━━━━━━━━━━━━

💰 *Monto:*  ${datos.monto}

👤 *De:*  ${datos.remitente}

📅 *Fecha:*  ${datos.fecha}

🕐 *Hora:*  ${datos.hora} hrs${operacion}${comentario}

━━━━━━━━━━━━━━━━━
_Notificación automática · Sanguichería_`.trim();
}

// ─── Enviar mensaje por Evolution API ────────────────────────────────────────

async function enviarWhatsApp(numero, mensaje) {
  const url = `${process.env.EVOLUTION_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;

  const response = await axios.post(
    url,
    { number: numero, text: mensaje },
    {
      headers: {
        apikey: process.env.EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  return response.data;
}

// ─── Webhook principal (recibe el email desde Mailparser o Make) ──────────────

app.post('/webhook/email', async (req, res) => {
  try {
    let textoPlano = '';

    // Acepta tanto texto plano directo como .eml completo
    if (typeof req.body === 'string') {
      textoPlano = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      const parsed = await simpleParser(req.body);
      textoPlano = parsed.text || '';
    } else if (req.body && req.body.text) {
      // JSON desde Mailparser.io o Make
      textoPlano = req.body.text;
    }

    if (!textoPlano) {
      return res.status(400).json({ error: 'No se recibió contenido de email' });
    }

    const datos = parsearEmailBancoEstado(textoPlano);

    if (!datos.valido) {
      console.log('Email recibido pero no es una TEF de BancoEstado, ignorando.');
      return res.status(200).json({ status: 'ignorado', razon: 'no es TEF BancoEstado' });
    }

    console.log('✅ Transferencia detectada:', datos);

    const mensaje = formatearMensajeWhatsApp(datos);

    // Enviar al número de papá (y opcionalmente a abuela)
    const numeros = process.env.WHATSAPP_NUMEROS.split(',').map(n => n.trim());

    for (const numero of numeros) {
      await enviarWhatsApp(numero, mensaje);
      console.log(`📲 Mensaje enviado a ${numero}`);
    }

    return res.status(200).json({
      status: 'ok',
      transferencia: datos,
      destinatarios: numeros.length,
    });

  } catch (error) {
    console.error('❌ Error en webhook:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Health check (para Railway/Render) ──────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    servicio: 'Sanguichería · Notificaciones',
    timestamp: new Date().toISOString(),
  });
});

// ─── Endpoint de prueba manual ────────────────────────────────────────────────

app.post('/test', async (req, res) => {
  const datosPrueba = {
    fecha: '03/06/2026',
    hora: '14:32:00',
    remitente: 'Cliente Prueba',
    monto: '$5.500',
    numeroOperacion: '1234567',
    comentario: 'Sandwich completo',
    valido: true,
  };

  const mensaje = formatearMensajeWhatsApp(datosPrueba);

  try {
    const numeros = process.env.WHATSAPP_NUMEROS.split(',').map(n => n.trim());
    for (const numero of numeros) {
      await enviarWhatsApp(numero, mensaje);
    }
    res.json({ status: 'ok', mensaje });
  } catch (error) {
    res.status(500).json({ error: error.message, mensaje });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📧 Webhook: POST /webhook/email`);
  console.log(`🏥 Health:  GET  /health`);
  console.log(`🧪 Test:    POST /test`);
});
