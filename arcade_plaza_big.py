import bpy
import json
import math
import os
import random
import sys
from mathutils import Vector

# ---------------------------------
# output path passed after "--"
# example:
# blender -b --python arcade_plaza_big.py -- /Users/name/project/arcade_plaza_big.glb
# ---------------------------------
argv = sys.argv
if "--" in argv:
    out_path = argv[argv.index("--") + 1]
else:
    out_path = os.path.join(os.getcwd(), "arcade_plaza_big.glb")

out_dir = os.path.dirname(out_path)
if out_dir:
    os.makedirs(out_dir, exist_ok=True)

layout_path = os.path.join(os.path.dirname(__file__), "road_layout.json")
with open(layout_path, "r", encoding="utf-8") as layout_file:
    layout = json.load(layout_file)

# ---------------------------------
# config
# ---------------------------------
COLLECTION_NAME = "CountryRoadArcade"
ROAD_WIDTH = float(layout["roadWidth"])
WALL_OFFSET = float(layout["wallOffset"])
PLAY_HALF_WIDTH = float(layout["playHalfWidth"])

SHOULDER_WIDTH = max(0.9, WALL_OFFSET - ROAD_WIDTH * 0.5)
WALL_THICKNESS = 0.55
WALL_HEIGHT = 1.6
GROUND_Z = -0.16
CURVE_SAMPLES = 220
GROUND_MARGIN = 42.0
TREE_COUNT = 170
BUSH_COUNT = 56
ROCK_COUNT = 26
POST_STEP = 12
TREE_SEED = 21
STATION_COUNT = 14
STATION_THEMES = [
    "Condemned",
    "TakesCross",
    "FirstFall",
    "MeetsMother",
    "SimonHelps",
    "Veronica",
    "SecondFall",
    "WomenOfJerusalem",
    "ThirdFall",
    "Stripped",
    "Nailed",
    "DiesOnCross",
    "TakenDown",
    "LaidInTomb",
]

ROAD_CONTROL_POINTS = [
    Vector((point[0], point[1], point[2]))
    for point in layout["points"]
]


# ---------------------------------
# helpers
# ---------------------------------
def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for data_block in list(bpy.data.meshes):
        if data_block.users == 0:
            bpy.data.meshes.remove(data_block)

    for data_block in list(bpy.data.materials):
        if data_block.users == 0:
            bpy.data.materials.remove(data_block)


def set_bsdf_input(bsdf, name, value):
    input_socket = bsdf.inputs.get(name)
    if input_socket is not None:
        input_socket.default_value = value


def make_material(
    name,
    color,
    roughness=0.8,
    metallic=0.0,
    specular=0.5,
    emission=(0.0, 0.0, 0.0, 1.0),
    emission_strength=0.0,
):
    existing = bpy.data.materials.get(name)
    if existing:
        bpy.data.materials.remove(existing, do_unlink=True)

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    set_bsdf_input(bsdf, "Base Color", color)
    set_bsdf_input(bsdf, "Roughness", roughness)
    set_bsdf_input(bsdf, "Metallic", metallic)
    set_bsdf_input(bsdf, "Specular IOR Level", specular)
    set_bsdf_input(bsdf, "Specular", specular)

    if emission_strength > 0:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if emission_input is not None:
            emission_input.default_value = emission
        set_bsdf_input(bsdf, "Emission Strength", emission_strength)

    return mat


def make_collection(name):
    existing = bpy.data.collections.get(name)
    if existing is not None:
        return existing

    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def relink_object(obj, collection):
    for user_collection in list(obj.users_collection):
        user_collection.objects.unlink(obj)
    collection.objects.link(obj)


