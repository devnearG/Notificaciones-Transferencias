# 🏦 Sistema de Notificaciones · BancoEstado

Servicio backend diseñado para detectar de forma automatizada las transferencias recibidas en **BancoEstado** (Chile) y enviar un comprobante formateado a través de **WhatsApp** en tiempo real.

---

## 🧭 ¿Cómo funciona?

El sistema opera mediante una cadena de integración continua basada en eventos:

1. **Recepción:** El correo de notificación de BancoEstado llega alfanuméricamente a una bandeja de entrada.
2. **Procesamiento (Parsing):** Un servicio externo analiza el correo electrónico (cuerpo de texto plano) para extraer los datos clave de la transferencia (monto, emisor, fecha, hora, número de operación y glosa).
3. **Webhook:** El parser envía los datos extraídos mediante una petición HTTP POST a este servidor.
4. **Notificación:** El servidor procesa la información y utiliza una instancia de **Evolution API** para despachar una alerta estructurada directamente a uno o más números de WhatsApp autorizados.

---

## 🔒 Consideraciones de Seguridad y Privacidad

* **Variables de Entorno:** Las credenciales sensibles (tokens de Evolution API, URLs de servidores y lista de números permitidos) se gestionan exclusivamente mediante variables de entorno (`.env`), evitando su exposición en el código fuente.
* **Control de Destinatarios:** El sistema valida los números receptores definidos en la configuración para restringir el envío de información financiera sensible únicamente a los contactos autorizados.

---

## 📊 Requisitos del Sistema (Stack Tecnológico)

* **Runtime:** Node.js
* **Procesamiento de Correo:** Mailparser.io (o equivalente)
* **Pasarela de Mensajería:** Evolution API (Auto-hospedado)
* **Hosting / Despliegue:** Railway (o cualquier proveedor compatible con Node.js y Webhooks)

---

## 📁 Estructura del Proyecto

```text
notificaciones-bancoestado/
├── src/
│   └── index.js         ← Servidor principal, manejo de endpoints y lógica de formateo
├── config/
│   └── .env.example     ← Plantilla de variables de entorno requeridas
├── package.json
└── README.md
