import os

from django.conf import settings
from django.core.exceptions import ValidationError

def validate_video_extension(f):
    """Accepte uniquement les formats lus par tous les navigateurs: .mp4 ou .webm. """
    ext = os.path.splitext(f.name)[1].lower()
    if ext not in (".mp4", ".webm"):
        raise ValidationError("Format non accepte. utilise un fichier .mp4 ou .webm.")

def validate_dideo_size(f):
    """Accepte uniquement les fichiers < 50 Mo."""
    max_mb = getattr(settings, "PRODUCT_VIDEO_MAX_MB", 50)
    if f.size > max_mb * 1024 * 1024:
        raise ValidationError(
            f"Fichier trop volumineux. Taille maximale: ({ f.size / 1024 / 1024:.1f} Mo.). maximum : {max_mb} Mo.")