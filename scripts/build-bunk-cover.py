"""Tailor the two watch berths and bake their woven swatch. Run in Blender background mode."""
from math import sin, cos, pi, exp, hypot, copysign
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = 2*pi
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 1

def object_from(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj

# Ray-project a fine, alternating twill relief onto a flat UV swatch. All bedding
# shares this repeat (96 mm square). Sculpted larger creases stay in the silhouettes.
def weave(x, y):
    a, b = TAU*16*x, TAU*16*y
    cross = .5 + .5*sin((a-b)*.5)
    return (.0011 + .00031*(cross*cos(a) + (1-cross)*cos(b)) +
            .00009*cos(2*a+.55*sin(b)) + .000045*cos(2*b+.8*sin(a)))

def swatch():
    res = 192
    grid = [(i/res, j/res) for j in range(res+1) for i in range(res+1)]
    high = object_from("Warp crossing weft", [(x*.096,y*.096,weave(x,y)) for x,y in grid],
                       [(j*(res+1)+i,j*(res+1)+i+1,(j+1)*(res+1)+i+1,(j+1)*(res+1)+i)
                        for j in range(res) for i in range(res)])
    for f in high.data.polygons: f.use_smooth = True
    corners = [(0,0),(1,0),(1,1),(0,1)]
    low = object_from("Swatch target", [(x*.096,y*.096,0) for x,y in corners], [(0,1,2,3)])
    uv = low.data.uv_layers.new()
    for k, corner in enumerate(corners): uv.data[k].uv = corner
    mat = bpy.data.materials.new("Fulled twill")
    mat.use_nodes = True
    low.data.materials.append(mat)
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    normal = bpy.data.images.new("Twill relief",128,128,alpha=False)
    normal.colorspace_settings.name = "Non-Color"
    tex.image = normal
    nodes.active = tex
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type="NORMAL",normal_space="TANGENT",use_selected_to_active=True,
                        cage_extrusion=.004,max_ray_distance=.008,margin=0)
    normal.pack()
    for obj in (high,low): bpy.data.objects.remove(obj,do_unlink=True)
    bump = nodes.new("ShaderNodeNormalMap")
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .91
    shader.inputs["Specular IOR Level"].default_value = .28
    mat.node_tree.links.new(tex.outputs["Color"],bump.inputs["Color"])
    mat.node_tree.links.new(bump.outputs["Normal"],shader.inputs["Normal"])
    # The swatch is neutral so loom stripes, bias bindings and repairs can each
    # have their own piece-dyed colour in one primitive.
    yy, xx = np.mgrid[:128,:128]/128
    a, b = TAU*16*xx, TAU*16*yy
    yarn = .80 + .068*(np.cos(a)+np.cos(b)) + .042*np.sin((a-b)*.5)
    yarn += .027*np.cos(TAU*(2*xx+yy)) + .017*np.sin(TAU*(xx-3*yy))
    color = bpy.data.images.new("Undyed twill",128,128,alpha=False)
    rgba = np.ones((128,128,4),dtype=np.float32)
    rgba[:,:,:3] = yarn[:,:,None]
    color.pixels.foreach_set(rgba.ravel())
    color.pack()
    dye = nodes.new("ShaderNodeTexImage")
    dye.image = color
    mat.node_tree.links.new(dye.outputs["Color"],shader.inputs["Base Color"])
    return mat

mat = swatch()
verts, uvs, faces, dyes = [], [], [], []
def point(x,d,h,u,v):
    verts.append((x,-d,h))
    uvs.append((u/.096,v/.096))
    return len(verts)-1

def face(ids, dye):
    faces.append(ids)
    dyes.append(tuple(int(dye[k:k+2],16)/255 for k in (0,2,4))+(1,))

def grid(nx, ny, fn, color):
    ids = [[point(*fn(i/nx,j/ny)) for i in range(nx+1)] for j in range(ny+1)]
    for j in range(ny):
        for i in range(nx):
            face([ids[j][i],ids[j+1][i],ids[j+1][i+1],ids[j][i+1]],color(i,j))
    return ids

