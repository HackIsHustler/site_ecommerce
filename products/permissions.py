from rest_framework import permissions


class IsStaffOrReadOnly(permissions.BasePermission):
    """Lecture pour tout le monde, écriture réservée au personnel (is_staff).

    Sans ça, n'importe quel visiteur qui crée un compte via /api/auth/register/
    pourrait ajouter, modifier ou supprimer des produits.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
