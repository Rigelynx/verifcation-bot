"""Render the shop's code-drawn headers. Pillow is needed only to regenerate assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'src/web/public/media'
S=2
def font(size,bold=False):
    candidates=[Path('C:/Windows/Fonts/bahnschrift.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
    return ImageFont.truetype(str(next(path for path in candidates if path.exists())),size*S)
def render(theme,accent,mark,title='INTENDENCIA',subtitle='EQUIPAMIENTO  /  LICENCIAS  /  SUMINISTROS',filename=None):
    image=Image.new('RGB',(1200*S,300*S),'#171b21');d=ImageDraw.Draw(image)
    def rect(box,fill):d.rectangle(tuple(round(v*S)for v in box),fill=fill)
    def line(points,fill,width=1):d.line([(x*S,y*S)for x,y in points],fill=fill,width=width*S)
    def text(x,y,value,size,fill):d.text((x*S,y*S),value,font=font(size,True),fill=fill)
    for x in range(0,1200,40):line([(x,0),(x,300)],'#20262d')
    for y in range(0,300,40):line([(0,y),(1200,y)],'#20262d')
    d.polygon([(850*S,0),(1200*S,0),(1200*S,300*S),(700*S,300*S)],fill='#252c35')
    d.polygon([(1040*S,0),(1080*S,0),(920*S,300*S),(880*S,300*S)],fill=accent)
    rect((40,38,46,64),accent);text(62,34,'QUARTERMASTER  /  SUPPLY DIVISION',18,'#c4cbd3')
    text(40,94,title,76,'#f5f3ed')
    text(44,203,subtitle,18,'#abb4c1')
    rect((40,260,220,264),accent);line([(238,262),(690,262)],'#46505e')
    if theme=='neutral':
        d.ellipse((1001*S,53*S,1119*S,171*S),outline=accent,width=2*S)
        points=[(1029,99),(1060,83),(1091,99),(1091,132),(1060,149),(1029,132),(1029,99)]
        line(points,'#f5f3ed',2);line([(1029,99),(1060,116),(1091,99)],'#f5f3ed',2)
        line([(1060,116),(1060,149)],'#f5f3ed',2);line([(1044,91),(1075,108),(1075,123)],accent,2)
        text(1005,189,'ALMACEN' if mark=='DEPOT' else mark,22,'#f5f3ed');text(1019,221,'LOGISTICA' if mark=='DEPOT' else 'SERVICIOS',13,'#abb4c1')
    else:
        text(995 if len(mark)<5 else 964,102,mark,37,'#f5f3ed')
        text(995,160,'LOGISTICS',14,'#c4cbd3')
        if theme=='baf':
            flag=Image.new('RGB',(144*S,72*S),'#1d2c58');flagdraw=ImageDraw.Draw(flag)
            flagdraw.line((0,0,144*S,72*S),fill='#f5f3ed',width=14*S);flagdraw.line((0,72*S,144*S,0),fill='#f5f3ed',width=14*S)
            flagdraw.line((0,0,144*S,72*S),fill='#bf354b',width=5*S);flagdraw.line((0,72*S,144*S,0),fill='#bf354b',width=5*S)
            flagdraw.rectangle((61*S,0,83*S,72*S),fill='#f5f3ed');flagdraw.rectangle((0,25*S,144*S,47*S),fill='#f5f3ed')
            flagdraw.rectangle((66*S,0,78*S,72*S),fill='#bf354b');flagdraw.rectangle((0,30*S,144*S,42*S),fill='#bf354b')
            image.paste(flag,(995*S,20*S))
        elif theme=='paf':rect((995,46,1138,62),'#f5f3ed');rect((995,62,1138,78),accent)
        else:rect((995,46,1138,52),accent);rect((995,60,1080,64),'#a3adb9')
    image.resize((1200,300),Image.Resampling.LANCZOS).save(OUT/(filename or f'shop-header-{theme}.png'),optimize=True)
for args in [('paf','#cf3b50','P.A.F.'),('usmc','#c1a16b','USMC'),('ukaf','#a64251','UKAF'),('baf','#a64251','BAF'),('neutral','#87a6ab','DEPOT')]:render(*args)

for kind,title,mark,subtitle in [
 ('verification','VERIFICACION','ACCESO','IDENTIDAD  /  SOLICITUD  /  REVISION'),
 ('bonus','BONIFICACIONES','BONOS','RECOMPENSAS  /  CONDICIONES  /  RECLAMOS'),
 ('servers','SERVIDORES','ENLACES','DISPONIBILIDAD  /  RESERVAS  /  DESPLIEGUES'),
 ('events','OPERACIONES','MISIONES','CONVOCATORIA  /  ASISTENCIA  /  REPORTES'),
 ('help','CENTRO DE AYUDA','GUIA','COMANDOS  /  ACCESOS  /  SOPORTE'),
 ('inventory','INVENTARIO','EQUIPO','ARTICULOS  /  CANTIDADES  /  DETALLES'),
 ('economy','TESORERIA','BANCO','CARTERA  /  BANCO  /  MOVIMIENTOS')]:
 render('neutral','#87a6ab',mark,title,subtitle,f'panel-header-{kind}.png')
 for theme,accent,unit in [('usmc','#c1a16b','USMC'),('baf','#a64251','BAF'),('paf','#cf3b50','P.A.F.'),('ukaf','#a64251','UKAF')]:
  render(theme,accent,unit,title,subtitle,f'panel-header-{kind}-{theme}.png')
