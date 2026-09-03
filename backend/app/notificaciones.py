"""Envío de notificaciones por mail.

Por ahora el envío está SIMULADO: en vez de mandar el mail, lo imprime en la
consola del backend. Toda la lógica del sistema (generar el token, validarlo,
cambiar la contraseña) funciona igual.

El día que queramos mandar mails de verdad, se cambia SOLO el cuerpo de
enviar_mail(): ningún otro archivo se entera. Este módulo también va a ser el
que mande las notificaciones automáticas de OT correctivas a Bioingeniería.
"""

# TODO (envío real de mail): cuando salgamos de modo simulado hay que
#   1. reemplazar el cuerpo de enviar_mail() por el envío por SMTP, y
#   2. cambiar el localhost:5173 de este link por la dirección real del
#      frontend (moverlo a config.py como variable de entorno).

def enviar_mail(destinatario: str, asunto: str, cuerpo: str) -> None:
    """Manda un mail. (Modo simulado: lo escribe en la consola.)"""
    print("\n" + "=" * 60)
    print(f"MAIL SIMULADO → {destinatario}")
    print(f"Asunto: {asunto}")
    print("-" * 60)
    print(cuerpo)
    print("=" * 60 + "\n")


def mail_recuperacion(usuario, token: str) -> None:
    """Arma y envía el mail de recuperación de contraseña."""
    link = f"http://localhost:5173/restablecer?token={token}"
    cuerpo = (
        f"Hola {usuario.nombre},\n\n"
        "Recibimos un pedido para restablecer tu contraseña de SYNAP.\n"
        f"Entrá acá para elegir una nueva:\n\n{link}\n\n"
        "El enlace vence en 1 hora y se puede usar una sola vez.\n"
        "Si no pediste esto, ignorá el mail: tu contraseña no cambió.\n"
    )
    enviar_mail(usuario.email, "Restablecer tu contraseña de SYNAP", cuerpo)
    
