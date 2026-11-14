from django.urls import path
from .views import (CartDetailView, CartItemsView, CartItemDetailView, CheckoutView,
                    OrderListView, OrderDetailView, DashboardStatsView)

urlpatterns = [
    path("cart/<uuid:token>/", CartDetailView.as_view(), name="cart-detail"),
    path("cart/<uuid:token>/items/", CartItemsView.as_view(), name="cart-items"),
    path("cart/<uuid:token>/items/<int:product_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
    path("cart/<uuid:token>/checkout/", CheckoutView.as_view(), name="cart-checkout"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<int:pk>/", OrderDetailView.as_view(), name="order-detail"),
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
]