def assign_material(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


def smooth_object(obj):
    if obj.type != "MESH":
        return

    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def add_mesh_object(name, verts, faces, collection, material=None):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    if material is not None:
        assign_material(obj, material)

    smooth_object(obj)
    return obj


def add_box(name, size, location, collection, material, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    bpy.context.view_layer.update()
    relink_object(obj, collection)
    assign_material(obj, material)
    smooth_object(obj)
    return obj


def add_ico_sphere(name, radius, location, collection, material, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions,
        radius=radius,
        location=location,
    )
    obj = bpy.context.active_object
    obj.name = name
    relink_object(obj, collection)
    assign_material(obj, material)
    smooth_object(obj)
    return obj


def add_cone(
    name,
    radius1,
    radius2,
    depth,
    location,
    collection,
    material,
    rotation=(0.0, 0.0, 0.0),
    vertices=10,
):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    relink_object(obj, collection)
    assign_material(obj, material)
    smooth_object(obj)
    return obj


def catmull_rom(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    )


def sample_open_catmull_rom(control_points, samples_per_segment=24):
    points = []
    count = len(control_points)

    for index in range(count - 1):
        p0 = control_points[max(index - 1, 0)]
        p1 = control_points[index]
        p2 = control_points[index + 1]
        p3 = control_points[min(index + 2, count - 1)]

        for step in range(samples_per_segment):
            t = step / samples_per_segment
            points.append(catmull_rom(p0, p1, p2, p3, t))

    points.append(control_points[-1].copy())
    return points


def resample_open_polyline(points, target_count):
    if len(points) < 2:
        return points[:]

    segment_lengths = []
    total_length = 0.0

    for index in range(len(points) - 1):
        length = (points[index + 1] - points[index]).length
        segment_lengths.append(length)
        total_length += length

    if total_length == 0.0:
        return points[:]

    out = []
    step = total_length / max(target_count - 1, 1)
    segment_index = 0
    segment_start = 0.0

    for target_index in range(target_count):
        target_distance = min(total_length, target_index * step)

        while segment_index < len(segment_lengths) - 1:
            segment_length = segment_lengths[segment_index]
            if segment_start + segment_length >= target_distance or segment_length == 0.0:
                break
            segment_start += segment_length
            segment_index += 1

        a = points[segment_index]
        b = points[min(segment_index + 1, len(points) - 1)]
        segment_length = segment_lengths[segment_index]

        if segment_length == 0.0:
            out.append(a.copy())
        else:
            local_t = (target_distance - segment_start) / segment_length
            out.append(a.lerp(b, local_t))

    return out


def compute_frames_open(centerline):
    tangents = []
    left_normals = []

    for index in range(len(centerline)):
        prev_pt = centerline[max(index - 1, 0)]
        next_pt = centerline[min(index + 1, len(centerline) - 1)]
        tangent = next_pt - prev_pt
        tangent.z = 0.0
        if tangent.length == 0.0:
            tangent = Vector((1.0, 0.0, 0.0))
        tangent.normalize()

        left = Vector((-tangent.y, tangent.x, 0.0))
        if left.length == 0.0:
            left = Vector((0.0, 1.0, 0.0))
        left.normalize()

        tangents.append(tangent)
        left_normals.append(left)

    return tangents, left_normals


def build_ribbon_open(name, a_points, b_points, collection, material):
    verts = [point.copy() for point in a_points] + [point.copy() for point in b_points]
    faces = []
    count = len(a_points)

    for index in range(count - 1):
        faces.append([index, index + 1, count + index + 1, count + index])

    return add_mesh_object(name, verts, faces, collection, material)


def add_box_segment(name, a, b, width, height, collection, material):
    direction = b - a
    direction.z = 0.0
    length = direction.length

    if length <= 0.0001:
        return None

    center = (a + b) * 0.5
    center.z += height * 0.5
    angle = math.atan2(direction.y, direction.x)

    return add_box(
        name=name,
        size=(length + 0.25, width, height),
        location=(center.x, center.y, center.z),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=material,
    )


def station_point(origin, tangent, lateral, forward=0.0, side=0.0, z=0.0):
    return origin + tangent * forward + lateral * side + Vector((0.0, 0.0, z))


def add_station_box(
    name,
    origin,
    tangent,
    lateral,
    size,
    collection,
    material,
    forward=0.0,
    side=0.0,
    z=0.0,
    turn=0.0,
):
    location = station_point(origin, tangent, lateral, forward, side, z)
    angle = math.atan2(tangent.y, tangent.x) + turn
    return add_box(
        name=name,
        size=size,
        location=(location.x, location.y, location.z),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=material,
    )


def add_station_sphere(
    name,
    origin,
    tangent,
    lateral,
    radius,
    collection,
    material,
    forward=0.0,
    side=0.0,
    z=0.0,
    subdivisions=2,
):
    location = station_point(origin, tangent, lateral, forward, side, z)
    return add_ico_sphere(
        name=name,
        radius=radius,
        location=(location.x, location.y, location.z),
        collection=collection,
        material=material,
        subdivisions=subdivisions,
    )


def add_station_cone(
    name,
    origin,
    tangent,
    lateral,
    radius1,
    radius2,
    depth,
    collection,
    material,
    forward=0.0,
    side=0.0,
    z=0.0,
    turn=0.0,
    vertices=12,
):
    location = station_point(origin, tangent, lateral, forward, side, z)
    angle = math.atan2(tangent.y, tangent.x) + turn
    return add_cone(
        name=name,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=(location.x, location.y, location.z),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=material,
        vertices=vertices,
    )


def nearest_distance_to_polyline(point, polyline):
    best_distance_sq = float("inf")

    for index in range(len(polyline) - 1):
        a = polyline[index]
        b = polyline[index + 1]
        ab = b - a
        ab.z = 0.0
        ap = point - a
        ap.z = 0.0
        denom = ab.dot(ab)

        if denom == 0.0:
            closest = a
        else:
            t = max(0.0, min(1.0, ap.dot(ab) / denom))
            closest = a.lerp(b, t)

        delta = point - closest
        delta.z = 0.0
        best_distance_sq = min(best_distance_sq, delta.dot(delta))

    return math.sqrt(best_distance_sq)


def create_deciduous_tree(name, location, scale, collection, trunk_mat, canopy_mats):
    rng = random.Random(f"{TREE_SEED}:{name}")
    x, y, z = location

    trunk_height = rng.uniform(4.8, 7.2) * scale
    trunk = add_cone(
        name=f"{name}_Trunk",
        radius1=0.34 * scale,
        radius2=0.12 * scale,
        depth=trunk_height,
        location=(x, y, z + trunk_height * 0.5),
        collection=collection,
        material=trunk_mat,
        vertices=8,
    )
    trunk.rotation_euler.z = rng.uniform(-0.08, 0.08)

    canopy_height = z + trunk_height * 0.78
    for index in range(rng.randint(3, 5)):
        canopy = add_ico_sphere(
            name=f"{name}_Canopy_{index}",
            radius=rng.uniform(1.8, 2.7) * scale,
            location=(
                x + rng.uniform(-1.2, 1.2) * scale,
                y + rng.uniform(-1.2, 1.2) * scale,
                canopy_height + rng.uniform(0.0, 1.8) * scale,
            ),
            collection=collection,
            material=rng.choice(canopy_mats),
            subdivisions=2,
        )
        canopy.scale.x *= rng.uniform(0.85, 1.2)
        canopy.scale.y *= rng.uniform(0.85, 1.2)
        canopy.scale.z *= rng.uniform(0.7, 1.0)


def create_pine_tree(name, location, scale, collection, trunk_mat, canopy_mats):
    rng = random.Random(f"{TREE_SEED}:{name}")
    x, y, z = location

    trunk_height = rng.uniform(6.0, 9.0) * scale
    add_cone(
        name=f"{name}_Trunk",
        radius1=0.20 * scale,
        radius2=0.10 * scale,
        depth=trunk_height,
        location=(x, y, z + trunk_height * 0.5),
        collection=collection,
        material=trunk_mat,
        vertices=8,
    )

    for index in range(rng.randint(3, 4)):
        fraction = index / 3.0
        add_cone(
            name=f"{name}_Tier_{index}",
            radius1=(2.7 - fraction * 1.6) * scale * rng.uniform(0.9, 1.1),
            radius2=0.02 * scale,
            depth=(3.4 - fraction * 1.1) * scale * rng.uniform(0.9, 1.1),
            location=(x, y, z + trunk_height * (0.45 + fraction * 0.22)),
            collection=collection,
            material=rng.choice(canopy_mats),
            vertices=8,
        )


def create_bush(name, location, scale, collection, canopy_mats):
    rng = random.Random(f"{TREE_SEED}:{name}")
    x, y, z = location

    for index in range(rng.randint(2, 3)):
        piece = add_ico_sphere(
            name=f"{name}_Part_{index}",
            radius=rng.uniform(0.9, 1.4) * scale,
            location=(
                x + rng.uniform(-0.8, 0.8) * scale,
                y + rng.uniform(-0.8, 0.8) * scale,
                z + rng.uniform(0.4, 0.8) * scale,
            ),
            collection=collection,
            material=rng.choice(canopy_mats),
            subdivisions=2,
        )
        piece.scale.z *= rng.uniform(0.45, 0.7)


def create_rock(name, location, scale, collection, rock_mat):
    rng = random.Random(f"{TREE_SEED}:{name}")
    x, y, z = location

    rock = add_ico_sphere(
        name=name,
        radius=scale,
        location=(x, y, z + scale * 0.45),
        collection=collection,
        material=rock_mat,
        subdivisions=1,
    )
    rock.scale.x *= rng.uniform(0.7, 1.3)
    rock.scale.y *= rng.uniform(0.7, 1.3)
    rock.scale.z *= rng.uniform(0.45, 0.9)
    rock.rotation_euler = (
        rng.uniform(0.0, 1.5),
        rng.uniform(0.0, 1.5),
        rng.uniform(0.0, math.pi),
    )


def build_gate(name, index, centerline, tangents, left_normals, collection, pillar_mat, accent_mat, glow_mat):
    center = centerline[index].copy()
    tangent = tangents[index]
    left = left_normals[index]
    angle = math.atan2(tangent.y, tangent.x)

    post_offset = WALL_OFFSET + 1.35
    gate_height = 5.8

    left_post = center + left * post_offset
    right_post = center - left * post_offset

    add_box(
        name=f"{name}_LeftPost",
        size=(1.2, 1.2, gate_height),
        location=(left_post.x, left_post.y, gate_height * 0.5),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=pillar_mat,
    )
    add_box(
        name=f"{name}_RightPost",
        size=(1.2, 1.2, gate_height),
        location=(right_post.x, right_post.y, gate_height * 0.5),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=pillar_mat,
    )
    add_box(
        name=f"{name}_Beam",
        size=(1.1, post_offset * 2.0 + 1.2, 0.9),
        location=(center.x, center.y, gate_height - 0.3),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=pillar_mat,
    )
    add_box(
        name=f"{name}_Accent",
        size=(0.28, ROAD_WIDTH + 2.2, 0.22),
        location=(center.x, center.y, gate_height - 0.9),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=accent_mat,
    )
    add_box(
        name=f"{name}_Glow",
        size=(0.18, ROAD_WIDTH + 0.8, 0.18),
        location=(center.x, center.y, gate_height - 0.55),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=glow_mat,
    )

    band_z = 0.03 if name == "StartGate" else 0.04
    add_box(
        name=f"{name}_Band",
        size=(0.28, ROAD_WIDTH * 0.96, 0.05),
        location=(center.x, center.y, band_z),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=accent_mat,
    )


def add_station_cross(
    name,
    origin,
    tangent,
    lateral,
    collection,
    material,
    forward=0.0,
    side=0.0,
    base_z=0.95,
    height=2.3,
    beam_width=1.22,
    turn=0.0,
    lean=0.0,
):
    stem = add_station_box(
        name=f"{name}_Stem",
        origin=origin,
        tangent=tangent,
        lateral=lateral,
        size=(0.18, 0.18, height),
        collection=collection,
        material=material,
        forward=forward,
        side=side,
        z=base_z + height * 0.5,
        turn=turn,
    )
    beam = add_station_box(
        name=f"{name}_Beam",
        origin=origin,
        tangent=tangent,
        lateral=lateral,
        size=(0.16, beam_width, 0.16),
        collection=collection,
        material=material,
        forward=forward,
        side=side,
        z=base_z + height * 0.72,
        turn=turn,
    )
    stem.rotation_euler.y = lean
    beam.rotation_euler.y = lean
    return stem, beam


def add_station_figure(
    name,
    origin,
    tangent,
    lateral,
    collection,
    robe_mat,
    head_mat,
    halo_mat=None,
    forward=0.0,
    side=0.0,
    scale=1.0,
    kneel=False,
    bowed=False,
):
    body_depth = 1.25 * scale if not kneel else 0.82 * scale
    base_z = 1.08 if not kneel else 0.82
    robe = add_station_cone(
        name=f"{name}_Robe",
        origin=origin,
        tangent=tangent,
        lateral=lateral,
        radius1=0.34 * scale,
        radius2=0.12 * scale,
        depth=body_depth,
        collection=collection,
        material=robe_mat,
        forward=forward,
        side=side,
        z=base_z + body_depth * 0.5,
    )
    add_station_sphere(
        name=f"{name}_Head",
        origin=origin,
        tangent=tangent,
        lateral=lateral,
        radius=0.17 * scale,
        collection=collection,
        material=head_mat,
        forward=forward + (0.08 if bowed else 0.0),
        side=side,
        z=base_z + body_depth + 0.28 * scale - (0.14 if bowed else 0.0),
    )
    if bowed:
        robe.rotation_euler.y = -0.24

    if halo_mat is not None:
        halo = add_station_cone(
            name=f"{name}_Halo",
            origin=origin,
            tangent=tangent,
            lateral=lateral,
            radius1=0.23 * scale,
            radius2=0.23 * scale,
            depth=0.05,
            collection=collection,
            material=halo_mat,
            forward=forward - 0.02,
            side=side,
            z=base_z + body_depth + 0.3 * scale,
            vertices=16,
        )
        halo.rotation_euler.x = math.pi * 0.5


def build_station_icon(
    name,
    station_number,
    shrine_center,
    tangent,
    lateral,
    collection,
    stone_mat,
    accent_mat,
    figure_mat,
    cloth_mat,
    glow_mat,
    rock_mat,
):
    motif = STATION_THEMES[station_number]
    icon_origin = shrine_center + lateral * -0.12

    if motif == "Condemned":
        add_station_box(
            name=f"{name}_TribuneSeat",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.55, 0.78, 0.28),
            collection=collection,
            material=accent_mat,
            z=1.04,
        )
        add_station_box(
            name=f"{name}_TribuneBack",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.16, 0.7, 1.08),
            collection=collection,
            material=accent_mat,
            side=0.18,
            z=1.58,
        )
        for side in (-0.46, 0.46):
            add_station_cone(
                name=f"{name}_Pillar_{'L' if side < 0 else 'R'}",
                origin=icon_origin,
                tangent=tangent,
                lateral=lateral,
                radius1=0.09,
                radius2=0.07,
                depth=1.45,
                collection=collection,
                material=figure_mat,
                side=side,
                z=1.52,
                vertices=8,
            )
        add_station_sphere(
            name=f"{name}_Seal",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            radius=0.2,
            collection=collection,
            material=glow_mat,
            z=2.3,
            subdivisions=1,
        )
        return

    if motif == "TakesCross":
        add_station_figure(
            name=f"{name}_Christ",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=figure_mat,
            head_mat=cloth_mat,
            halo_mat=glow_mat,
            scale=0.96,
            bowed=True,
        )
        add_station_cross(
            name=f"{name}_Cross",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            material=accent_mat,
            forward=-0.1,
            side=0.34,
            base_z=1.0,
            height=2.55,
            beam_width=1.36,
            lean=0.35,
        )
        return

    if motif == "FirstFall":
        add_station_figure(
            name=f"{name}_Christ",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=figure_mat,
            head_mat=cloth_mat,
            halo_mat=glow_mat,
            forward=-0.14,
            side=-0.18,
            scale=0.88,
            kneel=True,
            bowed=True,
        )
        add_station_cross(
            name=f"{name}_Cross",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            material=accent_mat,
            forward=0.12,
            side=0.26,
            base_z=0.78,
            height=2.0,
            beam_width=1.18,
            lean=1.04,
        )
        add_station_sphere(
            name=f"{name}_Stone",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            radius=0.28,
            collection=collection,
            material=rock_mat,
            forward=0.48,
            side=-0.42,
            z=0.96,
            subdivisions=1,
        )
        return

    if motif == "MeetsMother":
        add_station_figure(
            name=f"{name}_Christ",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=figure_mat,
            head_mat=cloth_mat,
            halo_mat=glow_mat,
            forward=-0.18,
            side=-0.26,
            scale=0.9,
            bowed=True,
        )
        add_station_figure(
            name=f"{name}_Mary",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=cloth_mat,
            head_mat=stone_mat,
            halo_mat=glow_mat,
            forward=0.18,
            side=0.22,
            scale=0.88,
        )
        return

    if motif == "SimonHelps":
        add_station_figure(
            name=f"{name}_Christ",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=figure_mat,
            head_mat=cloth_mat,
            halo_mat=glow_mat,
            forward=-0.12,
            side=-0.28,
            scale=0.9,
            bowed=True,
        )
        add_station_figure(
            name=f"{name}_Simon",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=accent_mat,
            head_mat=cloth_mat,
            forward=0.2,
            side=0.14,
            scale=0.88,
        )
        add_station_cross(
            name=f"{name}_SharedCross",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            material=accent_mat,
            forward=0.03,
            side=0.26,
            base_z=1.06,
            height=2.28,
            beam_width=1.28,
            lean=0.24,
        )
        return

    if motif == "Veronica":
        add_station_figure(
            name=f"{name}_Veronica",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=cloth_mat,
            head_mat=stone_mat,
            halo_mat=glow_mat,
            forward=-0.22,
            side=-0.3,
            scale=0.86,
        )
        add_station_box(
            name=f"{name}_Veil",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.08, 0.92, 0.72),
            collection=collection,
            material=cloth_mat,
            forward=0.08,
            z=1.72,
        )
        add_station_sphere(
            name=f"{name}_FaceImprint",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            radius=0.15,
            collection=collection,
            material=glow_mat,
            forward=0.08,
            z=1.8,
            subdivisions=1,
        )
        return

    if motif == "SecondFall":
        add_station_figure(
            name=f"{name}_Christ",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=figure_mat,
            head_mat=cloth_mat,
            halo_mat=glow_mat,
            forward=-0.18,
            side=-0.16,
            scale=0.82,
            kneel=True,
            bowed=True,
        )
        add_station_cross(
            name=f"{name}_Cross",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            material=accent_mat,
            forward=0.16,
            side=0.22,
            base_z=0.82,
            height=1.95,
            beam_width=1.14,
            lean=0.92,
        )
        for side in (-0.42, 0.38):
            add_station_sphere(
                name=f"{name}_Rock_{'L' if side < 0 else 'R'}",
                origin=icon_origin,
                tangent=tangent,
                lateral=lateral,
                radius=0.22,
                collection=collection,
                material=rock_mat,
                side=side,
                z=0.86,
                subdivisions=1,
            )
        return

    if motif == "WomenOfJerusalem":
        for label, forward, side, scale in [
            ("Left", -0.24, -0.36, 0.76),
            ("Center", 0.0, 0.02, 0.88),
            ("Right", 0.24, 0.34, 0.8),
        ]:
            add_station_figure(
                name=f"{name}_{label}",
                origin=icon_origin,
                tangent=tangent,
                lateral=lateral,
                collection=collection,
                robe_mat=cloth_mat,
                head_mat=stone_mat,
                halo_mat=glow_mat if label == "Center" else None,
                forward=forward,
                side=side,
                scale=scale,
            )
        return

    if motif == "ThirdFall":
        add_station_box(
            name=f"{name}_Mound",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.8, 1.05, 0.36),
            collection=collection,
            material=rock_mat,
            forward=0.1,
            z=0.98,
            turn=0.2,
        )
        add_station_figure(
            name=f"{name}_Christ",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=figure_mat,
            head_mat=cloth_mat,
            halo_mat=glow_mat,
            forward=-0.1,
            side=-0.18,
            scale=0.78,
            kneel=True,
            bowed=True,
        )
        add_station_cross(
            name=f"{name}_Cross",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            material=accent_mat,
            forward=0.22,
            side=0.3,
            base_z=0.88,
            height=1.92,
            beam_width=1.12,
            lean=1.18,
        )
        return

    if motif == "Stripped":
        for side in (-0.36, 0.36):
            add_station_cone(
                name=f"{name}_Pole_{'L' if side < 0 else 'R'}",
                origin=icon_origin,
                tangent=tangent,
                lateral=lateral,
                radius1=0.08,
                radius2=0.08,
                depth=1.6,
                collection=collection,
                material=accent_mat,
                side=side,
                z=1.52,
                vertices=8,
            )
        add_station_box(
            name=f"{name}_Robe",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.06, 0.8, 1.0),
            collection=collection,
            material=cloth_mat,
            z=1.72,
        )
        return

    if motif == "Nailed":
        add_station_box(
            name=f"{name}_Crossbeam",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.16, 1.55, 0.16),
            collection=collection,
            material=accent_mat,
            z=1.08,
        )
        add_station_box(
            name=f"{name}_Timber",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(1.48, 0.18, 0.18),
            collection=collection,
            material=accent_mat,
            forward=0.04,
            z=1.08,
            turn=math.pi * 0.5,
        )
        add_station_box(
            name=f"{name}_Hammer",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.48, 0.12, 0.12),
            collection=collection,
            material=figure_mat,
            forward=0.44,
            side=0.32,
            z=1.56,
            turn=0.34,
        )
        for index, side in enumerate((-0.32, 0.0, 0.32), start=1):
            add_station_sphere(
                name=f"{name}_Nail_{index}",
                origin=icon_origin,
                tangent=tangent,
                lateral=lateral,
                radius=0.09,
                collection=collection,
                material=glow_mat,
                side=side,
                z=1.12,
                subdivisions=1,
            )
        return

    if motif == "DiesOnCross":
        add_station_cross(
            name=f"{name}_Cross",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            material=accent_mat,
            base_z=0.96,
            height=2.9,
            beam_width=1.42,
        )
        add_station_sphere(
            name=f"{name}_Sun",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            radius=0.16,
            collection=collection,
            material=glow_mat,
            side=-0.54,
            z=2.78,
            subdivisions=1,
        )
        add_station_sphere(
            name=f"{name}_Moon",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            radius=0.14,
            collection=collection,
            material=figure_mat,
            side=0.54,
            z=2.62,
            subdivisions=1,
        )
        return

    if motif == "TakenDown":
        add_station_cross(
            name=f"{name}_Cross",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            material=accent_mat,
            forward=0.34,
            side=0.18,
            base_z=0.9,
            height=2.1,
            beam_width=1.1,
            lean=0.52,
        )
        add_station_figure(
            name=f"{name}_Mary",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            collection=collection,
            robe_mat=cloth_mat,
            head_mat=stone_mat,
            halo_mat=glow_mat,
            forward=-0.18,
            side=-0.26,
            scale=0.82,
        )
        add_station_box(
            name=f"{name}_Body",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.96, 0.24, 0.18),
            collection=collection,
            material=figure_mat,
            forward=0.02,
            side=-0.02,
            z=1.28,
            turn=0.28,
        )
        return

    if motif == "LaidInTomb":
        add_station_box(
            name=f"{name}_Chamber",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(1.1, 1.5, 1.38),
            collection=collection,
            material=rock_mat,
            side=0.08,
            z=1.46,
        )
        add_station_box(
            name=f"{name}_Threshold",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            size=(0.7, 1.18, 0.22),
            collection=collection,
            material=stone_mat,
            z=0.92,
        )
        add_station_sphere(
            name=f"{name}_Stone",
            origin=icon_origin,
            tangent=tangent,
            lateral=lateral,
            radius=0.48,
            collection=collection,
            material=accent_mat,
            forward=0.34,
            side=-0.58,
            z=1.0,
            subdivisions=1,
        )


