#version 430 core
const int MAX_GI_BOUNCES = 1;
const int MAX_ARRAY_SIZE = 40;
const int MAX_BOUNCES = 3;
const float FOCAL_LENGTH = 1.0;
const float WEIGHT_THRESHOLD = 0.001;
const float EPSILON = 0.001;
const float AMBIENT = 0.0;

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

// ****** RANDOMNESS ******

vec4 texture_data(uint texture_id, vec2 uv) {
  if (texture_id > 1000000) { // Or any other large enough number
    return vec4(0, 0, 0, 1);
  }
  vec2 size_multiplier = texture_sizes[texture_id].xy;
  return texture(GL_TEXTURE_2D_ARRAY, vec3(uv * size_multiplier, texture_id));
}

vec3 sky_texture(vec3 direction) {
  float theta = atan(direction.z, direction.x);
  float phi = acos(direction.y);
  vec2 uv = vec2(theta / (2.0 * 3.14159265359), phi / 3.14159265359);
  return vec3(0.5, 0.5, 1); /// texture(GL_TEXTURE_2D, uv).rgb;
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
  uint debug_boxes_checked;
  uint debug_boxes_hit;
  uint debug_triangles_checked;
  uint debug_triangles_hit;
};
Intersection NOINTERSECT = Intersection(false, false, 0.0, vec3(0), vec3(0),
                                        NOMATERIAL, vec2(0), -1, 0, 0, 0, 0);

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
                      normal, material, uv, triangle_id, 0, 0, 0, 0);
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

        if (i == ignored_triangle) {
          continue;
        }

        Intersection intersection = intersectTriangle(ray, i);

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

struct Bounce {
  Ray ray;
  vec3 weight;
  int source;
};

vec3 calculateRefraction(vec3 I, vec3 N, float eta) {
  // The builtin one didn't work
  float cosi = dot(N, I);
  float cost2 = 1.0 - eta * eta * (1.0 - cosi * cosi);
  if (cost2 < 0.0)    // Total internal reflection
    return vec3(0.0); // Use vec3(0.0) to symbolize complete reflection

  return eta * I - (eta * cosi + sqrt(cost2)) * N;
}

float fresnel(vec3 I, vec3 N, float eta) {
  float cosi = clamp(dot(I, N), -1.0, 1.0);
  float etai = 1.0, etat = eta;
  if (cosi > 0.0) {
    float c = etat;
    etat = etai;
    etai = c;
  }
  // Using Schlick's approximation
  float R0 = ((etai - etat) / (etai + etat)) * ((etai - etat) / (etai + etat));
  return R0 + (1.0 - R0) * pow(1.0 - abs(cosi), 5.0);
}

