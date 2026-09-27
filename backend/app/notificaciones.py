"""Envío de notificaciones por mail.

enviar_mail() manda de verdad por SMTP (hoy: el relay gratuito de Brevo) si
hay credenciales cargadas en el .env (smtp_user/smtp_password en config.py).
Si NO hay credenciales — por ejemplo en la compu de una compañera que todavía
no se armó su cuenta de Brevo — cae sola a modo SIMULADO: imprime el mail en
la consola del backend en vez de mandarlo, para que el resto del sistema
(generar el token, validarlo, cambiar la contraseña, etc.) siga funcionando
igual sin que haga falta configurar nada para poder probar.

Dos formas de mandar un mail desde acá:
  - mail_recuperacion(usuario, token): va al mail PERSONAL de ese usuario.
  - notificar_bioingenieria(asunto, cuerpo): va a la casilla FIJA de
    notificaciones (config.email_notificaciones) — la usan los avisos
    automáticos del sistema (OT correctiva, stock crítico, MP por vencer),
    donde no importa quién dispara el evento, siempre llega al mismo lugar.
"""

import smtplib
from email.mime.text import MIMEText

from .config import settings

# TODO: cuando el frontend tenga una URL pública de verdad (hoy corre en
# localhost:5173 en la compu de cada una), mover esto a config.py como
# variable de entorno igual que el resto de los datos sensibles.
URL_FRONTEND = "http://localhost:5173"


def enviar_mail(destinatario: str, asunto: str, cuerpo: str) -> None:
    """Manda un mail por SMTP. Si no hay credenciales configuradas en el
    .env, lo imprime en la consola en vez de mandarlo (modo simulado)."""
    if not settings.smtp_user or not settings.smtp_password:
        print("\n" + "=" * 60)
        print(f"MAIL SIMULADO → {destinatario}  (falta SMTP_USER/SMTP_PASSWORD en el .env)")
        print(f"Asunto: {asunto}")
        print("-" * 60)
        print(cuerpo)
        print("=" * 60 + "\n")
        return

    # El remitente ("From") tiene que ser una dirección VERIFICADA en Brevo,
    # no necesariamente el usuario SMTP con el que nos logueamos. Si no se
    # configuró un remitente aparte, usamos smtp_user como respaldo.
    remitente = settings.smtp_remitente or settings.smtp_user

    mensaje = MIMEText(cuerpo, "plain", "utf-8")
    mensaje["Subject"] = asunto
    mensaje["From"] = remitente
    mensaje["To"] = destinatario

    # Si el envío falla (SMTP caído, credenciales vencidas, etc.) lo dejamos
    # en el log del backend en vez de tirar un error 500 al usuario: una OT o
    # un ajuste de stock tienen que poder guardarse igual aunque el mail de
    # aviso no haya salido.
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as servidor:
            servidor.starttls()
            servidor.login(settings.smtp_user, settings.smtp_password)
            servidor.sendmail(remitente, [destinatario], mensaje.as_string())
    except Exception as error:  # noqa: BLE001 — cualquier falla de envío se loguea, no se propaga
        print(f"[notificaciones] No se pudo mandar el mail a {destinatario}: {error}")


def mail_recuperacion(usuario, token: str) -> None:
    """Arma y envía el mail de recuperación de contraseña (al mail personal
    del usuario, no a la casilla fija de notificaciones)."""
    link = f"{URL_FRONTEND}/restablecer?token={token}"
    cuerpo = (
        f"Hola {usuario.nombre},\n\n"
        "Recibimos un pedido para restablecer tu contraseña de SYNAP.\n"
        f"Entrá acá para elegir una nueva:\n\n{link}\n\n"
        "El enlace vence en 1 hora y se puede usar una sola vez.\n"
        "Si no pediste esto, ignorá el mail: tu contraseña no cambió.\n"
    )
    enviar_mail(usuario.email, "Restablecer tu contraseña de SYNAP", cuerpo)


def notificar_bioingenieria(asunto: str, cuerpo: str) -> None:
    """Manda un aviso automático del sistema a la casilla FIJA de
    notificaciones (config.email_notificaciones), no al mail de un usuario
    puntual. La usan los 3 disparadores: OT correctiva creada, stock
    crítico y MP próximo a vencer.

    Si todavía no se configuró EMAIL_NOTIFICACIONES en el .env, no manda
    nada (ni siquiera en modo simulado) — evita ensuciar la consola con
    avisos "a nadie" mientras se termina de armar la casilla.
    """
    if not settings.email_notificaciones:
        print(f"[notificaciones] EMAIL_NOTIFICACIONES no configurado — no se avisó: {asunto}")
        return
    enviar_mail(settings.email_notificaciones, f"SYNAP — {asunto}", cuerpo)