def build_station(
    name,
    station_number,
    index,
    side,
    centerline,
    tangents,
    left_normals,
    collection,
    stone_mat,
    accent_mat,
    figure_mat,
    cloth_mat,
    glow_mat,
    rock_mat,
):
    center = centerline[index]
    tangent = tangents[index]
    left = left_normals[index] * side
    angle = math.atan2(tangent.y, tangent.x)
    title_slug = STATION_THEMES[station_number]

    station_center = center + left * (WALL_OFFSET + 4.4)
    shrine_back = station_center + left * 0.55

    add_box(
        name=f"{name}_Base",
        size=(2.0, 1.3, 0.8),
        location=(station_center.x, station_center.y, 0.4),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=stone_mat,
    )
    add_box(
        name=f"{name}_Backdrop",
        size=(0.45, 1.9, 3.4),
        location=(shrine_back.x, shrine_back.y, 2.0),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=stone_mat,
    )
    add_box(
        name=f"{name}_{title_slug}_Lintel",
        size=(0.18, 2.08, 0.16),
        location=(station_center.x, station_center.y, 3.08),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=accent_mat,
    )
    add_box(
        name=f"{name}_Crown",
        size=(0.34, 1.22, 0.18),
        location=(station_center.x, station_center.y, 3.72),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=accent_mat,
    )
    add_box(
        name=f"{name}_Plaque",
        size=(0.12, 0.88, 0.48),
        location=(station_center.x, station_center.y, 2.1),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=accent_mat,
    )

    build_station_icon(
        name=f"{name}_{title_slug}",
        station_number=station_number,
        shrine_center=station_center,
        tangent=tangent,
        lateral=left,
        collection=collection,
        stone_mat=stone_mat,
        accent_mat=accent_mat,
        figure_mat=figure_mat,
        cloth_mat=cloth_mat,
        glow_mat=glow_mat,
        rock_mat=rock_mat,
    )


