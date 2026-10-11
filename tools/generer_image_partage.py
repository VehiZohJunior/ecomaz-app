"""Construit landing/partage.png (1200 × 630), l'image affichée quand on
partage la page de présentation sur WhatsApp, Facebook, LinkedIn…

Couleurs de la charte EcoMaZ (ecomaz-tokens.css). Police : Segoe UI (Windows).
Usage : python tools/generer_image_partage.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERT, OR, TEXTE_CLAIR = (20, 57, 45), (232, 176, 75), (207, 227, 218)
POLICES = r'C:\Windows\Fonts'

def police(nom, taille):
    return ImageFont.truetype(os.path.join(POLICES, nom), taille)

img = Image.new('RGB', (1200, 630), VERT)
d = ImageDraw.Draw(img)

# Bande dorée à gauche + halo discret à droite
d.rectangle([0, 0, 16, 630], fill=OR)
halo = Image.new('L', (1200, 630), 0)
ImageDraw.Draw(halo).ellipse([820, -180, 1420, 420], fill=22)
img.paste(Image.new('RGB', (1200, 630), OR), (0, 0), halo)

d.text((92, 84), 'EcoMaZ', font=police('segoeuib.ttf', 110), fill=(255, 255, 255))
d.rectangle([98, 226, 218, 232], fill=OR)
d.text((96, 250), 'Gestion scolaire, de la garderie à l’université', font=police('segoeui.ttf', 38), fill=TEXTE_CLAIR)

points = ['Présences en temps réel', 'Parents prévenus aussitôt', 'Paiement Mobile Money', 'Comptabilité SYSCOHADA']
y = 340
for i, p in enumerate(points):
    x = 96 if i % 2 == 0 else 640
    if i == 2: y += 70
    d.ellipse([x, y + 14, x + 18, y + 32], fill=OR)
    d.text((x + 34, y), p, font=police('segoeuisl.ttf', 34), fill=(255, 255, 255))

d.text((96, 540), 'Conçu à Abidjan · Côte d’Ivoire', font=police('segoeuib.ttf', 30), fill=OR)

sortie = os.path.join(RACINE, 'landing', 'partage.png')
img.save(sortie, optimize=True)
print(sortie, os.path.getsize(sortie), 'octets')
