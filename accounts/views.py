from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import RegisterSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/  -> crée un nouvel utilisateur"""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(APIView):
    """GET /api/auth/me/  -> infos de l'utilisateur connecté (nécessite un token JWT)"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ {old_password, new_password}
        -> change le mot de passe de l'utilisateur connecté"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        old = str(request.data.get("old_password") or "")
        new = str(request.data.get("new_password") or "")
        user = request.user

        if not user.check_password(old):
            return Response({"detail": "Ancien mot de passe incorrect."}, status=400)
        if new == old:
            return Response({"detail": "Le nouveau mot de passe doit être différent de l\'ancien."}, status=400)
        try:
            validate_password(new, user)
        except DjangoValidationError as e:
            return Response({"detail": " ".join(e.messages)}, status=400)

        user.set_password(new)
        user.save(update_fields=["password"])
        return Response({"detail": "Mot de passe changé avec succès."})