def scatter_world(centerline, collection, trunk_mat, canopy_mats, bush_mats, rock_mat):
    random.seed(TREE_SEED)
    xs = [point.x for point in centerline]
    ys = [point.y for point in centerline]
    min_x = min(xs) - GROUND_MARGIN * 0.7
    max_x = max(xs) + GROUND_MARGIN * 0.7
    min_y = min(ys) - GROUND_MARGIN * 0.8
    max_y = max(ys) + GROUND_MARGIN * 0.8

    placed = []

    def too_close(x, y, distance):
        for px, py in placed:
            if math.hypot(x - px, y - py) < distance:
                return True
        return False

    def can_place(x, y, clearance, spacing):
        if too_close(x, y, spacing):
            return False
        if nearest_distance_to_polyline(Vector((x, y, 0.0)), centerline) < clearance:
            return False
        return True

    tree_clearance = WALL_OFFSET + 6.0
    for index in range(TREE_COUNT):
        for _ in range(40):
            x = random.uniform(min_x, max_x)
            y = random.uniform(min_y, max_y)
            if not can_place(x, y, tree_clearance, 4.2):
                continue

            scale = random.uniform(0.8, 1.5)
            if random.random() < 0.52:
                create_deciduous_tree(
                    name=f"Tree_{index:03d}",
                    location=(x, y, 0.0),
                    scale=scale,
                    collection=collection,
                    trunk_mat=trunk_mat,
                    canopy_mats=canopy_mats,
                )
            else:
                create_pine_tree(
                    name=f"Pine_{index:03d}",
                    location=(x, y, 0.0),
                    scale=scale,
                    collection=collection,
                    trunk_mat=trunk_mat,
                    canopy_mats=canopy_mats,
                )
            placed.append((x, y))
            break

    for index in range(BUSH_COUNT):
        for _ in range(25):
            x = random.uniform(min_x, max_x)
            y = random.uniform(min_y, max_y)
            if not can_place(x, y, WALL_OFFSET + 3.0, 2.8):
                continue
            create_bush(
                name=f"Bush_{index:03d}",
                location=(x, y, 0.0),
                scale=random.uniform(0.8, 1.3),
                collection=collection,
                canopy_mats=bush_mats,
            )
            placed.append((x, y))
            break

    for index in range(ROCK_COUNT):
        for _ in range(25):
            x = random.uniform(min_x, max_x)
            y = random.uniform(min_y, max_y)
            if not can_place(x, y, WALL_OFFSET + 2.2, 3.0):
                continue
            create_rock(
                name=f"Rock_{index:03d}",
                location=(x, y, 0.0),
                scale=random.uniform(0.8, 1.7),
                collection=collection,
                rock_mat=rock_mat,
            )
            placed.append((x, y))
            break


