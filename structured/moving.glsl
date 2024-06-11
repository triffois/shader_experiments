#version 430 core
const int MAX_ARRAY_SIZE = 40;
const int MAX_BOUNCES = 4;
const float FOCAL_LENGTH = 1.0;
const float WEIGHT_THRESHOLD = 0.01;

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

vec3 rotateX(vec3 direction, float angle) {
  float cosAngle = cos(angle);
  float sinAngle = sin(angle);

  return vec3(direction.x, direction.y * cosAngle - direction.z * sinAngle,
              direction.y * sinAngle + direction.z * cosAngle);
}

vec3 rotateY(vec3 direction, float angle) {
  float cosAngle = cos(angle);
  float sinAngle = sin(angle);

  return vec3(direction.x * cosAngle + direction.z * sinAngle, direction.y,
              -direction.x * sinAngle + direction.z * cosAngle);
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
};
Intersection NOINTERSECT = Intersection(false, false, 0.0, vec3(0), vec3(0),
                                        NOMATERIAL, vec2(0), 0, 0, 0, 0);

Intersection closerIntersection(Intersection a, Intersection b) {
  if (!a.happened) {
    return b;
  }
  if (!b.happened) {
    return a;
  }
  return a.distance < b.distance ? a : b;
}

float intersectAABB(Ray ray, vec3 boxMin, vec3 boxMax) {
  // Special case: we're inside the box
  if (ray.origin.x >= boxMin.x && ray.origin.x <= boxMax.x &&
      ray.origin.y >= boxMin.y && ray.origin.y <= boxMax.y &&
      ray.origin.z >= boxMin.z && ray.origin.z <= boxMax.z) {
    return 0.0;
  }

  vec3 invDir = 1.0 / ray.direction;
  vec3 t0s = (boxMin - ray.origin) * invDir;
  vec3 t1s = (boxMax - ray.origin) * invDir;
  vec3 tsmaller = min(t0s, t1s);
  vec3 tbigger = max(t0s, t1s);
  float tmin = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
  float tmax = min(min(tbigger.x, tbigger.y), tbigger.z);
  if (tmax >= tmin) {
    return tmin;
  }
  return -1.0;
};

Intersection intersectTriangle(Ray ray, Triangle triangle) {
  vec3 edge1 = triangle.v1.xyz - triangle.v0.xyz;
  vec3 edge2 = triangle.v2.xyz - triangle.v0.xyz;

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
  vec3 s = ray.origin - triangle.v0.xyz;
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

  vec2 uv = (1 - u - v) * triangle.uv1 + u * triangle.uv2 + v * triangle.uv3;

  if (texture_data(triangle.material.texture_id, uv).a <
      triangle.material.alpha_cutoff) {
    return NOINTERSECT;
  }

  return Intersection(true, backfacing, t, ray.origin + t * ray.direction,
                      normal, triangle.material, uv, 0, 0, 0, 0);
}

Intersection intersectScene(Ray ray) {
  Intersection closestIntersection = NOINTERSECT;

  // Check whether we intersect the scene at all
  if (intersectAABB(ray, boxes[root_id].min.xyz, boxes[root_id].max.xyz) < 0) {
    return closestIntersection;
  }

  // Create a stack for the boxes as IDs - we need to check
  int stack[MAX_ARRAY_SIZE];
  stack[0] = root_id;
  int stack_size = 1;

  uint debug_boxes_checked = 1;
  uint debug_boxes_hit = 1;
  uint debug_triangles_checked = 0;
  uint debug_triangles_hit = 0;

  while (stack_size > 0) {
    // Pop
    stack_size--;
    int box_id = stack[stack_size];

    Box box = boxes[box_id];

    if (box.left_id == -1 || (stack_size + 1) >= MAX_ARRAY_SIZE) {
      // Iterate over triangles
      for (int i = box.start; i < box.end; i++) {
        debug_triangles_checked++;

        Triangle triangle = triangles[i];
        Intersection intersection = intersectTriangle(ray, triangle);

        if (intersection.happened) {
          debug_triangles_hit++;
        }

        closestIntersection =
            closerIntersection(closestIntersection, intersection);
      }
    } else {
      // Determine which child is closer to the ray origin
      debug_boxes_checked++;
      debug_boxes_checked++;
      float left_distance = intersectAABB(ray, boxes[box.left_id].min.xyz,
                                          boxes[box.left_id].max.xyz);
      float right_distance = intersectAABB(ray, boxes[box.right_id].min.xyz,
                                           boxes[box.right_id].max.xyz);

      bool left_intersected =
          left_distance >= 0 && (left_distance < closestIntersection.distance ||
                                 !closestIntersection.happened);
      bool right_intersected = right_distance >= 0 &&
                               (right_distance < closestIntersection.distance ||
                                !closestIntersection.happened);

      // If there is <= 1 intersection, we can skip the boxes
      if (!left_intersected && !right_intersected) {
        continue;
      }
      debug_boxes_hit++;
      if (!left_intersected) {
        stack[stack_size] = box.right_id;
        stack_size++;
        continue;
      }
      if (!right_intersected) {
        stack[stack_size] = box.left_id;
        stack_size++;
        continue;
      }
      debug_boxes_hit++;

      // We visit the closer one first
      // therefore it's on top of the stack now
      if (left_distance < right_distance) {
        stack[stack_size] = box.right_id;
        stack_size++;
        stack[stack_size] = box.left_id;
        stack_size++;
      } else {
        stack[stack_size] = box.left_id;
        stack_size++;
        stack[stack_size] = box.right_id;
        stack_size++;
      }
    }
  }

  closestIntersection.debug_boxes_checked = debug_boxes_checked;
  closestIntersection.debug_boxes_hit = debug_boxes_hit;
  closestIntersection.debug_triangles_checked = debug_triangles_checked;
  closestIntersection.debug_triangles_hit = debug_triangles_hit;

  return closestIntersection;
}

Ray cameraRay(vec2 uv, vec2 resolution) {
  vec2 sensor_size = vec2(resolution.x / resolution.y, 1);
  vec3 point_on_sensor = vec3((uv - 0.5) * sensor_size, -FOCAL_LENGTH);
  return Ray(position, rotateY(rotateX(normalize(point_on_sensor), rotation.x),
                               rotation.y));
}

vec3 renderRay(Ray ray) {
  Intersection intersection = intersectScene(ray);
  return intersection.happened
             ? texture_data(intersection.material.texture_id, intersection.uv)
                   .rgb
             : ray.direction * 0.5 + 0.5;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;

  Ray ray = cameraRay(uv, iResolution.xy);
  vec3 col = renderRay(ray);

  fragColor = vec4(col, 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
