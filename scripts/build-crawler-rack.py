"""Build the tool rack, wheelhouse glass and tracked-floor trail for the shared exterior mesh.

Run with blender -b --python scripts/build-crawler-rack.py.
Dimensions are in metres, using the same 8.5 m crawler scale and shared mounting coordinates as the viewer.
"""
from math import cos, hypot, pi, sin
from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
BINS = {}
ROUND = 16
METAL = (0.52, 0.56, 0.56)
SOLE = (0.72, 0.75, 0.74)
SHAFT = (0.69, 0.49, 0.29)
COAL = (0.21, 0.22, 0.22)
WEB = (0.47, 0.38, 0.26)
HONEY = (0.66, 0.53, 0.38)


def surface(channel, points, faces, colors, smooth=False):
    vertices, triangles, inks, smoothing = BINS.setdefault(channel, ([], [], [], []))
    offset = len(vertices)
    vertices.extend((x, -z, y) for x, y, z in points)
    for face in faces:
        triangles.append(tuple(i + offset for i in face))
    inks.extend(colors)
    smoothing.extend([smooth]*len(faces))


def draw_rings(channel, rings, colors, smooth=False):
    count = len(rings[0])
    faces = [(k*count+i, k*count+(i+1)%count, (k+1)*count+(i+1)%count, (k+1)*count+i)
             for k in range(len(rings)-1) for i in range(count)]
    faces.extend([tuple(reversed(range(count))), tuple(range((len(rings)-1)*count, len(rings)*count))])
    surface(channel, [p for ring in rings for p in ring], faces, colors, smooth)


def rod(axis, rings, coords, finish, channel='Travel_scoop'):
    """A scaled, spatially oriented lathe, with contrasting grain around the wood."""
    near, far = (axis+1)%3, (axis+2)%3
    points, colors = [], []
    for pos, dy, dz in rings:
        rim = []
        for i in range(ROUND):
            a = 2*pi*i/ROUND
            frame = [0, 0, 0]
            frame[axis] = pos
            frame[near] = coords[0] + dy*cos(a)
            frame[far] = coords[1] + dz*sin(a)
            rim.append(frame)
            reflection = (0.93 + .065*cos(5*a) + .02*cos(2*a)) if finish in (SHAFT, HONEY) else 1
            colors.append(tuple(c*reflection for c in finish))
        points.append(rim)
    draw_rings(channel, points, colors, True)


def key_box(channel, x, y, z, dx, dy, dz, finish):
    pts = [(x+sx*dx*.5,y+sy*dy*.5,z+sz*dz*.5) for sx in (-1,1) for sy,sz in ((1,1),(-1,1),(-1,-1),(1,-1))]
    draw_rings(channel,[pts[:4],pts[4:]],[finish]*8)


def trace(channel, positions, angle_offset, radius, finish):
    """Render a tubular ring or rounded rod along a set of connected shaft faces."""
    coords = [Vector(s) for s in positions]
    rings = []
    for j,p in enumerate(coords):
        axial = (coords[min(j+1,len(coords)-1)]-coords[max(0,j-1)]).normalized()
        face = Vector(angle_offset).cross(axial).normalized()
        other = axial.cross(face).normalized()
        rings.append([p + (face*cos(i*pi/4) + other*sin(i*pi/4))*radius for i in range(8)])
    draw_rings(channel,rings,[finish]*(len(rings)*8),True)


# The back of each mounting foot overlaps the tool-side hull at z=1.989m.
# The exterior sensor boxes use the same wall above the cabinet, starting near y=1.94m.
origin = (1.624, 2.081)
c = 'Travel_scoop'
for x, length in [(1.31,.11), (2.55,.105)]:
    # Bolted tool carrier, with a short mounting foot behind each hook.
    key_box(c,x,origin[0],2.005,.156,.154,.042,COAL)
    key_box(c,x,origin[0],2.035,.08,.073,.065,METAL)
    for oy in (-.052,.052):
        for ox in (-.051,.051):
            rod(2,[(2.023,.010,.010),(2.032,.009,.009)],(x+ox,origin[0]+oy),SOLE)
    # Rounded shoulder of the quick-release strap sits just behind the buckle.
    rod(0,[(x-length*.5,.047,.050),(x-length*.44,.049,.052),
           (x+length*.44,.049,.052),(x+length*.5,.046,.049)],origin,WEB)
    key_box(c,x,origin[0],origin[1]+.047,.073,.033,.014,COAL)
    trace(c,[(x-.037,origin[0]-.024,2.14),(x-.037,origin[0]+.024,2.14),
             (x+.032,origin[0]+.024,2.14),(x+.032,origin[0]-.024,2.14),
             (x-.037,origin[0]-.024,2.14)],(0,0,1),.008,SOLE)