def export_selected(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext != ".glb":
        raise ValueError(f"Unsupported export format: {ext}. Use .glb")

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
    )


# ---------------------------------
# build scene
# ---------------------------------
clear_scene()
collection = make_collection(COLLECTION_NAME)

grass_mat = make_material(
    "Grass_Mat",
    color=(0.13, 0.29, 0.11, 1.0),
    roughness=1.0,
    metallic=0.0,
    specular=0.08,
)
soil_mat = make_material(
    "Soil_Mat",
    color=(0.18, 0.13, 0.10, 1.0),
    roughness=0.96,
    metallic=0.0,
    specular=0.08,
)
road_mat = make_material(
    "Road_Mat",
    color=(0.13, 0.13, 0.14, 1.0),
    roughness=0.92,
    metallic=0.0,
    specular=0.2,
)
shoulder_mat = make_material(
    "Shoulder_Mat",
    color=(0.46, 0.40, 0.33, 1.0),
    roughness=0.96,
    metallic=0.0,
    specular=0.1,
)
wall_mat = make_material(
    "Wall_Mat",
    color=(0.58, 0.58, 0.58, 1.0),
    roughness=0.84,
    metallic=0.0,
    specular=0.18,
)
stripe_mat = make_material(
    "Stripe_Mat",
    color=(0.88, 0.77, 0.35, 1.0),
    roughness=0.48,
    metallic=0.0,
    specular=0.28,
)
start_mat = make_material(
    "Start_Mat",
    color=(0.18, 0.60, 0.56, 1.0),
    roughness=0.34,
    metallic=0.0,
    specular=0.42,
)
end_mat = make_material(
    "End_Mat",
    color=(0.80, 0.36, 0.24, 1.0),
    roughness=0.35,
    metallic=0.0,
    specular=0.42,
)
glow_mat = make_material(
    "Glow_Mat",
    color=(0.98, 0.92, 0.74, 1.0),
    roughness=0.18,
    metallic=0.0,
    specular=0.4,
    emission=(0.96, 0.84, 0.38, 1.0),
    emission_strength=4.0,
)
trunk_mat = make_material(
    "Trunk_Mat",
    color=(0.18, 0.11, 0.06, 1.0),
    roughness=1.0,
    metallic=0.0,
    specular=0.05,
)
canopy_dark = make_material(
    "Canopy_Dark_Mat",
    color=(0.08, 0.21, 0.07, 1.0),
    roughness=0.95,
    metallic=0.0,
    specular=0.08,
)
canopy_mid = make_material(
    "Canopy_Mid_Mat",
    color=(0.11, 0.31, 0.10, 1.0),
    roughness=0.90,
    metallic=0.0,
    specular=0.10,
)
canopy_light = make_material(
    "Canopy_Light_Mat",
    color=(0.18, 0.39, 0.15, 1.0),
    roughness=0.88,
    metallic=0.0,
    specular=0.10,
)
rock_mat = make_material(
    "Rock_Mat",
    color=(0.36, 0.36, 0.37, 1.0),
    roughness=0.96,
    metallic=0.0,
    specular=0.06,
)
station_mat = make_material(
    "Station_Mat",
    color=(0.67, 0.63, 0.58, 1.0),
    roughness=0.82,
    metallic=0.0,
    specular=0.16,
)
station_accent_mat = make_material(
    "Station_Accent_Mat",
    color=(0.58, 0.28, 0.20, 1.0),
    roughness=0.44,
    metallic=0.0,
    specular=0.28,
)
station_figure_mat = make_material(
    "Station_Figure_Mat",
    color=(0.29, 0.24, 0.21, 1.0),
    roughness=0.7,
    metallic=0.0,
    specular=0.16,
)
station_cloth_mat = make_material(
    "Station_Cloth_Mat",
    color=(0.88, 0.84, 0.76, 1.0),
    roughness=0.8,
    metallic=0.0,
    specular=0.14,
)
station_glow_mat = make_material(
    "Station_Glow_Mat",
    color=(0.88, 0.69, 0.37, 1.0),
    roughness=0.2,
    metallic=0.02,
    specular=0.38,
    emission=(0.96, 0.78, 0.34, 1.0),
    emission_strength=0.9,
)

