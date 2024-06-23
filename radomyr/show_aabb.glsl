#version 430 core

float FOCAL_LENGTH = 1.0f;

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
    float distance;
    MaterialProperties material;
    vec2 uv;
};
// Intersection NOINTERSECT = Intersection(false, false, 0.0, vec3(0), vec3(0),
//         NOMATERIAL, vec2(0), 0, 0, 0, 0);

Intersection closerIntersection(Intersection a, Intersection b) {
    if (!a.happened) {
        return b;
    }
    if (!b.happened) {
        return a;
    }
    return a.distance < b.distance ? a : b;
}

float intersectAABB(Ray ray, vec3 box_min, vec3 box_max) {
    // Special case: we're inside the box
    if (ray.origin.x >= box_min.x && ray.origin.x <= box_max.x &&
            ray.origin.y >= box_min.y && ray.origin.y <= box_max.y &&
            ray.origin.z >= box_min.z && ray.origin.z <= box_max.z) {
        return 0.0;
    }

    vec3 inverted = 1.0 / ray.direction;
    // get distance to intersection with x of boxMin, with y of boxMin and with z of boxMin
    vec3 intersections_with_min = (box_min - ray.origin) * inverted;
    // same with boxMax
    vec3 intersections_with_max = (box_max - ray.origin) * inverted;
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

void main() {
    float size_y = 1.0 / iResolution.x * iResolution.y;
    vec2 screen_xy_square = gl_FragCoord.xy / iResolution - 0.5f;
    vec3 screen_pos = vec3(screen_xy_square.x, screen_xy_square.y * size_y, -FOCAL_LENGTH);
    Ray ray_to_screen = Ray(
        position,
        rotate_y(rotate_x(normalize(screen_pos), rotation.x), rotation.y)
    );
    for (int i = 0; i < boxes.length(); i++) {
        Box box = boxes[i];
        if (box.left_id != -1 && box.right_id != -1) {
            continue;
        }
        float distance_to_intersection = intersectAABB(ray_to_screen, box.min.xyz, box.max.xyz);
        if (distance_to_intersection != -1.0) {
            FragColor = vec4(0.5f, 0.5f, 0.5f, 1.0f);
            break;
        }
    }
}
