#version 430 core

const float FOCAL_LENGTH = 1.0f;
const int MAX_ARRAY_SIZE = 128;

out vec4 FragColor;
in vec4 gl_FragCoord;

uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;
uniform int triangle_count;
uniform int root_id;
uniform sampler2DArray GL_TEXTURE_2D_ARRAY;
uniform vec2 rotation;
uniform vec3 position;

layout(std430, binding = 5) buffer texture_sizes_ssbo { vec4 texture_sizes[]; };

vec4 texture_data(uint texture_id, vec2 uv) {
    if (texture_id > 1000000) { // Or any other large enough number
        return vec4(1);
    }
    vec2 size_multiplier = texture_sizes[texture_id].xy;
    return texture(GL_TEXTURE_2D_ARRAY, vec3(uv * size_multiplier, texture_id));
}

struct MaterialProperties {
    uint texture_id;
    uint metallic_roughness_texture_id;

    float metallic_factor;
    float roughness_factor;
    float alpha_cutoff;
    uint double_sided; // aka bool
};
MaterialProperties NOMATERIAL = MaterialProperties(-1, -1, 0, 0, 0, 0);

struct Triangle {
    vec4 v0;
    vec4 v1;
    vec4 v2;
    vec4 min;
    vec4 max;

    vec2 uv1;
    vec2 uv2;
    vec2 uv3;

    MaterialProperties material;
    vec4 emissive_factor;
    vec4 base_color_factor;
};

struct Box {
    vec4 min;
    vec4 max;
    int left_id;
    int right_id;
    int start;
    int end;
};

layout(std430, binding = 3) buffer triangles_ssbo { Triangle triangles[]; };
layout(std430, binding = 4) buffer boxes_ssbo { Box boxes[]; };

struct Ray {
    vec3 origin;
    vec3 direction;
};

vec3 rotate_x(vec3 direction, float angle) {
    float cos_angle = cos(angle);
    float sin_angle = sin(angle);

    return vec3(direction.x, direction.y * cos_angle - direction.z * sin_angle,
            direction.y * sin_angle + direction.z * cos_angle);
}

vec3 rotate_y(vec3 direction, float angle) {
    float cos_angle = cos(angle);
    float sin_angle = sin(angle);

    return vec3(direction.x * cos_angle + direction.z * sin_angle, direction.y,
            -direction.x * sin_angle + direction.z * cos_angle);
}

struct Intersection {
    bool happened;
    bool backfacing;
    float distance;
    vec3 position;
    vec3 normal;
    MaterialProperties material;
    vec2 uv;
    uint debug_boxes_checked;
    uint debug_boxes_hit;
    uint debug_triangles_checked;
    uint debug_triangles_hit;
    vec4 text_data;
};
Intersection NOINTERSECT = Intersection(false, false, 0.0, vec3(0), vec3(0),
        NOMATERIAL, vec2(0), 0, 0, 0, 0, vec4(0));

Intersection get_closer_intersection(Intersection a, Intersection b) {
    if (!a.happened) {
        return b;
    }
    if (!b.happened) {
        return a;
    }
    return a.distance < b.distance ? a : b;
}

float intersectAABB(Ray ray, int box_id) {
    // Special case: we're inside the box
    if (ray.origin.x >= boxes[box_id].min.x && ray.origin.x <= boxes[box_id].max.x &&
            ray.origin.y >= boxes[box_id].min.y && ray.origin.y <= boxes[box_id].max.y &&
            ray.origin.z >= boxes[box_id].min.z && ray.origin.z <= boxes[box_id].max.z) {
        return 0.0;
    }

    vec3 inverted = 1.0 / ray.direction;
    // get distance to intersection with x of boxMin, with y of boxMin and with z of boxMin
    vec3 intersections_with_min = (boxes[box_id].min.xyz - ray.origin) * inverted;
    // same with boxMax
    vec3 intersections_with_max = (boxes[box_id].max.xyz - ray.origin) * inverted;
    // find the first intersection with x, with y and with z
    vec3 firsts = min(intersections_with_min, intersections_with_max);
    // find the second intersections
    vec3 seconds = max(intersections_with_min, intersections_with_max);

    // check that the last of first intersections is before the first of second intersections
    float last_firsts = max(max(firsts.x, firsts.y), firsts.z);
    float first_seconds = min(min(seconds.x, seconds.y), seconds.z);
    if (first_seconds >= last_firsts) {
        return last_firsts;
    }
    return -1.0;
};