canopy_mats = [canopy_dark, canopy_mid, canopy_light]
bush_mats = [canopy_dark, canopy_mid]

raw_path = sample_open_catmull_rom(ROAD_CONTROL_POINTS, samples_per_segment=32)
centerline = resample_open_polyline(raw_path, CURVE_SAMPLES)
tangents, left_normals = compute_frames_open(centerline)

half_road = ROAD_WIDTH * 0.5
road_left = []
road_right = []
shoulder_left = []
shoulder_right = []
wall_left_centers = []
wall_right_centers = []

for index, center in enumerate(centerline):
    left = left_normals[index]
    road_left.append(center + left * half_road + Vector((0.0, 0.0, 0.03)))
    road_right.append(center - left * half_road + Vector((0.0, 0.0, 0.03)))
    shoulder_left.append(center + left * WALL_OFFSET + Vector((0.0, 0.0, 0.02)))
    shoulder_right.append(center - left * WALL_OFFSET + Vector((0.0, 0.0, 0.02)))
    wall_left_centers.append(center + left * (WALL_OFFSET + WALL_THICKNESS * 0.5))
    wall_right_centers.append(center - left * (WALL_OFFSET + WALL_THICKNESS * 0.5))

xs = [point.x for point in centerline]
ys = [point.y for point in centerline]
ground_size_x = (max(xs) - min(xs)) + GROUND_MARGIN * 2.0
ground_size_y = (max(ys) - min(ys)) + GROUND_MARGIN * 2.0
ground_center_x = (max(xs) + min(xs)) * 0.5
ground_center_y = (max(ys) + min(ys)) * 0.5

