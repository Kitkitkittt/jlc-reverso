#!/usr/bin/env python3
"""Build original explanatory SVGs. These are not measured factory drawings."""
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "schematics"
OUT.mkdir(parents=True, exist_ok=True)

def text(x, y, value, size=20, fill="#192d41", weight="normal", anchor="start"):
    return f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>'

def rect(x, y, w, h, fill="#ffffff", stroke="#334b60", rx=8, sw=2):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'

def line(x1, y1, x2, y2, stroke="#334b60", sw=2, arrow=False):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"' + (' marker-end="url(#arrow)"' if arrow else '') + '/>'

def circle(x, y, r, fill="none", stroke="#334b60", sw=2):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'

def svg(body, width=1200, height=820, title=""):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{escape(title)}">
<title>{escape(title)}</title>
<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#334b60"/></marker></defs>
<rect width="100%" height="100%" fill="#f6f8fb"/>
{body}
</svg>
"""

def watch(x, y, reverse=False, w=220, h=370):
    out = [rect(x-12,y-18,w+24,h+36,"#b9c2ca","#4a5965",12,3),
           rect(x,y,w,h,"#dce1e5","#405364",8,3)]
    for i in range(3):
        out += [line(x+4,y+7+i*7,x+w-4,y+7+i*7,"#647484",3),
                line(x+4,y+h-7-i*7,x+w-4,y+h-7-i*7,"#647484",3)]
    out += [rect(x+13,y+31,w-26,h-62,"#252c34" if reverse else "#f5f2e9","#617286",0,2)]
    sign = -1 if reverse else 1
    control_x = x-25 if reverse else x+w
    out += [rect(control_x,y+114,25,42,"#c8d0d7","#405364",3,2),
            rect(control_x-6 if reverse else control_x,y+182,31,39,"#c8d0d7","#405364",7,2)]
    for yy in range(y+186,y+217,6):
        out.append(line(control_x-4 if reverse else control_x+4, yy, control_x+20 if reverse else control_x+26, yy, "#617286",1))
    cx=x+w/2
    if not reverse:
        out += [rect(x+51,y+59,w-102,h-118,"#e5e3dc","#b3b4b2",0,1)]
        for xx in range(x+55,x+w-49,8):
            out.append(line(xx,y+63,xx,y+h-63,"#ccd0cd",1))
        labels = [(43,74,"11"),(w/2,68,"12"),(w-43,74,"1"),
                  (29,127,"10"),(w-29,127,"2"),
                  (28,180,"9"),(w-28,180,"3"),
                  (28,233,"8"),(w-28,233,"4"),
                  (41,h-49,"7"),(w-41,h-49,"5")]
        for xx,yy,v in labels:
            out.append(text(x+xx,y+yy,v,25,"#111b26","normal","middle"))
        out += [text(cx,y+115,"Jaeger-LeCoultre",11,"#707976","normal","middle"),
                circle(cx,y+177,6,"#122e51","#122e51"),
                line(cx,y+177,cx-40,y+204,"#123e74",7),
                line(cx,y+177,cx+52,y+226,"#123e74",5),
                circle(cx,y+274,34,"#f4f2eb","#adb5ba",1)]
        for dx,dy,n in [(0,-21,"60"),(24,4,"15"),(0,26,"30"),(-23,4,"45")]:
            out.append(text(cx+dx,y+274+dy,n,10,"#697781","normal","middle"))
        out += [line(cx,y+274,cx-9,y+294,"#123e74",3),circle(cx,y+274,3,"#123e74","#123e74")]
    else:
        out += [circle(cx,y+157,75,"#343d46","#88949e",1),
                circle(cx,y+157,63,"none","#6f7c88",1)]
        for xx,yy,v in [(cx,y+99,"12"),(cx+59,y+164,"3"),(cx-59,y+164,"9")]:
            out.append(text(xx,yy,v,23,"#d8e0e7","normal","middle"))
        out += [line(cx,y+157,cx-38,y+133,"#dfe6eb",6),
                line(cx,y+157,cx+43,y+123,"#dfe6eb",4),
                circle(cx,y+157,5,"#dfe6eb","#dfe6eb"),
                circle(cx,y+278,31,"#303b43","#83919d",1),
                text(cx,y+266,"24h",14,"#d5dee5","normal","middle"),
                line(cx,y+278,cx+16,y+297,"#dfe6eb",3),
                text(cx-46,y+291,"NIGHT",10,"#d5dee5","normal","middle"),
                text(cx+46,y+291,"DAY",10,"#d5dee5","normal","middle")]
    return "".join(out)

body = text(55,60,"Q2718110: exterior orientation guide",34,weight="bold")
body += text(55,95,"Original simplified schematic from inspected photos. Not a traced dial or dimensioned drawing.",18)
body += watch(180,190,False) + watch(790,190,True)
body += text(290,150,"RECTO",25,weight="bold",anchor="middle") + text(900,150,"REVERSE",25,weight="bold",anchor="middle")
body += line(425,321,438,321)+line(438,321,438,256)+text(454,255,"GMT pusher",19,weight="bold")+text(454,284,"above crown",17)
body += line(444,391,548,424)+text(454,456,"Separate crown",18)
body += text(290,620,"Silver / Arabic / blue hands",20,anchor="middle")
body += text(290,654,"Round lower SMALL SECONDS",19,anchor="middle")
body += text(900,620,"Dark / upper time circle",20,anchor="middle")
body += text(900,654,"Lower 24-HOUR indication",19,anchor="middle")
body += text(900,688,"Controls now appear on LEFT",18,weight="bold",anchor="middle")
body += text(55,752,"24-hour track numerals and detailed hand profiles remain to be checked in a sharper reverse reference.",17)
body += text(55,785,"Photographs override this schematic. All proportions and relief are illustrative.",17)
(OUT/"exterior-layout.svg").write_text(svg(body,title="Simplified correct recto and reverse orientation for Q2718110"),encoding="utf-8")

body=text(55,60,"Case reversal: fixed support and moving module",32,weight="bold")
body+=text(55,95,"Axes and orientation only. Pivot position, slide stroke and rail profiles are not measured.",18)
for x,title,rev in [(150,"RECTO SEATED",False),(770,"REVERSE SEATED",True)]:
    body+=watch(x,190,rev,w=210,h=355)
    body+=text(x+105,150,title,23,weight="bold",anchor="middle")
    body+=text(x+105,603,"Fixed cradle + bracelet stay still",18,anchor="middle")
body+=line(450,365,675,365,arrow=True)+text(560,327,"Release / turn / reseat",19,anchor="middle")
body+=text(560,401,"180 degrees about Y-parallel axis",17,anchor="middle")
body+=line(560,511,560,446,arrow=True)+text(576,469,"+Y toward 12",16)
body+=line(560,511,622,511,arrow=True)+text(628,518,"+X",16)
body+=circle(560,511,5,"#334b60","#334b60")+text(478,547,"+Z out of recto",16)
body+=text(55,679,"Moving assembly: both crystals, both dials, hands, movement, crown and GMT pusher.",19)
body+=text(55,714,"Right-side controls become left-side controls. The 12 end stays at the top.",19,weight="bold")
body+=text(55,770,"Normal reversal is separate from the educational exploded-view control.",18)
(OUT/"case-motion.svg").write_text(svg(body,title="Case reversal orientation guide"),encoding="utf-8")

body=text(55,60,"Exploded-view grouping: two displays, one movement",31,weight="bold")
body+=text(55,97,"Conceptual layers only. This is not a service sequence or a measured section.",18)
layers=[
 ("Recto crystal","C105","#dbe8ef"),("Recto hands","D002 / D003 / D004","#e5edf4"),
 ("Recto dial","D001","#eeeade"),("One Calibre 854/1 module","M000","#d3dce5"),
 ("Reverse dial","D101","#3d4b59"),("Reverse hands","D102 / D103 / D104","#e5edf4"),
 ("Reverse crystal","C106","#dbe8ef")]
for idx,(label,ids,color) in enumerate(layers):
    yy=143+idx*73
    body+=rect(180,yy,615,53,color,"#435a70",7,2)
    body+=text(205,yy+34,label,22,"#ffffff" if idx==4 else "#192d41","bold")
    body+=text(825,yy+34,ids,17)
body+=line(130,304,130,156,arrow=True)+text(67,241,"+Z",22,weight="bold")
body+=line(130,496,130,633,arrow=True)+text(67,578,"-Z",22,weight="bold")
body+=rect(180,690,615,51,"#b7c2cc","#435a70",7,2)+text(205,723,"Moving case separates from fixed cradle",21,weight="bold")
body+=text(55,786,"All spacing is enlarged for presentation. Fasteners, retention and gasket geometry remain unresolved.",17)
(OUT/"display-layers.svg").write_text(svg(body,title="Conceptual display and calibre grouping, not factory disassembly"),encoding="utf-8")

body=text(55,60,"Movement functions: general mechanism and outputs",30,weight="bold")
body+=text(55,97,"Functional explanation only. Box positions do not locate gears or bridges in Calibre 854/1.",18)
nodes=[
 (60,160,250,95,"Manual crown input","Winding subsystem"),
 (405,160,310,95,"Stored energy","Barrel concept"),
 (800,160,330,95,"Timekeeping","Train / escapement / balance"),
 (310,390,300,115,"RECTO OUTPUTS","Hour / minute / small seconds"),
 (775,390,355,115,"REVERSE OUTPUTS","Hour / minute / 24-hour"),
 (70,570,300,100,"GMT pusher","+1-hour correction function"),
]
for x,y,w,h,label,desc in nodes:
    body+=rect(x,y,w,h,"#e8eef5","#435a70",10,2)+text(x+20,y+38,label,20,weight="bold")+text(x+20,y+73,desc,17)
body+=line(310,207,400,207,arrow=True)+line(715,207,795,207,arrow=True)
body+=line(938,255,938,360)+line(938,360,465,360)+line(465,360,465,385,arrow=True)+line(938,360,938,385,arrow=True)
body+=line(370,620,942,620)+line(942,620,942,510,arrow=True)
body+=text(400,573,"Exact reverse transfer/correction architecture is unresolved.",17)
body+=text(55,725,"Documented outputs share one manual movement. Exact part identities and coordinates need direct evidence.",18)
body+=text(55,770,"No rotor. No claimed gear tooth counts. No factory assembly order.",18,weight="bold")
(OUT/"movement-functions.svg").write_text(svg(body,title="Functional movement explanation, not spatial layout"),encoding="utf-8")
print("Built four original schematic SVGs.")
