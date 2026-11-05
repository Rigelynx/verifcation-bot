"""Local layout preview from the actual Discord Components V2 payload (not a live screenshot)."""
from pathlib import Path
import json,re,sys
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parent.parent
payload=json.loads((ROOT/(sys.argv[1] if len(sys.argv)>1 else 'assets/shop-v2-preview.json')).read_text(encoding='utf8'))
output=ROOT/(sys.argv[2] if len(sys.argv)>2 else 'assets/shop-v2-preview.png')
S=2;W=656
def font(size,bold=False):
    path=Path('C:/Windows/Fonts/seguisb.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf')
    if not path.exists():path=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    return ImageFont.truetype(str(path),size*S)
canvas=Image.new('RGB',(W*S,1800*S),'#313338');d=ImageDraw.Draw(canvas)
def rect(box,fill,r=0,outline=None):
    box=tuple(int(v*S)for v in box)
    if r:d.rounded_rectangle(box,r*S,fill,outline,width=S)
    else:d.rectangle(box,fill)
def text(x,y,value,size=14,color='#dbdee1',bold=False):d.text((int(x*S),int(y*S)),value,font=font(size,bold),fill=color)
def lines(value,width,size,bold=False):
    words=value.split();out=[];line=''
    for word in words:
        candidate=(line+' '+word).strip()
        if d.textlength(candidate,font=font(size,bold))>width*S and line:out.append(line);line=word
        else:line=candidate
    return out+[line] if line else out
def body(raw,x,y,width,draw=True):
    for part in raw.splitlines():
        small=part.startswith('-# ');heading=part.startswith(('## ','### '));bold=heading or part.startswith('**');size=12 if small else 16 if heading else 14
        clean=re.sub(r'^(-# |### |## )','',part).replace('**','').replace('\\','')
        # Native emoji vary by Discord client; keep the typography preview stable.
        if heading:clean=re.sub(r'^[^A-Za-zÁÉÍÓÚáéíóú0-9$€£]+','',clean)
        for line in lines(clean,width,size,bold):
            if draw:text(x,y,line,size,'#949ba4' if small else '#f2f3f5' if bold else '#c4c8ce',bold)
            y+=17 if small else 22 if heading else 20
        y+=3
    return y
y=18
for index,container in enumerate(payload['components']):
    children=container.get('components',[]);start=y
    media=next((node for node in children if node['type']==12),None)
    section=next((node for node in children if node['type']==9),None)
    if media:
        content=next(node['content']for node in children if node['type']==10)
        end=body(content,40,y+172,576,False)+14
        rect((18,y,638,end),'#2b2d31',9,'#41434a')
        banner=Image.open(ROOT/'src/web/public/media'/media['items'][0]['media']['url'].split('attachment://')[1]).convert('RGB').resize((600*S,150*S),Image.Resampling.LANCZOS)
        canvas.paste(banner,(28*S,(y+10)*S));body(content,40,y+172,576)
        y=end+10
    elif section:
        raw='\n'.join(node['content']for node in section['components']);end=body(raw,38,y+16,450,False)+12
        rect((18,y,638,end),'#2b2d31',9,'#41434a');rect((18,y+10,22,end-10),f"#{container.get('accent_color',0x87a6ab):06x}",2)
        body(raw,38,y+16,450)
        button=section['accessory'];by=y+(end-y-34)/2
        rect((516,by,620,by+34),({1:'#5865f2',3:'#248046',4:'#da373c'}.get(button.get('style'),'#4e5058')) if not button.get('disabled')else '#404249',5)
        text(532,by+6,button['label'],13,'#ffffff',True);y=end+10
    else:
        measure=y+15
        for node in children:
            measure=body(node['content'],36,measure,580,False) if node['type']==10 else measure+44
        height=measure-y+15
        rect((18,y,638,y+height),'#2b2d31',9,'#41434a');cy=y+15
        for node in children:
            if node['type']==10:cy=body(node['content'],36,cy,580)
            elif node['type']==1:
                if node['components'][0]['type']==3:
                    selected=next(option['label']for option in node['components'][0]['options']if option.get('default'))
                    rect((36,cy,620,cy+34),'#1e1f22',5);text(49,cy+6,selected,14);text(596,cy+5,'⌄',16)
                else:
                    x=36
                    for button in node['components']:
                        caption=button['label'];width=max(72,int(d.textlength(caption,font=font(13,True))/S)+32)
                        rect((x,cy,x+width,cy+32),'#383a40' if button.get('disabled')else ({1:'#5865f2',3:'#248046',4:'#da373c'}.get(button.get('style'),'#4e5058')),4)
                        text(x+16,cy+6,caption,13,'#949ba4'if button.get('disabled')else '#f2f3f5',True);x+=width+8
                cy+=44
        y+=height+14
canvas.crop((0,0,W*S,y*S)).resize((W,y),Image.Resampling.LANCZOS).save(output)
print(output)