add_box(
    name="Ground_Base",
    size=(ground_size_x, ground_size_y, 0.4),
    location=(ground_center_x, ground_center_y, GROUND_Z),
    collection=collection,
    material=grass_mat,
)

for index in range(24):
    patch_x = random.uniform(min(xs) - GROUND_MARGIN * 0.5, max(xs) + GROUND_MARGIN * 0.5)
    patch_y = random.uniform(min(ys) - GROUND_MARGIN * 0.6, max(ys) + GROUND_MARGIN * 0.6)
    if nearest_distance_to_polyline(Vector((patch_x, patch_y, 0.0)), centerline) < WALL_OFFSET + 2.0:
        continue
    add_box(
        name=f"Soil_{index:02d}",
        size=(random.uniform(10.0, 18.0), random.uniform(6.0, 12.0), 0.05),
        location=(patch_x, patch_y, GROUND_Z + 0.18),
        rotation=(0.0, 0.0, random.uniform(0.0, math.pi)),
        collection=collection,
        material=soil_mat,
    )

road = build_ribbon_open("Road", road_left, road_right, collection, road_mat)
shoulder_a = build_ribbon_open("ShoulderLeft", road_left, shoulder_left, collection, shoulder_mat)
shoulder_b = build_ribbon_open("ShoulderRight", shoulder_right, road_right, collection, shoulder_mat)

