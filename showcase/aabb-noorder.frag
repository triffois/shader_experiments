#version 430 core
const int MAX_ARRAY_SIZE = 25;
const float FOCAL_LENGTH = 1;

out vec4 FragColor;
in vec4 gl_FragCoord;

uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;
uniform int triangle_count;
uniform int root_id;
uniform sampler2DArray GL_TEXTURE_2D_ARRAY;

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

    if (intersectAABB(ray, box.min.xyz, box.max.xyz) < 0) {
      continue;
    }

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
      stack[stack_size] = box.right_id;
      stack_size++;
      stack[stack_size] = box.left_id;
      stack_size++;
    }
  }

  return closestIntersection;
}

Ray cameraRay(vec2 uv, vec2 resolution) {
  vec2 sensor_size = vec2(resolution.x / resolution.y, 1);
  vec3 point_on_sensor = vec3((uv - 0.5) * sensor_size, -FOCAL_LENGTH);
  return Ray(vec3(0, 0, 5), normalize(point_on_sensor));
}

vec3 albedo(Intersection intersection) {
  return texture_data(intersection.material.texture_id, intersection.uv).rgb *
         intersection.material.base_color_factor.rgb;
}

vec3 emissiveness(Intersection intersection) {
  return intersection.material.emissive_color_factor.rgb;
}

vec3 blinn_phong(vec3 light_dir, vec3 normal, vec3 view_dir, float shininess,
                 vec3 light_color, vec3 diffuse_color, vec3 specular_color,
                 vec3 ambient_color) {
  vec3 half_dir = normalize(light_dir + view_dir);
  float intensity = max(dot(normal, light_dir), 0.0);
  float specular = pow(max(dot(normal, half_dir), 0.0), shininess);
  return light_color * (diffuse_color * intensity + specular_color * specular) +
         ambient_color * diffuse_color;
}

vec3 renderRay(Ray ray) {
  Intersection intersection = intersectScene(ray, -1);

  if (!intersection.happened) {
    return vec3(0);
  }

  return blinn_phong(vec3(1), intersection.normal, -ray.direction, 32.0,
                     vec3(1), albedo(intersection), vec3(1),
                     emissiveness(intersection));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;
  Ray ray = cameraRay(uv, iResolution.xy);
  vec3 col = renderRay(ray);

  float screenGamma = 2.2;
  fragColor = vec4(pow(col * 10, vec3(1.0 / screenGamma)), 1.0);
}

void main() { mainImage(FragColor, gl_FragCoord.xy); }
