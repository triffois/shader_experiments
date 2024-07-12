#version 430 core
const int MAX_ARRAY_SIZE = 25;
const int MAX_BOUNCES = 2;
const float FOCAL_LENGTH = 1.0;
const int RAYS_PER_PIXEL = 1;

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
uniform int fast_render;

layout(std430, binding = 5) buffer texture_sizes_ssbo { vec4 texture_sizes[]; };

int imod(int a, int b) { return a - b * int(float(a) / float(b)); }

// ****** RANDOMNESS ******
// A single iteration of Bob Jenkins' One-At-A-Time hashing algorithm.
uint hash(uint x) {
  x += (x << 10u);
  x ^= (x >> 6u);
  x += (x << 3u);
  x ^= (x >> 11u);
  x += (x << 15u);
  return x;
}

// Compound versions of the hashing algorithm I whipped together.
uint hash(uvec2 v) { return hash(v.x ^ hash(v.y)); }
uint hash(uvec3 v) { return hash(v.x ^ hash(v.y) ^ hash(v.z)); }
uint hash(uvec4 v) { return hash(v.x ^ hash(v.y) ^ hash(v.z) ^ hash(v.w)); }

// Construct a float with half-open range [0:1] using low 23 bits.
// All zeroes yields 0.0, all ones yields the next smallest representable value
// below 1.0.
float floatConstruct(uint m) {
  const uint ieeeMantissa = 0x007FFFFFu; // binary32 mantissa bitmask
  const uint ieeeOne = 0x3F800000u;      // 1.0 in IEEE binary32

  m &= ieeeMantissa; // Keep only mantissa bits (fractional part)
  m |= ieeeOne;      // Add fractional part to 1.0

  float f = uintBitsToFloat(m); // Range [1:2]
  return f - 1.0;               // Range [0:1]
}

// Pseudo-random value in half-open range [0:1].
float random(float x) { return floatConstruct(hash(floatBitsToUint(x))); }
float random(vec2 v) { return floatConstruct(hash(floatBitsToUint(v))); }
float random(vec3 v) { return floatConstruct(hash(floatBitsToUint(v))); }
float random(vec4 v) { return floatConstruct(hash(floatBitsToUint(v))); }

// Normally distributed random value with mean 0 and variance 1.
float toNormal(float u1, float u2) {
  const float twoPi = 6.28318530718;
  return sqrt(-2.0 * log(u1)) * cos(twoPi * u2);
}

// Random point on a unit sphere.
vec3 randomSphere(vec3 seed) {
  return normalize(
      vec3(toNormal(random(seed), random(seed + vec3(1))),
           toNormal(random(seed + vec3(2)), random(seed + vec3(3))),
           toNormal(random(seed + vec3(4)), random(seed + vec3(5)))));
}

// ****** RANDOMNESS ******

vec4 texture_data(uint texture_id, vec2 uv) {
  if (texture_id > 1000000) { // Or any other large enough number
    return vec4(1);
  }
  vec2 size_multiplier = texture_sizes[texture_id].xy;
  return texture(GL_TEXTURE_2D_ARRAY, vec3(uv * size_multiplier, texture_id));
}

vec3 sky_texture(vec3 direction) {
  // float theta = atan(direction.z, direction.x);
  // float phi = acos(direction.y);
  // vec2 uv = vec2(theta / (2.0 * 3.14159265359), phi / 3.14159265359);
  // texture(GL_TEXTURE_2D, uv).rgb;
  return vec3(0.75, 0.75, 1);
}

struct MaterialProperties {
  uint texture_id;
  uint metallic_roughness_texture_id;

  float metallic_factor;
  float roughness_factor;
  float alpha_cutoff;
  uint double_sided; // aka bool
  vec4 emissive_color_factor;
  vec4 base_color_factor;
};
MaterialProperties NOMATERIAL =
    MaterialProperties(-1, -1, 0, 0, 0, 0, vec4(0), vec4(0));

struct Triangle {
  vec4 v0;
  vec4 v1;
  vec4 v2;
  vec4 min;
  vec4 max;

  vec2 uv1;
  vec2 uv2;
  vec2 uv3;

  // Duplicating this cause layout
  uint texture_id;
  uint metallic_roughness_texture_id;