for index in range(len(centerline) - 1):
    add_box_segment(
        name=f"WallLeft_{index:03d}",
        a=wall_left_centers[index],
        b=wall_left_centers[index + 1],
        width=WALL_THICKNESS,
        height=WALL_HEIGHT,
        collection=collection,
        material=wall_mat,
    )
    add_box_segment(
        name=f"WallRight_{index:03d}",
        a=wall_right_centers[index],
        b=wall_right_centers[index + 1],
        width=WALL_THICKNESS,
        height=WALL_HEIGHT,
        collection=collection,
        material=wall_mat,
    )

for index in range(8, len(centerline) - 8, 7):
    tangent = tangents[index]
    angle = math.atan2(tangent.y, tangent.x)
    center = centerline[index]
    add_box(
        name=f"Stripe_{index:03d}",
        size=(2.4, 0.26, 0.05),
        location=(center.x, center.y, 0.065),
        rotation=(0.0, 0.0, angle),
        collection=collection,
        material=stripe_mat,
    )

for index in range(POST_STEP, len(centerline) - POST_STEP, POST_STEP):
    center = centerline[index]
    left = left_normals[index]
    tangent = tangents[index]
    angle = math.atan2(tangent.y, tangent.x)

    for side_name, direction in [("Left", 1.0), ("Right", -1.0)]:
        post_center = center + left * direction * (WALL_OFFSET + 0.9)
        add_box(
            name=f"Post_{side_name}_{index:03d}",
            size=(0.22, 0.22, 0.9),
            location=(post_center.x, post_center.y, 0.45),
            rotation=(0.0, 0.0, angle),
            collection=collection,
            material=glow_mat,
        )

build_gate(
    name="StartGate",
    index=2,
    centerline=centerline,
    tangents=tangents,
    left_normals=left_normals,
    collection=collection,
    pillar_mat=wall_mat,
    accent_mat=start_mat,
    glow_mat=glow_mat,
)
build_gate(
    name="FinishGate",
    index=len(centerline) - 3,
    centerline=centerline,
    tangents=tangents,
    left_normals=left_normals,
    collection=collection,
    pillar_mat=wall_mat,
    accent_mat=end_mat,
    glow_mat=glow_mat,
)

for station_number in range(STATION_COUNT):
    fraction = (station_number + 1) / (STATION_COUNT + 1)
    station_index = max(5, min(len(centerline) - 6, int(fraction * (len(centerline) - 1))))
    station_side = -1.0 if station_number % 2 == 0 else 1.0
    build_station(
        name=f"Station_{station_number + 1:02d}",
        station_number=station_number,
        index=station_index,
        side=station_side,
        centerline=centerline,
        tangents=tangents,
        left_normals=left_normals,
        collection=collection,
        stone_mat=station_mat,
        accent_mat=station_accent_mat,
        figure_mat=station_figure_mat,
        cloth_mat=station_cloth_mat,
        glow_mat=station_glow_mat,
        rock_mat=rock_mat,
    )

scatter_world(centerline, collection, trunk_mat, canopy_mats, bush_mats, rock_mat)

# ---------------------------------
# export
# ---------------------------------
bpy.ops.object.select_all(action="DESELECT")
for obj in collection.objects:
    if obj.type == "MESH":
        obj.select_set(True)

active = road or shoulder_a or shoulder_b
if active is not None:
    bpy.context.view_layer.objects.active = active

export_selected(out_path)
print(f"Exported: {out_path}")
