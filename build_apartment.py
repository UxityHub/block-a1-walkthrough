import bpy
import math
import os
from mathutils import Matrix, Vector


ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_GLB = os.path.join(ROOT, "apartment.glb")
OUT_PREVIEW = os.path.join(ROOT, "apartment_preview.png")

PLAN_W = 23.35
PLAN_D = 13.14
PLAN_X0 = 26.0
PLAN_Y0 = 18.0
PLAN_SCALE = PLAN_W / 680.0
WALL_H = 3.3528


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass


def mat(name, color, metallic=0.0, roughness=0.55, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, alpha)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        bsdf.inputs["Transmission Weight"].default_value = 0.35
        m.surface_render_method = "DITHERED"
        m.use_transparency_overlap = False
    return m


M = {
    "wall": mat("Warm white plaster", (0.84, 0.84, 0.83), roughness=0.8),
    "marble": mat("Cool ivory marble", (0.69, 0.70, 0.71), metallic=0.02, roughness=0.32),
    "wood": mat("Greige oak", (0.30, 0.27, 0.24), roughness=0.48),
    "darkwood": mat("Dark walnut", (0.12, 0.095, 0.075), roughness=0.42),
    "tile": mat("Balcony stone", (0.36, 0.37, 0.38), roughness=0.68),
    "bath": mat("Bathroom stone", (0.47, 0.48, 0.50), roughness=0.48),
    "fabric": mat("Ivory fabric", (0.75, 0.72, 0.68), roughness=0.9),
    "taupe": mat("Taupe fabric", (0.47, 0.42, 0.38), roughness=0.88),
    "cream": mat("Cream textile", (0.86, 0.83, 0.78), roughness=0.92),
    "black": mat("Black metal", (0.025, 0.027, 0.03), metallic=0.72, roughness=0.24),
    "brass": mat("Champagne brass", (0.46, 0.30, 0.12), metallic=0.78, roughness=0.25),
    "ceramic": mat("White ceramic", (0.91, 0.92, 0.93), roughness=0.2),
    "glass": mat("Clear glass", (0.62, 0.72, 0.77), metallic=0.0, roughness=0.08, alpha=0.24),
    "green": mat("Plant leaves", (0.10, 0.24, 0.11), roughness=0.82),
    "rug": mat("Warm abstract rug", (0.48, 0.43, 0.39), roughness=1.0),
    "rug_light": mat("Light woven rug", (0.69, 0.65, 0.59), roughness=1.0),
}


def pdf(x, y):
    return ((x - PLAN_X0) * PLAN_SCALE - PLAN_W / 2.0,
            (y - PLAN_Y0) * PLAN_SCALE - PLAN_D / 2.0)