def welt(path, r, dye, closed=False):
    rows = []
    for k, v in enumerate(path):
        tangent = Vector(path[(k+1)%len(path)] if closed or k+1<len(path) else v) - Vector(path[k-1] if closed or k else v)
        tangent.normalize()
        a = tangent.cross(Vector((0,0,1)))
        if a.length < .01: a = tangent.cross(Vector((1,0,0)))
        a.normalize()
        b = tangent.cross(a)
        row = []
        for l in range(5):
            pos = Vector(v) + r*(a*cos(TAU*l/5)+b*sin(TAU*l/5))
            row.append(point(*pos,k*.015,l*r))
        rows.append(row)
    for k in range(len(path) if closed else len(path)-1):
        n = (k+1)%len(path)
        for l in range(5):
            face([rows[k][l],rows[k][(l+1)%5],rows[n][(l+1)%5],rows[n][l]],dye)

def ticking(deck):
    # A continuous fitted case across the exposed heel of the mattress and its aisle edge.
    path = [(.060,-.038),(.061,-.003),(.077,.006),(.14,.011),(.35,.012),
            (.58,.011),(.672,.007),(.696,-.002),(.699,-.026),(.698,-.064),(.691,-.078)]
    def fit(u,v):
        d,h = path[round(v*(len(path)-1))]
        end=min(1,abs(u-.5)*2)**10
        corner=min(1,abs(d-.38)/.32)**8
        x=-3.62+1.68*u-.010*(2*u-1)*corner
        return x,d-.008*corner*end,deck+h-.008*end,x,-v*.79
    # Concentrate ticking stripes where the folded-back head exposes the sheet.
    cuts = [0,.2,.4,.55] + [.60 + i*.02 for i in range(21)]
    grid(len(cuts)-1,len(path)-1,lambda u,v:fit(cuts[round(u*(len(cuts)-1))],v),
         lambda i,j:"96998d" if i>3 and i%4==0 else "c2bdab")
    welt([fit(k/34,.7)[:3] for k in range(35)],.0035,"a29c85")

def pillow(deck, slept):
    rings = []
    center = -2.14 if slept else -2.15
    for k in range(10):
        theta = -.49*pi + k/9*.98*pi
        radius = cos(theta)**.63
        loop, outline = [], []
        for i in range(32):
            t = TAU*i/32
            cx = copysign(abs(cos(t))**.52,cos(t))
            cy = copysign(abs(sin(t))**.52,sin(t))
            x = .203*cx*radius
            d = .271*cy*radius
            pinch = .012*(cx*cy)**4 + .006*cos(t*8+.4)*radius**4
            h = .065 + (.061-pinch)*sin(theta) + .009*cx*cy + .006*cx
            if slept and theta>0:
                h -= .047*exp(-((x+.035)/.079)**2-((d-.035)/.13)**2)*sin(theta)
                h -= .015*exp(-((x-.025-.35*d)/.025)**2)*sin(theta)
            pos = (center+x+.025*cy, .375+d-.025*cx, deck+h)
            loop.append(point(*pos,x,d))
            outline.append(pos)
        rings.append(loop)
        if k==4: welt(outline,.0038,"8c8471",True)
    for a,b in zip(rings,rings[1:]):
        for i in range(32):
            j=(i+1)%32
            color = "cdc5aa" if slept else "d8d0b8"
            if i in (1,30): color = "aba58d"
            face([a[i],b[i],b[j],a[j]],color)
    face(rings[-1][::-1],"cdc5aa" if slept else "d8d0b8")
    face(rings[0],"938771")