  float metallic_factor;
  float roughness_factor;
  float alpha_cutoff;
  uint double_sided; // aka bool
  vec4 emissive_color_factor;
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
  int triangle_id;
};
Intersection NOINTERSECT =
    Intersection(false, false, 0.0, vec3(0), vec3(0), NOMATERIAL, vec2(0), -1);

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

Intersection intersectTriangle(Ray ray, int triangle_id) {
  Triangle triangle = triangles[triangle_id];

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

  if (texture_data(triangle.texture_id, uv).a < triangle.alpha_cutoff) {
    return NOINTERSECT;
  }

  if (backfacing && triangle.double_sided == 0) {
    return NOINTERSECT;
  }

  MaterialProperties material = MaterialProperties(
      triangle.texture_id, triangle.metallic_roughness_texture_id,

      triangle.metallic_factor, triangle.roughness_factor,
      triangle.alpha_cutoff, triangle.double_sided,
      triangle.emissive_color_factor, triangle.base_color_factor);

  return Intersection(true, backfacing, t, ray.origin + t * ray.direction,
                      normal, material, uv, triangle_id);
}

Intersection intersectScene(Ray ray, int ignored_triangle) {
  Intersection closestIntersection = NOINTERSECT;

  // Check whether we intersect the scene at all
  if (intersectAABB(ray, boxes[root_id].min.xyz, boxes[root_id].max.xyz) < 0) {
    return closestIntersection;
  }

  // Create a stack for the boxes as IDs - we need to check
  int stack[MAX_ARRAY_SIZE];
  stack[0] = root_id;
  int stack_size = 1;

  while (stack_size > 0) {
    // Pop
    stack_size--;
    int box_id = stack[stack_size];

    Box box = boxes[box_id];

    if (box.left_id == -1 || (stack_size + 1) >= MAX_ARRAY_SIZE) {
      // Iterate over triangles
      for (int i = box.start; i < box.end; i++) {
        if (i == ignored_triangle) {
          continue;
        }

        Intersection intersection = intersectTriangle(ray, i);

        closestIntersection =
            closerIntersection(closestIntersection, intersection);
      }
    } else {
      // Determine which child is closer to the ray origin
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

  return closestIntersection;
}

Ray cameraRay(vec2 uv, vec2 resolution) {
  vec2 sensor_size = vec2(resolution.x / resolution.y, 1);
  vec3 point_on_sensor = vec3((uv - 0.5) * sensor_size, -FOCAL_LENGTH);
  return Ray(position, rotateY(rotateX(normalize(point_on_sensor), rotation.x),
                               rotation.y));
}

vec3 cosine_weighted_direction(vec3 normal, vec3 seed) {
  return normalize(normal + randomSphere(seed));
}

vec3 albedo(Intersection intersection) {
  return texture_data(intersection.material.texture_id, intersection.uv).rgb *
         intersection.material.base_color_factor.rgb;
}

vec3 emissiveness(Intersection intersection) {
  return intersection.material.emissive_color_factor.rgb;
}

vec3 renderRay(Ray ray) {
  vec3 accumulated = vec3(0);
  vec3 weight = vec3(1);

  int starting_triangle = -1;

  for (int i = 0; i < MAX_BOUNCES; i++) {
    Intersection intersection = intersectScene(ray, starting_triangle);

    if (!intersection.happened) {
      accumulated += sky_texture(ray.direction) * weight;
      break;
    }

    accumulated += weight * emissiveness(intersection);
    weight *= albedo(intersection);

    if (fast_render != 0) {
      accumulated += weight;
      break;
    }

    ray.origin = intersection.position;
    ray.direction = cosine_weighted_direction(intersection.normal, ray.origin);
    starting_triangle = intersection.triangle_id;
  }

  return accumulated;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {

  vec3 col = vec3(0);

  for (int i = 0; i < RAYS_PER_PIXEL; i++) {
    vec2 antialiasing_adjustment =
        vec2(random(fragCoord + vec2(i * 1024) + vec2(iFrame)),
             random(fragCoord + vec2(1) + vec2(i * 1024) + vec2(iFrame)));
    vec2 uv = (fragCoord.xy + antialiasing_adjustment) / iResolution.xy;
    Ray ray = cameraRay(uv, iResolution.xy);
    col += renderRay(ray);
  }

  col /= float(RAYS_PER_PIXEL);

  float screenGamma = 2.2;
  fragColor = vec4(pow(col * 0.75, vec3(1.0 / screenGamma)), 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