# Tilted section faces and the bullnose cutting edge at the scoop front.
# A web on either side of the central socket holds the blade straight under load.
cross_section = [-1,-.84,-.6,-.28,0,.28,.6,.84,1]
sections = [(.40,.171,.0,-.016),(.424,.171,.012,-.010),(.49,.179,.045,0),
            (.63,.19,.064,.0),(.78,.186,.085,.0),(.90,.177,.09,.0),
            (.95,.152,.088,.0),(.988,.103,.055,.0),(1.02,.05,.025,.0)]
points = []; colors = []
for sx,spread,bow,seat in sections:
    for offset in cross_section:
        edge=abs(offset)
        px = sx + .019*edge**2 if sx<.49 else sx-.028*edge**2
        py = origin[0] + spread*offset
        # The free space across the sheet is greater around the raised outer rim.
        pz = origin[1]-.005 + seat + bow*(edge**2-.35) + .009*max(0,1-abs(offset)*4)
        points.append((px,py,pz))
        finish = (0.53,0.57,0.60) if sx<.424 else (.35,.405,.425)
        if pz > origin[1]+.04: finish=(.43,.47,.49)
        colors.append(tuple(t*(.96 + .025*cos(6*offset+sx)) for t in finish))
n=len(cross_section)
rows=len(sections)
faces=[(k*n+i,(k+1)*n+i,(k+1)*n+i+1,k*n+i+1) for k in range(rows-1) for i in range(n-1)]
front=len(points)
boundary=[*range(n), *[k*n+n-1 for k in range(1,rows)],
          *[(rows-1)*n+i for i in range(n-2,-1,-1)], *[k*n for k in range(rows-2,0,-1)]]
top = tuple(points)
points.extend((x,y,z-.010) for x,y,z in top)
colors.extend([(0.32,0.37,0.39)]*len(top))
faces.extend([tuple(front+i for i in reversed(face)) for face in faces[:]])
for i,idx in enumerate(boundary):
    nx = boundary[(i+1)%len(boundary)]
    faces.append((idx,nx,nx+front,idx+front))
surface(c,points,faces,colors)
for q in (-.083,.083):
    trace(c,[(.64,origin[0]+q*1.12,origin[1]-.011),(.72,origin[0]+q,origin[1]-.005),
             (.92,origin[0]+q*.45,origin[1]+.005),(1.0,origin[0]+q*.25,origin[1]+.008)],
          (0,0,1),.010,(.47,.51,.52))
rod(0,[(.894,.017,.021),(.951,.033,.034),(1.09,.041,.042),(1.126,.041,.042)],origin,METAL)
rod(0,[(1.08,.036,.036),(1.16,.035,.035),(1.37,.034,.034),
       (1.64,.032,.032),(1.94,.032,.032),(2.40,.034,.034),(2.76,.037,.037)],origin,SHAFT)
for x,rad in [(1.12,.043),(1.13,.042),(2.724,.045),(2.749,.043)]:
    rod(0,[(x-.002,rad,rad),(x+.007,rad,rad)],origin,COAL)
# A short machined socket with two dark rivets takes up the repaired shaft joint.
rod(0,[(1.46,.037,.037),(1.468,.04,.04),(1.55,.04,.04),(1.557,.037,.037)],origin,(.54,.54,.52))
for x in (1.481,1.536):
    rod(2,[(origin[1]+.037,.006,.006),(origin[1]+.042,.005,.005)],(x,origin[0]),COAL)
rod(0,[(2.71,.047,.049),(2.732,.052,.053),(2.82,.049,.05),(2.85,.035,.04)],origin,(.46,.51,.54))

for sign in (-1,1):
    trace(c,[(2.79,origin[0]+sign*.03,origin[1]),(2.85,origin[0]+sign*.047,origin[1]),
             (2.94,origin[0]+sign*.124,origin[1]),(3.015,origin[0]+sign*.144,origin[1]),
             (3.057,origin[0]+sign*.12,origin[1])],(0,0,1),.019,COAL)