Intersection intersect_triangle(Ray ray, int triangle_id) {
    vec3 edge1 = triangles[triangle_id].v1.xyz - triangles[triangle_id].v0.xyz;
    vec3 edge2 = triangles[triangle_id].v2.xyz - triangles[triangle_id].v0.xyz;

    bool backfacing = false;

    vec3 normal = normalize(cross(edge1, edge2));
    if (dot(normal, ray.direction) > 0) {
        normal = -normal;
        backfacing = true;
    }

    vec3 h = cross(ray.direction, edge2);
    float a = dot(edge1, h);
    if (a > -0.00001 && a < 0.00001) {
        return NOINTERSECT;
    }

    float f = 1.0 / a;
    vec3 s = ray.origin - triangles[triangle_id].v0.xyz;
    float u = f * dot(s, h);
    if (u < 0.0 || u > 1.0) {
        return NOINTERSECT;
    }
    vec3 q = cross(s, edge1);
    float v = f * dot(ray.direction, q);
    if (v < 0.0 || u + v > 1.0) {
        return NOINTERSECT;
    }
    float t = f * dot(edge2, q);
    if (t < 0.0) {
        return NOINTERSECT;
    }

    vec2 uv = (1 - u - v) * triangles[triangle_id].uv1 + u * triangles[triangle_id].uv2 + v * triangles[triangle_id].uv3;

    vec4 text_data = texture_data(triangles[triangle_id].material.texture_id, uv);

    if (text_data.a < triangles[triangle_id].material.alpha_cutoff) {
        return NOINTERSECT;
    }

    return Intersection(true, backfacing, t, ray.origin + t * ray.direction,
            normal, triangles[triangle_id].material, uv, 0, 0, 0, 0, text_data);
}

void main() {
    float size_y = 1.0 / iResolution.x * iResolution.y;
    vec2 screen_xy_square = gl_FragCoord.xy / iResolution - 0.5f;
    vec3 screen_pos = vec3(screen_xy_square.x, screen_xy_square.y * size_y, -FOCAL_LENGTH);
    vec3 direction = rotate_y(rotate_x(normalize(screen_pos), rotation.x), rotation.y);
    Ray ray_to_screen = Ray(
            position,
            direction
            );
    FragColor = vec4(direction, 1.0f);
    float distance_to_intersection = intersectAABB(ray_to_screen, root_id);
    if (distance_to_intersection == -1.0f) {
        return;
    }

    int array_of_hit_boxes[MAX_ARRAY_SIZE];
    int i = 0;

    Intersection closer_intersection = Intersection(
            false, false, -1.0f, vec3(0), vec3(0),
            NOMATERIAL, vec2(0), 0, 0, 0, 0, vec4(0)
            );

    int current_id = root_id;
    while (i >= 0) {
        int left_id = boxes[current_id].left_id;
        if (left_id == -1 || i >= MAX_ARRAY_SIZE - 2) {
            int triangles_start = boxes[current_id].start;
            int triangles_end = boxes[current_id].end;

            for (int k = triangles_start; k <= triangles_end; k++) {
                Intersection intersection = intersect_triangle(ray_to_screen, k);
                closer_intersection = get_closer_intersection(closer_intersection, intersection);
            }
            i--;
            current_id = array_of_hit_boxes[i];
            continue;
        }

        float left_distance = intersectAABB(ray_to_screen, left_id);
        int right_id = boxes[current_id].right_id;
        float right_distance = intersectAABB(ray_to_screen, right_id);

        bool left_happened = left_distance != -1.0f && (left_distance < closer_intersection.distance || !closer_intersection.happened);
        bool right_happened = right_distance != -1.0f && (right_distance < closer_intersection.distance || !closer_intersection.happened);

        if (!left_happened && !right_happened) {
            current_id = array_of_hit_boxes[i - 1];
            i--;
        } else if (!left_happened) {
            array_of_hit_boxes[i] = right_id;
            current_id = right_id;
        } else if (!right_happened) {
            array_of_hit_boxes[i] = left_id;
            current_id = left_id;
        } else if (right_distance < left_distance) {
            array_of_hit_boxes[i] = left_id;
            array_of_hit_boxes[i + 1] = right_id;
            current_id = right_id;
            i++;
        } else {
            array_of_hit_boxes[i] = right_id;
            array_of_hit_boxes[i + 1] = left_id;
            current_id = left_id;
            i++;
        }
    }

    if (!closer_intersection.happened) {
        return;
    }
    FragColor = vec4(closer_intersection.text_data.rgb, 1.0f);
}