def add_box(name, loc, dims, material, bevel=0.0, rotation=0.0):
    # Drafting coordinates use Y as height, so plan rotations are around Y.
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=(0, rotation, 0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("Soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    return obj


def add_cylinder(name, loc, radius, depth, material, vertices=32, rotation=(0, 0, 0)):
    # Blender cylinders are Z-aligned by default; rotate them to the drafting
    # system's Y-up axis before the whole apartment is normalized to Z-up.
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=(math.pi/2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    bevel = obj.modifiers.new("Soft rim", "BEVEL")
    bevel.width = min(radius * 0.08, 0.035)
    bevel.segments = 2
    return obj


def add_uv_sphere(name, loc, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def add_floor(name, x1, y1, x2, y2, material, level=0.0):
    a = pdf(x1, y1)
    b = pdf(x2, y2)
    return add_box(name, ((a[0]+b[0])/2, level-0.035, (a[1]+b[1])/2),
                   (abs(b[0]-a[0]), 0.07, abs(b[1]-a[1])), material, 0.012)


def add_wall(name, x1, y1, x2, y2, thickness=0.16, height=WALL_H):
    a = pdf(x1, y1)
    b = pdf(x2, y2)
    dx, dz = b[0]-a[0], b[1]-a[1]
    length = math.hypot(dx, dz)
    angle = math.atan2(dz, dx)
    return add_box(name, ((a[0]+b[0])/2, height/2, (a[1]+b[1])/2),
                   (length, height, thickness), M["wall"], 0.018, angle)


def at(x, y, height=0.0):
    p = pdf(x, y)
    return (p[0], height, p[1])


def add_rug(name, x, y, width, depth, material=None, rotation=0.0):
    px, _, pz = at(x, y)
    return add_box(name, (px, 0.035, pz), (width, 0.045, depth), material or M["rug"], 0.04, rotation)


def add_bed(name, x, y, rotation=0.0, width=1.85, length=2.15, material=None):
    px, _, pz = at(x, y)
    fabric = material or M["cream"]
    add_rug(name + " rug", x, y + 2 if rotation == 0 else y, width+0.65, length+0.75, M["rug_light"], rotation)
    add_box(name + " frame", (px, 0.22, pz), (width+0.08, 0.34, length+0.08), M["darkwood"], 0.06, rotation)
    add_box(name + " mattress", (px, 0.52, pz), (width, 0.30, length), M["ceramic"], 0.10, rotation)
    head_offset = length/2 - 0.08
    hx = px - math.sin(rotation) * head_offset
    hz = pz - math.cos(rotation) * head_offset
    add_box(name + " headboard", (hx, 1.02, hz), (width+0.18, 1.15, 0.15), fabric, 0.08, rotation)
    for side in (-1, 1):
        ox = math.cos(rotation) * side * width * 0.27
        oz = math.sin(rotation) * side * width * 0.27
        fx = math.sin(rotation) * length * 0.28
        fz = math.cos(rotation) * length * 0.28
        add_box(name + f" pillow {side}", (px+ox-fx, 0.77, pz+oz-fz),
                (width*0.40, 0.16, 0.48), M["cream"], 0.10, rotation)
    fx = math.sin(rotation) * 0.28
    fz = math.cos(rotation) * 0.28
    add_box(name + " duvet", (px+fx, 0.73, pz+fz), (width*0.94, 0.12, length*0.54), fabric, 0.08, rotation)
    for side in (-1, 1):
        ox = math.cos(rotation) * side * (width/2 + 0.23)
        oz = math.sin(rotation) * side * (width/2 + 0.23)
        add_box(name + f" bedside {side}", (px+ox, 0.30, pz+oz-head_offset*0.35), (0.42, 0.55, 0.42), M["darkwood"], 0.035, rotation)


def add_sofa(name, x, y, width=2.4, rotation=0.0, material=None):
    px, _, pz = at(x, y)
    fabric = material or M["fabric"]
    add_box(name + " plinth", (px, 0.17, pz), (width, 0.22, 0.83), M["darkwood"], 0.05, rotation)
    add_box(name + " base", (px, 0.38, pz), (width, 0.30, 0.86), fabric, 0.10, rotation)
    sections = 3 if width > 2.1 else 2
    for i in range(sections):
        local_x = (-width/2 + (i+0.5)*width/sections)
        ox = math.cos(rotation)*local_x
        oz = math.sin(rotation)*local_x
        add_box(name + f" seat {i}", (px+ox, 0.60, pz+oz+math.cos(rotation)*0.07),
                (width/sections-0.035, 0.18, 0.69), fabric, 0.075, rotation)
        bx = px+ox-math.sin(rotation)*0.31
        bz = pz+oz-math.cos(rotation)*0.31
        add_box(name + f" back {i}", (bx, 0.94, bz), (width/sections-0.06, 0.68, 0.18), fabric, 0.10, rotation)
    for side in (-1,1):
        local_x = side*(width/2-0.09)
        ox, oz = math.cos(rotation)*local_x, math.sin(rotation)*local_x
        add_box(name + f" arm {side}", (px+ox, 0.72, pz+oz), (0.20, 0.58, 0.86), fabric, 0.09, rotation)
    add_box(name + " cushion gold", (px+math.cos(rotation)*0.46, 0.88, pz+math.sin(rotation)*0.46-0.20), (0.42,0.42,0.14), M["brass"], 0.08, rotation)


def add_chair(name, x, y, rotation=0.0, material=None):
    px, _, pz = at(x, y)
    fabric = material or M["taupe"]
    for sx in (-0.23,0.23):
        for sz in (-0.23,0.23):
            ox = math.cos(rotation)*sx - math.sin(rotation)*sz
            oz = math.sin(rotation)*sx + math.cos(rotation)*sz
            add_box(name+" leg", (px+ox,0.22,pz+oz),(0.045,0.44,0.045),M["black"],0.01)
    add_box(name+" seat",(px,0.50,pz),(0.62,0.18,0.62),fabric,0.08,rotation)
    bx = px-math.sin(rotation)*0.25
    bz = pz-math.cos(rotation)*0.25
    add_box(name+" back",(bx,0.88,bz),(0.62,0.72,0.16),fabric,0.10,rotation)


def add_table(name, x, y, width, depth, height=0.72, rotation=0.0, material=None):
    px, _, pz = at(x, y)
    material = material or M["darkwood"]
    add_box(name+" top",(px,height,pz),(width,0.10,depth),material,0.06,rotation)
    for sx in (-width*0.36,width*0.36):
        for sz in (-depth*0.32,depth*0.32):
            ox = math.cos(rotation)*sx-math.sin(rotation)*sz
            oz = math.sin(rotation)*sx+math.cos(rotation)*sz
            add_box(name+" leg",(px+ox,height/2,pz+oz),(0.065,height,0.065),M["black"],0.015)


def add_dining(name, x, y, rotation=0.0):
    add_rug(name+" rug",x,y,3.25,2.45,M["rug_light"],rotation)
    add_table(name,x,y,2.55,1.05,0.76,rotation,M["darkwood"])
    for i, sx in enumerate((-0.88,0,0.88)):
        for side in (-1,1):
            px, pz = pdf(x,y)
            ox = math.cos(rotation)*sx - math.sin(rotation)*side*0.88
            oz = math.sin(rotation)*sx + math.cos(rotation)*side*0.88
            wx = PLAN_X0 + (px+ox+PLAN_W/2)/PLAN_SCALE
            wy = PLAN_Y0 + (pz+oz+PLAN_D/2)/PLAN_SCALE
            add_chair(name+f" chair {i} {side}",wx,wy,rotation+(0 if side==1 else math.pi),M["taupe"])


def add_coffee_table(name, x, y, radius=0.55, height=0.38, material=None):
    px, _, pz = at(x,y)
    add_cylinder(name,(px,height,pz),radius,0.10,material or M["darkwood"],48)
    add_cylinder(name+" stem",(px,height/2,pz),radius*0.18,height,M["black"],24)


def add_wardrobe(name,x,y,width,rotation=0.0):
    px,_,pz=at(x,y)
    add_box(name,(px,1.25,pz),(width,2.5,0.58),M["darkwood"],0.025,rotation)
    for s in (-0.25,0.25):
        ox=math.cos(rotation)*width*s
        oz=math.sin(rotation)*width*s
        add_box(name+" handle",(px+ox+math.sin(rotation)*0.30,1.25,pz+oz+math.cos(rotation)*0.30),(0.025,0.34,0.025),M["brass"],0.006)


def add_kitchen():
    # Main L-shaped kitchen with upper and lower cabinetry.
    for name,x,y,w,d,rot in [
        ("Kitchen north",120,146,3.5,0.65,0),
        ("Kitchen west",60,181,3.0,0.65,math.pi/2),
        ("Kitchen island",126,207,2.6,0.82,0),
        ("Wet kitchen",93,233,2.2,0.65,0),
    ]:
        px,_,pz=at(x,y)
        add_box(name+" cabinets",(px,0.44,pz),(w,0.88,d),M["darkwood"],0.035,rot)
        add_box(name+" counter",(px,0.94,pz),(w+0.08,0.09,d+0.08),M["marble"],0.025,rot)
    # Tall fridge and pantry.
    px,_,pz=at(173,181)
    add_box("Integrated fridge",(px,1.15,pz),(0.78,2.30,0.72),M["black"],0.035,0)
    # Hob and sink.
    px,_,pz=at(123,145)
    add_box("Induction hob",(px,1.01,pz),(0.68,0.025,0.48),M["black"],0.015)
    px,_,pz=at(77,218)
    add_box("Kitchen sink",(px,0.99,pz),(0.62,0.06,0.42),M["black"],0.08)


def add_toilet(name,x,y,rotation=0.0):
    px,_,pz=at(x,y)
    add_cylinder(name+" bowl",(px,0.37,pz),0.29,0.42,M["ceramic"],32)
    bx=px-math.sin(rotation)*0.30
    bz=pz-math.cos(rotation)*0.30
    add_box(name+" cistern",(bx,0.62,bz),(0.48,0.72,0.22),M["ceramic"],0.08,rotation)
    add_cylinder(name+" seat",(px,0.60,pz),0.28,0.06,M["ceramic"],32)


def add_bathroom(name,x,y,rotation=0.0,glass=True):
    px,_,pz=at(x,y)
    add_toilet(name+" toilet",x-7,y+5,rotation)
    add_box(name+" vanity",(px+0.45,0.43,pz-0.28),(1.00,0.82,0.48),M["darkwood"],0.035,rotation)
    add_cylinder(name+" basin",(px+0.45,0.91,pz-0.28),0.22,0.12,M["ceramic"],32)
    add_box(name+" mirror",(px+0.45,1.68,pz-0.53),(0.82,0.88,0.035),M["glass"],0.04,rotation)
    if glass:
        add_box(name+" shower glass",(px-0.62,1.05,pz+0.25),(0.04,2.10,1.20),M["glass"],0.01,rotation)
        add_cylinder(name+" shower head",(px-0.88,1.95,pz+0.25),0.09,0.05,M["black"],24,rotation=(math.pi/2,0,0))


def add_plant(name,x,y,scale=1.0):
    px,_,pz=at(x,y)
    add_cylinder(name+" pot",(px,0.25*scale,pz),0.24*scale,0.50*scale,M["darkwood"],24)
    for i,(ox,oz,sy) in enumerate(((0,0,1.0),(.18,.05,.72),(-.16,.08,.78),(.05,-.14,.65))):
        add_uv_sphere(name+f" leaves {i}",(px+ox*scale,0.75*scale+sy*.18,pz+oz*scale),(.30*scale,.48*scale,.30*scale),M["green"])


def build_architecture():
    add_floor("Living marble",184,65,498,257,M["marble"])
    add_floor("Kitchen marble",52,140,184,257,M["marble"])
    add_floor("Bedroom one wood",100,18,184,140,M["wood"])
    add_floor("Bedroom left bathroom",26,18,100,140,M["bath"])
    add_floor("Top balcony",184,18,472,65,M["tile"])
    add_floor("Right bedrooms",504,103,654,262,M["wood"])
    add_floor("Right bathrooms",472,18,654,103,M["bath"])
    add_floor("Lower bedroom",466,262,585,385,M["wood"])
    add_floor("Lower bathroom",585,262,654,385,M["bath"])
    add_floor("Servant room",26,257,112,360,M["tile"])
    add_floor("Entry",318,257,466,298,M["marble"])
    add_floor("Left utility balcony",26,140,52,257,M["tile"])

    # Interior ceilings at the approved 11 ft height. They are hidden only
    # from the top-down QA render; they remain part of the exported GLB.
    for name, x1, y1, x2, y2 in [
        ("Living ceiling",184,65,498,257),
        ("Kitchen ceiling",52,140,184,257),
        ("Bedroom one ceiling",100,18,184,140),
        ("Bathroom one ceiling",26,18,100,140),
        ("Right bedrooms ceiling",504,103,654,262),
        ("Right bathrooms ceiling",472,18,654,103),
        ("Lower bedroom ceiling",466,262,585,385),
        ("Lower bathroom ceiling",585,262,654,385),
        ("Entry ceiling",318,257,466,298),
        ("Service ceiling",26,257,112,360),
    ]:
        ceiling = add_floor(name,x1,y1,x2,y2,M["wall"],WALL_H + 0.07)
        ceiling.hide_render = True

    segments = [
        (26,18,184,18),(26,18,26,140),(26,140,174,140),(184,18,184,104),
        (100,18,100,65),(100,95,100,140),(26,65,72,65),(84,65,100,65),
        (184,65,398,65),(406,65,472,65),(472,18,654,18),(472,18,472,65),
        (654,18,654,116),(654,127,654,262),(472,65,504,65),(504,65,504,143),
        (472,143,504,143),(504,103,588,103),(588,103,588,18),(544,103,544,143),
        (504,143,504,219),(504,219,654,219),(588,103,588,143),(588,143,654,143),
        (498,143,498,219),(498,219,498,257),(498,257,563,257),(575,257,654,257),
        (654,257,654,385),(584,371,654,371),(584,371,584,385),(584,385,654,385),
        (466,376,517,376),(466,262,466,376),(517,262,517,376),(466,262,498,262),
        (517,262,654,262),(517,332,585,332),(585,332,585,371),
        (184,65,184,140),(184,140,184,218),(184,230,184,257),
        (52,140,184,140),(52,140,52,257),(52,257,112,257),(124,257,205,257),
        (112,257,112,328),(112,328,112,360),(26,257,26,322),(26,334,26,360),
        (26,360,112,360),(26,322,75,322),(88,322,112,322),
        (52,218,124,218),(124,218,124,257),(52,257,52,280),
        (318,257,318,298),(318,298,398,298),(398,257,398,298),(398,257,437,257),
        (449,257,498,257),(437,257,437,298),(437,298,466,298),
        (398,65,398,104),(406,104,472,104),(406,65,406,104)
    ]
    for i,s in enumerate(segments):
        add_wall(f"Wall {i:02d}",*s)

    # Windows and balcony glazing.
    for name,x1,y1,x2,y2 in [
        ("Top balcony glazing",185,65,397,65),("Top balcony glazing right",407,65,471,65),
        ("Right balcony glazing",654,145,654,256),("Utility glazing",26,142,26,255)
    ]:
        a,b=pdf(x1,y1),pdf(x2,y2)
        dx,dz=b[0]-a[0],b[1]-a[1]
        add_box(name,((a[0]+b[0])/2,1.35,(a[1]+b[1])/2),(math.hypot(dx,dz),2.5,0.045),M["glass"],0.01,math.atan2(dz,dx))


def build_furniture():
    # Bedrooms.
    add_bed("Bedroom 1 bed",142,77,0,width=1.85,length=2.12,material=M["cream"])
    add_wardrobe("Bedroom 1 wardrobe",72,125,2.7,0)
    add_table("Bedroom 1 desk",160,118,1.25,0.50,0.72,0,M["darkwood"])
    add_chair("Bedroom 1 desk chair",160,105,math.pi,M["taupe"])

    add_bed("Bedroom 2 bed",548,166,0,width=1.72,length=2.05,material=M["cream"])
    add_wardrobe("Bedroom 2 wardrobe",520,116,2.4,0)
    add_table("Bedroom 2 desk",560,205,1.30,0.52,0.72,0,M["darkwood"])
    add_chair("Bedroom 2 desk chair",560,190,math.pi,M["taupe"])

    add_bed("Bedroom 3 bed",620,176,0,width=1.85,length=2.15,material=M["fabric"])
    add_sofa("Bedroom 3 loveseat",622,231,1.65,math.pi/2,M["cream"])
    add_wardrobe("Bedroom 3 wardrobe",622,112,2.7,0)

    add_bed("Bedroom 4 bed",525,333,0,width=1.9,length=2.18,material=M["cream"])
    add_sofa("Bedroom 4 sofa",548,282,1.75,0,M["cream"])
    add_wardrobe("Bedroom 4 wardrobe",486,307,2.4,math.pi/2)

    # Living and family lounge.
    add_rug("Family lounge rug",250,145,3.25,2.45,M["rug"])
    add_sofa("Family lounge sofa",252,151,2.65,math.pi/2,M["fabric"])
    add_chair("Family lounge chair",222,128,math.pi/4,M["taupe"])
    add_coffee_table("Family lounge table",240,147,0.60,0.38,M["darkwood"])

    add_rug("Living rug",365,150,3.60,2.55,M["rug_light"])
    add_sofa("Living main sofa",390,151,2.75,-math.pi/2,M["cream"])
    add_sofa("Living loveseat",352,187,1.75,0,M["cream"])
    add_chair("Living chair left",330,120,0,M["taupe"])
    add_chair("Living chair right",354,120,0,M["taupe"])
    add_coffee_table("Living table large",365,151,0.68,0.36,M["darkwood"])
    add_coffee_table("Living table small",376,165,0.40,0.32,M["black"])

    add_dining("Dining",292,211,0)
    add_table("Dining console",330,239,1.8,0.48,0.78,0,M["darkwood"])

    add_kitchen()

    # Bathrooms.
    add_bathroom("Bathroom 1",65,71,0,True)
    add_bathroom("Bathroom 2",492,55,0,True)
    add_bathroom("Bathroom 3",567,55,0,True)
    add_bathroom("Bathroom 4",615,342,0,True)
    add_toilet("Powder toilet",418,278,0)
    px, _, pz = at(434,278)
    add_box("Powder vanity",(px,0.42,pz),(0.75,0.82,0.42),M["darkwood"],0.035)
    add_cylinder("Powder basin",(px,0.90,pz),0.19,0.12,M["ceramic"],32)

    # Balcony and utility furniture.
    add_chair("Balcony lounge 1",252,40,math.pi,M["taupe"])
    add_chair("Balcony lounge 2",286,40,math.pi,M["taupe"])
    add_sofa("Balcony loveseat",365,42,1.70,math.pi,M["taupe"])
    add_coffee_table("Balcony table",320,42,0.38,0.45,M["ceramic"])
    add_chair("Right balcony chair 1",628,242,math.pi/2,M["taupe"])
    add_chair("Right balcony chair 2",628,274,math.pi/2,M["taupe"])

    for i,(x,y,s) in enumerate(((205,35,.85),(450,35,.85),(635,244,.75),(41,223,.70),(470,244,.70))):
        add_plant(f"Plant {i}",x,y,s)


def normalize_axes_for_export():
    # The drafting helpers use Y as height. Rotate all model geometry into
    # Blender's native Z-up space so the glTF exporter produces a correct
    # Y-up model for Three.js.
    rotation = Matrix.Rotation(math.pi / 2, 4, 'X')
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj.matrix_world = rotation @ obj.matrix_world


def setup_lighting_and_preview():
    world = bpy.context.scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.11,0.12,0.14,1)
    bg.inputs["Strength"].default_value = 0.55

    bpy.ops.object.light_add(type="AREA", location=(-4, -5, 10))
    key = bpy.context.object
    key.name = "Soft daylight"
    key.data.energy = 2600
    key.data.shape = "DISK"
    key.data.size = 10

    bpy.ops.object.light_add(type="AREA", location=(7, 5, 7))
    fill = bpy.context.object
    fill.name = "Interior fill"
    fill.data.energy = 1500
    fill.data.size = 8

    bpy.ops.object.camera_add(location=(0, 0, 27), rotation=(0,0,0))
    cam = bpy.context.object
    cam.name = "Top preview camera"
    cam.rotation_euler = (0,0,0)
    cam.rotation_euler[0] = 0
    # Track camera down the -Z axis.
    direction = Vector((0,0,0)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 25.8
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUT_PREVIEW
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"


def main():
    reset_scene()
    build_architecture()
    build_furniture()
    normalize_axes_for_export()
    setup_lighting_and_preview()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,"apartment_source.blend"))
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {OUT_GLB}")
    print(f"WROTE {OUT_PREVIEW}")


if __name__ == "__main__":
    main()