rod(1,[(origin[0]-.144,.030,.030),(origin[0]-.131,.038,.035),
       (origin[0]-.117,.032,.032),(origin[0]-.09,.035,.035),
       (origin[0]+.09,.035,.035),(origin[0]+.117,.032,.032),(origin[0]+.13,.038,.035),
       (origin[0]+.144,.03,.03)],(origin[1],3.056),HONEY)

# Local track pads use a narrow, worn-down centre and a raised outer ridge.
# Keep the ground lower around the curved track ends for an easy downhill exit.
for side in (1,-1):
    channel = 'Packed_track'
    points = []; colors = []; ticks=120
    for k in range(ticks+1):
        x = -3.93 + k*.085
        # Taper the buried edge behind the travelling tyres.
        shoulder = min(1.0,max(0,(k/11.0)),max(0,(ticks-k)/32.0))
        spread = .91 + .08*cos(1.3*x) + .05*cos(5.5*x+side)
        energy = (.64 + .16*sin(3.7*x+side) + .10*cos(5.3*x) + .055*sin(13.2*x))
        plate = max(0,cos(2*pi*(x+.06)/.257))**3
        roll = (.015+.052*energy+.021*plate)*shoulder
        upper = (.021 + .070*energy + .034*plate)*shoulder
        rows = [(-.12,.002),(.00,.036*shoulder),(.09,roll),(.15,.036*shoulder),
                (.20,.019*shoulder),(.30,.018*shoulder),(.55,.020*shoulder),
                (.67,.030*shoulder),(.73,upper),(.81,upper*.71),(.91,upper*.20),(1., .001)]
        travel = (.90*cos(1.2*x+side)+.65*sin(4.6*x+side)+.60*sin(6.15*x))*shoulder
        for j,(off,height) in enumerate(rows):
            z = side*(.92 + off*1.18 + spread*.13*off + travel*.088*off)
            low = max(0,1-abs(j-5)/3)
            height += .014*plate*low*shoulder
            # Keep the low tread ridges on the clean side of the skimmed surface.
            band = .000 if j in (0,len(rows)-1) else (.008*cos(5*x+j*3+side))
            bump = max(.001,height+band*shoulder)
            if off < .05 or off> .95: bump -= .015
            if off > .80:
                bump += .033*off*off*off*(cos(3.8*x+side)-1)*shoulder
            points.append((x+(.047*off if j<7 else 0),bump*min(1,(ticks-k)/4,k/4)-.009, z))
            carbon = (.075*off*off + .068*off + .07*off*off*off + .11*low + .024*plate)*min(1,4*upper)
            if j in (0,len(rows)-1): carbon=0
            color=.979-carbon
            # Match the ambient shadow of the lower sky-facing floor patch.
            shade = max(0, 1 - min(1, max(0, (hypot(x/5.5, z/2.55)-.47)/.53)))
            powder = .98 - .13*shade
            colors.append((color*powder*.99, color*powder*.995, color*powder))
    n=len(rows)
    faces=[(j*n+a, (j+1)*n+a, (j+1)*n+a+1, j*n+a+1) for j in range(ticks) for a in range(n-1)]
    if side==1: faces=[tuple(reversed(f)) for f in faces]
    surface(channel,points,faces,colors,True)

# The mounting plane in the rendered cabin is x = 0.40008*y - 5.1873.
# The four panels stand 1 m apart. Their clear door openings have rounded
# shoulders, with a 2 mm edge and 4 mm top surface relative to the export.
for wx in [-1.50, -.50, .50, 1.50]:
    loops = []
    for fraction, cheek in [(1.0,.0020), (.998,.0036), (.992,.0040), (.985,.0040)]:
        shoulder = .064*fraction
        xw, yh = .428*fraction, .452*fraction
        rim = []
        for xc, yc, rotation in [(1,1,0),(-1,1,pi/2),(-1,-1,pi),(1,-1,1.5*pi)]:
            for r in range(5):
                angle = rotation + r*pi/8
                z = wx + (xw-shoulder)*xc + shoulder*cos(angle)
                y = 3.526 + (yh-shoulder)*yc + shoulder*sin(angle)
                x = .40008*y - 5.1873 - cheek
                rim.append((x,y,z))
        loops.append(rim)
    count = len(loops[0])
    indices = [(k*count+i,k*count+(i+1)%count,(k+1)*count+(i+1)%count,(k+1)*count+i)
               for k in range(len(loops)-1) for i in range(count)]
    indices.append(tuple(range((len(loops)-1)*count,len(loops)*count)))
    product_color = (0.070,0.098,0.123)
    vertices = [pos for r in loops for pos in r]
    surface('Standing_glass',vertices,indices,[product_color]*len(vertices),True)

