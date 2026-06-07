# Sanguichería · Sistema de Notificaciones

Detecta transferencias recibidas en BancoEstado y envía un comprobante
formateado al WhatsApp de papá/abuela en tiempo real.

---

## Cómo funciona

```
Email BancoEstado → Gmail de papá → Reenvío automático → Mailparser.io
→ Webhook (este servidor) → Parser extrae datos → Evolution API → WhatsApp ✅
```

---

## Paso 1 · Configurar reenvío de Gmail

1. Abre Gmail de papá → Configuración → "Ver toda la configuración"
2. Ve a la pestaña **Filtros y direcciones bloqueadas**
3. Crea un filtro:
   - **De:** `noreply@correo.bancoestado.cl`
   - **Asunto:** `Aviso de envío o recepción de dinero`
4. Acción: **Reenviar a** → (la dirección que da Mailparser en el paso 2)

---

## Paso 2 · Configurar Mailparser.io

1. Crea cuenta gratuita en https://mailparser.io
2. Crea una nueva "Mailbox" → copia la dirección de email que te da
3. Pega esa dirección en el filtro de Gmail del paso 1
4. En Mailparser, configura el Webhook:
   - URL: `https://TU-APP.railway.app/webhook/email`
   - Formato: **Text body** (texto plano del email)
   - Method: POST

---

## Paso 3 · Desplegar Evolution API en Railway

1. Ve a https://railway.app → New Project → "Deploy from template"
2. Busca **"Evolution API"** → Deploy
3. Una vez desplegado, abre la URL de tu app
4. Ve a `/manager` → crea una instancia llamada `sanguicheria`
5. Escanea el QR con el WhatsApp de papá (solo una vez)
6. Copia la API Key desde la configuración

---

## Paso 4 · Desplegar este servidor en Railway

1. Sube este proyecto a GitHub (repositorio privado)
2. En Railway → New Project → "Deploy from GitHub repo"
3. Selecciona el repositorio
4. Ve a Variables de entorno y agrega:

```
EVOLUTION_URL      = https://tu-evolution.railway.app
EVOLUTION_INSTANCE = sanguicheria
EVOLUTION_API_KEY  = tu-api-key
WHATSAPP_NUMEROS   = 56912345678
PORT               = 3000
```

5. Railway despliega automáticamente → copia la URL pública

---

## Paso 5 · Probar el sistema

Usa el endpoint de prueba para verificar que todo funciona antes
de recibir una transferencia real:

```bash
curl -X POST https://TU-APP.railway.app/test
```

Deberías recibir en WhatsApp:

```
✅ ¡TRANSFERENCIA RECIBIDA!
━━━━━━━━━━━━━━━━━

💰 Monto:  $5.500
👤 De:  Cliente Prueba
📅 Fecha:  03/06/2026
🕐 Hora:  14:32:00 hrs
🔢 N° Operación: 1234567
💬 Mensaje: Sandwich completo

━━━━━━━━━━━━━━━━━
Notificación automática · Sanguichería
```

---

## Agregar la abuela

En el archivo `.env`, agrega su número separado por coma:

```
WHATSAPP_NUMEROS=56912345678,56987654321
```

---

## Costos

| Servicio       | Plan          | Costo      |
|----------------|---------------|------------|
| Railway        | Hobby (5$/mes) o Free trial | ~$0–5/mes |
| Mailparser.io  | Free (30 emails/mes) | $0         |
| Evolution API  | Auto-hospedado | $0         |
| **Total**      |               | **~$0–5/mes** |

> Para más de 30 transferencias al mes en Mailparser, usar el plan Starter ($9/mes)
> o reemplazar Mailparser por el módulo de email directo de Make (gratuito).

---

## Estructura del proyecto

```
sanguicheria/
├── src/
│   └── index.js          ← Servidor principal
├── config/
│   └── .env.example      ← Variables de entorno (copiar a .env)
├── package.json
└── README.md
```
