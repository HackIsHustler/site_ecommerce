from rest_framework import viewsets, filters
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend

from .models import Category, Product
from .permissions import IsStaffOrReadOnly
from .serializers import CategorySerializer, ProductSerializer


class StandardPagination(PageNumberPagination):
    """10 résultats par page par défaut, modifiable avec ?page_size=20 (max 100)."""
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class CategoryViewSet(viewsets.ModelViewSet):
    """
    CRUD sur les catégories.
    Lecture libre, écriture réservée au personnel.
    Pas de pagination : on renvoie toutes les catégories (menu latéral, filtres).
    """
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrReadOnly]
    pagination_class = None


class ProductViewSet(viewsets.ModelViewSet):
    """
    CRUD sur les produits.
    - GET : accessible à tout le monde
    - POST/PUT/PATCH/DELETE : réservé au personnel

    Filtres : ?category=<id>  ?is_active=true|false  ?search=<texte>
              ?ordering=price|-price|stock|created_at|-created_at
              ?page=<n>  ?page_size=<n>
    """
    queryset = Product.objects.select_related("category", "created_by").all()
    serializer_class = ProductSerializer
    permission_classes = [IsStaffOrReadOnly]
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["price", "stock", "created_at"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