# Match the angle and spacing of the two parked wipers on the wheelhouse grid.
# The hinge and the swivel sit above the rubber blade.
def on_glass(y, z, offset):
    return (.40008*y - 5.1873 - offset, y, z)


for z in (-.91, 1.045):
    # The steel lifting ring sits over a quick-release rubber washer.
    y = 3.028
    rings = []
    for depth, radius in [(.002,.034),(.024,.034),(.030,.028),(.037,.025)]:
        rings.append([on_glass(y+radius*cos(i*pi/6), z+radius*sin(i*pi/6), depth)
                      for i in range(12)])
    draw_rings('Travel_scoop',rings,[COAL]*24 + [METAL]*24,True)
    trace('Travel_scoop',[on_glass(y,z,.038),on_glass(3.09,z+.035,.060),
                           on_glass(3.221,z+.19,.075),on_glass(3.35,z+.416,.058)],
          (1,0,0),.014,(.24,.26,.27))
    anchor = z + .416
    # A pair of flanking bridges holds the seated blade lower than the guide.
    trace('Travel_scoop',[on_glass(3.35,anchor,.058),on_glass(3.35,anchor,.034)],
          (0,0,1),.013,METAL)
    for heel in [-1,1]:
        trace('Travel_scoop',[on_glass(3.35,anchor,.034),
                               on_glass(3.35+heel*.015,anchor+heel*.08,.030),
                               on_glass(3.35+heel*.032,anchor+heel*.16,.019)],
              (1,0,0),.009,COAL)
    outside = []
    for roll, seat, handle in [(-.24,.0015,.022),(-.18,.0015,.032),(.18,.0015,.032),(.24,.0015,.022)]:
        travel = 3.35 + roll*.22
        side = [on_glass(travel+sx*.007,anchor+roll,cut) for sx,cut in [(-1,seat),(-1,handle),(1,handle),(1,seat)]]
        outside.append(side)
    draw_rings('Travel_scoop',outside,[(.151,.157,.159)]*(4*len(outside)))


for name,(points,faces,colors,smooth_flags) in BINS.items():
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(points,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    mat=bpy.data.materials.new(name); mat.diffuse_color=(1,1,1,1); mat.use_nodes=True
    brush=mat.node_tree.nodes.new('ShaderNodeVertexColor'); brush.layer_name='COLOR_0'
    shader=mat.node_tree.nodes.get('Principled BSDF'); mat.node_tree.links.new(brush.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = {'Travel_scoop': .72, 'Packed_track': .97, 'Standing_glass': .1}[name]
    shader.inputs['Metallic'].default_value={'Travel_scoop':.09, 'Packed_track':0, 'Standing_glass':.23}[name]
    if name=='Standing_glass':
        shader.inputs['Coat Weight'].default_value=.74
        shader.inputs['Coat IOR'].default_value=1.52
        shader.inputs['Coat Roughness'].default_value=.055
    mesh.materials.append(mat)
    color=mesh.color_attributes.new(name='COLOR_0',type='BYTE_COLOR',domain='POINT')
    for g,t in zip(color.data,colors): g.color_srgb=tuple(t)+(1,)
    for q,use_smooth in zip(mesh.polygons,smooth_flags): q.use_smooth=use_smooth
    if name=='Packed_track':
        uv=mesh.uv_layers.new(name='Ground space')
        for r in mesh.loops:
            x,z,_=mesh.vertices[r.vertex_index].co
            uv.data[r.index].uv=(0.5 + x/72, 0.5 - z/72)
    print(name,len(mesh.vertices),'points',sum(len(t.vertices)-2 for t in mesh.polygons),'triangles')
root=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT')
# Compress and quantize the three procedural meshes in the same way as the other exports.
with TemporaryDirectory() as temp:
    intermediate = Path(temp)/'shared-floor.glb'
    bpy.ops.export_scene.gltf(filepath=str(intermediate), use_selection=True, export_vertex_color='ACTIVE',
                              export_skins=False, export_animations=False)
    cli = root/'node_modules/@gltf-transform/cli/bin/cli.js'
    run(['node', str(cli), 'meshopt', str(intermediate), str(root/'public/models/field-kit.glb'),
         '--level','high', '--quantize-normal','8'], check=True)