# Cross sections carry the hanging edge back underneath, leaving a dark return
# and a bound lip. The slept-in cover retreats diagonally toward the cold end.
def cover(deck,slept):
    profile=[(.064,.006),(.077,.030),(.122,.045),(.19,.056),(.28,.061),
             (.37,.065),(.46,.064),(.54,.060),(.615,.053),(.666,.041),
             (.695,.024),(.709,.001),(.713,-.041),(.711,-.081),(.705,-.096),
             (.694,-.099),(.684,-.084),(.682,-.050)]
    if slept:
        profile=[(d,h*1.15 if h>0 else h*1.55) for d,h in profile]
    def sample(u,j):
        d,h = profile[j]
        edge = max(0,min(1,(d-.52)/.18))
        foot = -3.592+.013*sin(d*8+.4)
        head = (-2.40-.19*d+.074*sin(d*8+.3)) if slept else (-2.32+.018*sin(d*6))
        x=foot+(head-foot)*u
        # Hand-shaped compression ridges converge toward one twist near the dropped corner.
        ridge = .0
        if slept:
            for center, slope, height, width in [(.28,.39,.056,.065),(.54,-.37,.078,.075),(.83,.31,.10,.081)]:
                q=(u-center-slope*(d-.36)-.035*sin(6*d+center*6))/width
                ridge += height*exp(-q*q) - .012*exp(-((q-1.25)/.78)**2)
            ridge *= .38+.62*sin(pi*min(1,d/.85))
            ridge -= .035*exp(-((u-.59)/.18)**2-((d-.32)/.18)**2)
            h += ridge*(1-.54*edge) + .022*edge*sin(8*u+.7)
            d += edge*(.48*ridge-.018*sin(9*u))
        else:
            h+= .007*sin(11*u+4*d)+.011*exp(-((u-.81-.12*d)/.07)**2)
            d+=edge*.005*sin(10*u)
        # The loose fold settles onto the fitted sheet at the head end.
        if h>0:
            h *= 1 - (.49 if slept else .65)*u**7
        return x,d,deck+h
    lengths=[0]
    for (d,h),(next_d,next_h) in zip(profile,profile[1:]):
        lengths.append(lengths[-1]+hypot(next_d-d,next_h-h))
    nx=36
    def dye(i,j):
        if j>=15: return "4e4940" if slept else "414a4c"
        if j==13 and not slept: return "90998d"
        if j==14: return "b6a07c" if slept else "a7a89c"
        if i in (3,7,30): return "b89872" if slept else "c3bda5"
        if i in (4,5,6): return "634e43" if slept else "3f5159"
        return "aa7257" if slept else "74898a"
    grid(nx,len(profile)-1,lambda u,v:(*sample(u,round(v*(len(profile)-1))),u*1.25,-lengths[round(v*(len(profile)-1))]),dye)
    for end in (0,1):
        def cap(u,v):
            j=round(v*(len(profile)-1))
            x,d,h=sample(end,j)
            return x+(end-.5)*.014*sin(pi*u),d-.008*u,h+(.012+deck-h)*u,x,-v*.92
        grid(2,len(profile)-1,cap,lambda i,j:"746755" if slept else "5d696b")
    for u in (0,1):
        welt([sample(u,j) for j in range(len(profile))],.0048,"89745c" if slept else "78847e")
    welt([sample(i/nx,14) for i in range(nx+1)],.0038,"c0ae8c")
    if slept:
        # Turnback lining follows the rumpled edge. Darn patch is appliqued
        # on the aisle face, with interrupted whipstitches along each side.
        def cuff(u,v):
            j=v*(len(profile)-1); lo=int(j); hi=min(lo+1,len(profile)-1)
            p=Vector(sample(.79+.21*u,lo)).lerp(Vector(sample(.79+.21*u,hi)),j-lo)
            p.z += .009+.036*exp(-((u-.88)/.16)**2)
            p.y += .018*v**3
            return *p,.25*u,-.92*v
        grid(7,len(profile)-1,cuff,lambda i,j:"b6a48c" if i>0 else "d1c0a5")
        def patch(u,v):
            pos=Vector(sample(.83+u*.12,12))
            pos.y+=.023
            pos.z+=.043-.060*v+u*.016
            return *pos,u*.16,-.064*v
        grid(8,3,patch,lambda i,j:"718180")
        for v in (.12,.88):
            for i in range(8):
                welt([patch((i+.10)/8,v)[:3],patch((i+.64)/8,v+.035)[:3]],.0018,"d4be96")

for deck,slept in [(.68744,True),(1.40744,False)]:
    ticking(deck)
    cover(deck,slept)
    pillow(deck,slept)

asset = object_from("Opposite watch bedding",verts,faces)
asset.data.materials.append(mat)
uv = asset.data.uv_layers.new(name="Metric loom repeat")
colors = asset.data.color_attributes.new(name="Piece dye",type="BYTE_COLOR",domain="CORNER")
for poly,dye in zip(asset.data.polygons,dyes):
    poly.use_smooth=True
    for k in poly.loop_indices:
        uv.data[k].uv = uvs[asset.data.loops[k].vertex_index]
        colors.data[k].color_srgb=dye
bpy.context.view_layer.objects.active=asset
asset.select_set(True)
# Meshopt reorders the indexed shell and compresses its attributes for GLTFLoader.
with TemporaryDirectory() as scratch:
    source=Path(scratch)/"watch-linen.glb"
    bpy.ops.export_scene.gltf(filepath=str(source),use_selection=True,export_vertex_color="ACTIVE",
                              export_all_vertex_colors=False,export_animations=False,export_yup=True)
    subprocess.run(["node","node_modules/@gltf-transform/cli/bin/cli.js","meshopt",str(source),
                    "public/models/watch-blanket.glb","--quantize-normal","8"],check=True)