float rand(vec2 c) {
  return fract(sin(dot(c.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 ij = floor(p);
  vec2 xy = p - ij;
  float a = rand((ij + vec2(0., 0.)));
  float b = rand((ij + vec2(1., 0.)));
  float c = rand((ij + vec2(0., 1.)));
  float d = rand((ij + vec2(1., 1.)));
  float x1 = mix(a, b, xy.x);
  float x2 = mix(c, d, xy.x);
  return mix(x1, x2, xy.y);
}

vec3 renderRay(Ray ray) {
  Bounce bounces[MAX_ARRAY_SIZE];
  int bounces_length = 1;
  int bounces_start = 0; // It's a queue
  bounces[0] = Bounce(ray, vec3(1.0), -1);

  vec3 accumulated = vec3(0.0);

  for (int i = 0; i < MAX_BOUNCES; i++) {
    if (bounces_length == 0) {
      break;
    }

    bounces_length--;
    Bounce bounce = bounces[imod(bounces_start, MAX_ARRAY_SIZE)];
    bounces_start++;

    if (bounce.weight.x < WEIGHT_THRESHOLD &&
        bounce.weight.y < WEIGHT_THRESHOLD &&
        bounce.weight.z < WEIGHT_THRESHOLD) {
      continue;
    }

    Intersection intersection = intersectScene(bounce.ray, bounce.source);
    if (!intersection.happened) {
      accumulated += sky_texture(ray.direction) * bounce.weight;
      continue;
    }

    // Shadow ray
    Intersection shadow =
        intersectScene(Ray(intersection.position, normalize(vec3(1, 1, 1))),
                       intersection.triangle_id);
    accumulated +=
        bounce.weight *
        max(0, shadow.happened ? AMBIENT
                               : (AMBIENT + dot(intersection.normal,
                                                normalize(vec3(1, 1, 1))))) *
        intersection.material.base_color_factor.rgb *
        texture_data(intersection.material.texture_id, intersection.uv).rgb;

    accumulated +=
        bounce.weight * intersection.material.emissive_color_factor.rgb *
        texture_data(intersection.material.texture_id, intersection.uv).rgb;

    if (bounces_length >= MAX_ARRAY_SIZE) {
      // Can't add more bounces
      continue;
    }

    // Refractive thingys should be wavy :3
    vec3 wavy_normal = normalize(
        intersection.normal +
        vec3(noise(8.0 *
                   vec2(intersection.position.x + intersection.position.y,
                        intersection.position.z + intersection.position.y)),
             noise(8.0 * vec2(intersection.position.x + intersection.position.y,
                              intersection.position.z +
                                  intersection.position.y + 1000.5)),
             noise(8.0 * vec2(intersection.position.x + intersection.position.y,
                              intersection.position.z +
                                  intersection.position.y + 100.0))) *
            0.05 * (1.0 - intersection.material.metallic_factor));

    // Reflected and refracted rays
    float ior = 1.33;
    float eta = 1.0 / ior;
    vec3 reflection = reflect(bounce.ray.direction, wavy_normal);
    vec3 refraction = refract(bounce.ray.direction, wavy_normal, eta);

    // Calculate the factors:
    float fresnel_factor = fresnel(bounce.ray.direction, wavy_normal, ior);
    float reflection_weight = fresnel_factor;
    float refraction_weight = 1.0 - fresnel_factor;

    if (length(refraction) == 0.0) {
      refraction_weight = 0.0;
      reflection_weight = 1.0;
    }

    refraction_weight *= 1.0 - intersection.material.metallic_factor;
    reflection_weight *= 1.0 - intersection.material.metallic_factor;
    reflection_weight += intersection.material.metallic_factor;

    refraction_weight *= 1.0 - intersection.material.roughness_factor;
    reflection_weight *= 1.0 - intersection.material.roughness_factor;

    vec3 reflection_color = reflection_weight * vec3(1); // TODO
    vec3 refraction_color = refraction_weight * vec3(0.5, 0.5, 1);

    // Reflection
    if (reflection_weight != 0.0) {
      bounces[imod(bounces_start + bounces_length, MAX_ARRAY_SIZE)] =
          Bounce(Ray(intersection.position + EPSILON * reflection, reflection),
                 bounce.weight * reflection_color, intersection.triangle_id);
      bounces_length++;
    }

    if (bounces_length >= MAX_ARRAY_SIZE) {
      // Can't add more bounces
      continue;
    }

    if (refraction_weight != 0.0) {
      // Refraction
      bounces[imod(bounces_start + bounces_length, MAX_ARRAY_SIZE)] =
          Bounce(Ray(intersection.position + EPSILON * refraction, refraction),
                 bounce.weight * refraction_color, intersection.triangle_id);
      bounces_length++;
    }

    if (length(bounce.weight) > 0.5) {
      for (int j = 0; j < MAX_GI_BOUNCES; j++) {
        if (bounces_length >= MAX_ARRAY_SIZE) {
          // Can't add more bounces
          continue;
        }

        // Global illumination
        vec3 direction_offset =
            normalize(vec3(random(vec4(intersection.position, iTime)),
                           random(vec4(intersection.position, iTime + 1.0)),
                           random(vec4(intersection.position, iTime + 2.0))) *
                          2.0 -
                      1.0);
        vec3 new_direction = normalize(intersection.normal + direction_offset);
        bounces[imod(bounces_start + bounces_length, MAX_ARRAY_SIZE)] = Bounce(
            Ray(intersection.position + EPSILON * new_direction, new_direction),
            bounce.weight * float(1 / MAX_GI_BOUNCES) *
                texture_data(intersection.material.texture_id, intersection.uv)
                    .rgb,
            intersection.triangle_id);
        bounces_length++;
      }
    }
  }

  return accumulated;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;

  Ray ray = cameraRay(uv, iResolution.xy);
  vec3 col = renderRay(ray);

  float screenGamma = 2.2;
  fragColor = vec4(pow(col * 0.75, vec3(1.0 / screenGamma)), 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
