import logging
import threading
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import connection
from django.utils import timezone

logger = logging.getLogger(__name__)


def _money(value):
    """40000 -> '40 000 FCFA' (décimales seulement si nécessaire)."""
    value = float(value)
    text = f"{value:,.0f}" if value.is_integer() else f"{value:,.2f}"
    return text.replace(",", " ") + " FCFA"


def _items_text(order):
    return "\n".join(
        f"  - {i.quantity} x {i.product_name} : {_money(i.unit_price * i.quantity)}"
        for i in order.items.all()
    )


def _admin_recipients():
    """ORDER_NOTIFY_EMAILS du .env, sinon les emails des comptes staff."""
    emails = list(settings.ORDER_NOTIFY_EMAILS)
    if emails:
        return emails
    User = get_user_model()
    return list(
        User.objects.filter(is_staff=True, is_active=True)
        .exclude(email="")
        .values_list("email", flat=True)
    )


def notify_new_order(order):
    """Envoie un email à l'admin et une confirmation au client.

    Ne lève jamais d'erreur : si l'envoi échoue (internet, SMTP...), la
    commande du client reste enregistrée et l'erreur est écrite dans le terminal.
    """
    shop = settings.SHOP_NAME
    date = timezone.localtime(order.created_at).strftime("%d/%m/%Y %H:%M")

    # --- 1. Email à l'admin ---
    try:
        recipients = _admin_recipients()
        if not recipients:
            logger.warning(
                "Commande #%s : aucun email admin. Renseigne ORDER_NOTIFY_EMAILS "
                "dans le .env ou ajoute un email au compte administrateur.", order.id
            )
        else:
            send_mail(
                subject=f"[{shop}] Nouvelle commande #{order.id} : {_money(order.total)}",
                message=(
                    f"Nouvelle commande #{order.id}\n\n"
                    f"Client : {order.guest_name or 'Invité'}\n"
                    f"Email : {order.guest_email or '—'}\n"
                    f"Telephone : {order.guest_phone or '-'}\n"
                    f"Adresse : {order.guest_address or '-'}\n"
                    f"Date : {date}\n\n"
                    f"Articles :\n{_items_text(order)}\n\n"
                    f"Total : {_money(order.total)}\n\n"
                    f"Gérer cette commande : {settings.DASHBOARD_URL}\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
            )
    except Exception:
        logger.exception("Échec de l'email admin pour la commande #%s", order.id)

    # --- 2. Confirmation au client (s'il a donné son email) ---
    if order.guest_email:
        try:
            send_mail(
                subject=f"{shop} : confirmation de votre commande #{order.id}",
                message=(
                    f"Bonjour {order.guest_name or ''},\n\n"
                    f"Merci pour votre commande chez {shop} ! Elle a bien été enregistrée.\n\n"
                    f"Commande #{order.id} du {date}\n"
                    + (f"Adresse de livraison : {order.guest_address}\n" if order.guest_address else "")
                    + f"Articles :\n{_items_text(order)}\n\n"
                    f"Total : {_money(order.total)}\n\n"
                    f"Nous reviendrons vers vous rapidement pour la suite de votre commande.\n\n"
                    f"{shop}\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[order.guest_email],
            )
        except Exception:
            logger.exception("Échec de l'email de confirmation pour la commande #%s", order.id)

def notify_new_order_async(order):
    """Version asynchrone de notify_new_order() pour ne pas bloquer la réponse HTTP."""
    if not settings.EMAIL_IN_BACKGROUND:
        notify_new_order(order)
        return
    
    def run():
        try:
            notify_new_order(order)
        finally:
            connection.close()  # ferme la connexion DB pour éviter les fuites de connexions
    threading.Thread(target=run, daemon=True).start()