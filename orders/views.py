from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, permissions, status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from products.models import Category, Product
from products.views import StandardPagination
from .models import Cart, CartItem, Order, OrderItem
from .notifications import notify_new_order_async
from .serializers import CartSerializer, OrderSerializer


class CartDetailView(APIView):
    """GET /api/cart/<token>/ -> récupère (ou crée) le panier pour ce token.
    Le token est généré côté frontend (localStorage) : pas besoin de compte."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        cart, _ = Cart.objects.get_or_create(token=token)
        return Response(CartSerializer(cart).data)


class CartItemsView(APIView):
    """POST /api/cart/<token>/items/  body: {product: <id>, quantity: <n>}
    Ajoute un produit au panier (incrémente si déjà présent)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request, token):
        cart, _ = Cart.objects.get_or_create(token=token)
        product_id = request.data.get("product")
        try:
            quantity = int(request.data.get("quantity", 1))
        except (TypeError, ValueError):
            return Response({"detail": "quantity invalide."}, status=400)
        if quantity <= 0:
            return Response({"detail": "quantity doit être > 0."}, status=400)

        product = get_object_or_404(Product, pk=product_id, is_active=True)

        item, created = CartItem.objects.get_or_create(
            cart=cart, product=product, defaults={"quantity": quantity}
        )
        if not created:
            item.quantity += quantity
            item.save()
        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    """PATCH /api/cart/<token>/items/<product_id>/  body: {quantity: <n>} (0 = supprime)
    DELETE /api/cart/<token>/items/<product_id>/"""
    permission_classes = [permissions.AllowAny]

    def patch(self, request, token, product_id):
        cart = get_object_or_404(Cart, token=token)
        item = get_object_or_404(CartItem, cart=cart, product_id=product_id)
        try:
            quantity = int(request.data.get("quantity", item.quantity))
        except (TypeError, ValueError):
            return Response({"detail": "quantity invalide."}, status=400)

        if quantity <= 0:
            item.delete()
        else:
            item.quantity = quantity
            item.save()
        return Response(CartSerializer(cart).data)

    def delete(self, request, token, product_id):
        cart = get_object_or_404(Cart, token=token)
        CartItem.objects.filter(cart=cart, product_id=product_id).delete()
        return Response(CartSerializer(cart).data)


class CheckoutView(APIView):
    """POST /api/cart/<token>/checkout/  body: {guest_name, guest_email}
    Transforme le panier en commande (Order + OrderItems), décrémente le
    stock, puis vide le panier."""
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, token):
        cart = get_object_or_404(Cart, token=token)
        items = list(cart.items.select_related("product").all())
        if not items:
            return Response({"detail": "Le panier est vide."}, status=400)

        for item in items:
            if item.product.stock < item.quantity:
                return Response(
                    {"detail": f"Stock insuffisant pour « {item.product.name} » "
                               f"(disponible : {item.product.stock})."},
                    status=400,
                )

        user = request.user if request.user.is_authenticated else None
        order = Order.objects.create(
            user=user,
            guest_name=request.data.get("guest_name", ""),
            guest_email=request.data.get("guest_email", ""),
            guest_phone=str(request.data.get("guest_phone", "")).strip()[:30],
            guest_address=str(request.data.get("guest_address", "")).strip()[:300],
            total=cart.total(),
        )
        for item in items:
            OrderItem.objects.create(
                order=order,
                product=item.product,
                product_name=item.product.name,
                unit_price=item.product.price,
                quantity=item.quantity,
            )
            item.product.stock -= item.quantity
            item.product.save(update_fields=["stock"])

        cart.items.all().delete()
        transaction.on_commit(lambda: notify_new_order_async(order))
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


LOW_STOCK_THRESHOLD = 5


class OrderListView(generics.ListAPIView):
    """GET /api/orders/ -> liste des commandes (réservé au personnel).
    Filtres : ?status=pending|paid|cancelled  ?search=<nom ou email>  ?page=<n>"""
    permission_classes = [IsAdminUser]
    serializer_class = OrderSerializer
    queryset = Order.objects.prefetch_related("items").order_by("-created_at")
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["status"]
    search_fields = ["guest_name", "guest_email", "guest_phone"]


class OrderDetailView(APIView):
    """Réservé au personnel (une commande contient nom et email du client).

    GET   /api/orders/<id>/            -> détail
    PATCH /api/orders/<id>/ {status}   -> change le statut. Annuler une commande
    remet les articles en stock ; la réactiver les retire à nouveau du stock."""
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        order = get_object_or_404(Order.objects.prefetch_related("items"), pk=pk)
        return Response(OrderSerializer(order).data)

    @transaction.atomic
    def patch(self, request, pk):
        order = get_object_or_404(Order.objects.prefetch_related("items"), pk=pk)
        new_status = request.data.get("status")
        if new_status not in dict(Order.STATUS_CHOICES):
            return Response({"detail": "Statut invalide."}, status=400)

        old_status = order.status
        if new_status != old_status:
            items = list(order.items.select_related("product"))
            if new_status == "cancelled":
                for item in items:
                    if item.product:
                        item.product.stock += item.quantity
                        item.product.save(update_fields=["stock"])
            elif old_status == "cancelled":
                for item in items:
                    if item.product and item.product.stock < item.quantity:
                        return Response(
                            {"detail": f"Stock insuffisant pour « {item.product_name} » : "
                                       f"impossible de réactiver la commande."},
                            status=400,
                        )
                for item in items:
                    if item.product:
                        item.product.stock -= item.quantity
                        item.product.save(update_fields=["stock"])
            order.status = new_status
            order.save(update_fields=["status"])
        return Response(OrderSerializer(order).data)


class DashboardStatsView(APIView):
    """GET /api/dashboard/stats/ -> chiffres clés pour la page d'accueil du dashboard."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        orders = Order.objects.all()
        total_of = lambda st: "%.2f" % (orders.filter(status=st).aggregate(t=Sum("total"))["t"] or 0)
        low = Product.objects.filter(is_active=True, stock__lte=LOW_STOCK_THRESHOLD).select_related("category").order_by("stock", "name")[:8]
        return Response({
            "products": Product.objects.count(),
            "active_products": Product.objects.filter(is_active=True).count(),
            "categories": Category.objects.count(),
            "orders": orders.count(),
            "revenue": total_of("paid"),
            "pending_amount": total_of("pending"),
            "orders_by_status": {st: orders.filter(status=st).count() for st, _ in Order.STATUS_CHOICES},
            "low_stock_threshold": LOW_STOCK_THRESHOLD,
            "low_stock": [{"id": p.id, "name": p.name, "stock": p.stock, "category_name": p.category.name if p.category else ""} for p in low],
            "recent_orders": OrderSerializer(orders.prefetch_related("items").order_by("-created_at")[:5], many=True).data,
        })
