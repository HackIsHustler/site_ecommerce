from rest_framework import serializers
from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(source="products.count", read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "products_count", "created_at"]
        read_only_fields = ["slug", "created_at"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "description", "price", "stock",
            "category", "category_name", "image", "video", "is_active",
            "created_by", "created_by_username", "created_at", "updated_at",
        ]
        read_only_fields = ["slug", "created_by", "created_at", "updated_at"]
        extra_kwargs = {"is_active": {"default": True}}

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Le prix doit être supérieur à 0.")
        return value
